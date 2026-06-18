import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Select, Progress, Alert } from "antd";
import { Upload, Send, LoaderCircle } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import useBoundStore from "@/stores/useBoundStore";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import { useTemplates } from "@/queries/useTemplates";
import { useCurrentAgent } from "@/queries/useAgents";
import { buildTemplateMessage, countVars } from "@/utils/TemplateUtils";
import {
  newMessage,
  pushMessageToDb,
  pushMessageToStore,
} from "@/utils/MessageUtils";
import { pushConversationToDb } from "@/utils/ConversationUtils";
import { normalizePhoneNumber, formatPhoneNumber } from "@/utils/FormatUtils";
import {
  supabase,
  type ConversationRow,
  type TemplateData,
} from "@/supabase/client";

export const Route = createFileRoute("/_auth/broadcast/")({
  component: Broadcast,
});

type ParsedRow = Record<string, string>;

const PHONE_RE = /tel|phone|celular|whats|n[uú]mero|numero|number|fone/i;
const NAME_RE = /nome|name/i;
const BATCH_SIZE = 10;

// Mirrors useCreateContact: create a contact and link the address.
async function createContactWithAddress(
  orgId: string,
  address: string,
  name: string,
) {
  const { data: contact } = await supabase
    .from("contacts")
    .insert({ name, organization_id: orgId })
    .select()
    .single()
    .throwOnError();

  await supabase
    .from("contacts_addresses")
    .upsert(
      [
        {
          organization_id: orgId,
          address,
          service: "whatsapp" as const,
          contact_id: contact.id,
        },
      ],
      { onConflict: "organization_id, address", defaultToNull: false },
    )
    .throwOnError();
}

function Broadcast() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const { data: agent } = useCurrentAgent();
  const { data: addresses } = useOrganizationsAddresses();

  const whatsappAddresses = useMemo(
    () => (addresses || []).filter((a) => a.service === "whatsapp"),
    [addresses],
  );

  const [orgAddress, setOrgAddress] = useState<string | undefined>(undefined);
  const effectiveOrgAddress = orgAddress ?? whatsappAddresses[0]?.address;

  const { data: templates, isLoading: templatesLoading } =
    useTemplates(effectiveOrgAddress);
  const approvedTemplates = useMemo(
    () => (templates || []).filter((t) => t.status === "APPROVED"),
    [templates],
  );

  const [templateName, setTemplateName] = useState<string | undefined>(
    undefined,
  );
  const selectedTemplate: TemplateData | undefined = approvedTemplates.find(
    (t) => t.name === templateName,
  );

  const [fileName, setFileName] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [result, setResult] = useState<{ sent: number; errors: number } | null>(
    null,
  );

  // Column detection
  const phoneCol = columns.find((c) => PHONE_RE.test(c)) ?? columns[0];
  const nameCol = columns.find((c) => NAME_RE.test(c));
  const varColumns = columns.filter((c) => c !== phoneCol && c !== nameCol);

  // Template variable counts
  const headText = selectedTemplate?.components.find(
    (c) => c.type === "HEADER",
  )?.text;
  const bodyText = selectedTemplate?.components.find(
    (c) => c.type === "BODY",
  )?.text;
  const headVarCount = countVars(headText);
  const bodyVarCount = countVars(bodyText);

  // Valid + deduplicated recipients
  const validRows = useMemo(() => {
    const seen = new Set<string>();
    const out: { address: string; row: ParsedRow }[] = [];

    for (const row of rows) {
      const raw = phoneCol ? row[phoneCol] : "";
      const digits = String(raw ?? "").replace(/\D/g, "");
      if (digits.length < 10) continue;

      const address = normalizePhoneNumber(String(raw));
      if (seen.has(address)) continue;

      seen.add(address);
      out.push({ address, row });
    }

    return out;
  }, [rows, phoneCol]);

  const invalidCount = rows.length - validRows.length;

  async function handleFile(file: File) {
    setResult(null);
    setProgress({ done: 0, total: 0, errors: 0 });
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: "" });

      setFileName(file.name);
      setRows(parsed);
      setColumns(parsed.length ? Object.keys(parsed[0]) : []);
    } catch {
      setFileName("");
      setRows([]);
      setColumns([]);
    }
  }

  function findConversation(
    address: string,
  ): ConversationRow | undefined {
    const conversations = useBoundStore.getState().chat.conversations.values();
    for (const conv of conversations) {
      if (
        conv.organization_address === effectiveOrgAddress &&
        conv.contact_address === address
      ) {
        return conv;
      }
    }
    return undefined;
  }

  async function processRecipient({
    address,
    row,
  }: {
    address: string;
    row: ParsedRow;
  }) {
    if (!orgId || !effectiveOrgAddress || !selectedTemplate) return;

    const name = nameCol ? String(row[nameCol] ?? "").trim() : "";

    // 1. Save contact (best-effort; conversation.name still covers display).
    if (name) {
      try {
        await createContactWithAddress(orgId, address, name);
      } catch {
        // Address may already be linked to a contact — ignore.
      }
    }

    // 2. Ensure a conversation exists (avoid duplicates).
    let conv = findConversation(address);
    if (!conv) {
      conv = {
        id: crypto.randomUUID(),
        organization_id: orgId,
        organization_address: effectiveOrgAddress,
        contact_address: address,
        service: "whatsapp",
        name: name || null,
      } as ConversationRow;

      await pushConversationToDb(conv);
      useBoundStore.getState().chat.pushConversations([conv]);
    }

    // 3. Build the template message (mail-merge per row) and dispatch it.
    const headVarValues = varColumns
      .slice(0, headVarCount)
      .map((c) => String(row[c] ?? ""));
    const bodyVarValues = varColumns
      .slice(headVarCount, headVarCount + bodyVarCount)
      .map((c) => String(row[c] ?? ""));

    const { template, renderedBody } = buildTemplateMessage({
      template: selectedTemplate,
      headVarValues,
      bodyVarValues,
    });

    const record = newMessage(
      conv,
      "outgoing",
      {
        version: "1",
        type: "data",
        kind: "template",
        data: template,
        text: renderedBody,
      },
      agent?.id,
    );

    pushMessageToStore(record);
    await pushMessageToDb(record);
  }

  async function handleDispatch() {
    if (!orgId || !effectiveOrgAddress || !selectedTemplate) return;

    setSending(true);
    setResult(null);

    let done = 0;
    let errors = 0;
    setProgress({ done: 0, total: validRows.length, errors: 0 });

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const slice = validRows.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(slice.map(processRecipient));

      for (const r of settled) if (r.status === "rejected") errors++;
      done += slice.length;
      setProgress({ done, total: validRows.length, errors });

      // Small pause between batches to be gentle with rate limits.
      if (i + BATCH_SIZE < validRows.length) {
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    setResult({ sent: done - errors, errors });
    setSending(false);
  }

  const canDispatch =
    !!effectiveOrgAddress &&
    !!selectedTemplate &&
    validRows.length > 0 &&
    !sending;

  return (
    <>
      <SectionHeader title="Disparo em massa" />

      <div className="flex-1 overflow-y-auto px-[20px] pb-[24px] flex flex-col gap-[20px] text-foreground">
        {/* Origin number */}
        <div>
          <label className="block text-[13px] text-muted-foreground mb-[6px]">
            Número de origem (WhatsApp)
          </label>
          <Select
            className="w-full"
            placeholder="Selecione o número"
            value={effectiveOrgAddress}
            onChange={(v) => {
              setOrgAddress(v);
              setTemplateName(undefined);
            }}
            options={whatsappAddresses.map((a) => ({
              value: a.address,
              label: a.extra?.verified_name
                ? `${a.extra.verified_name} (${formatPhoneNumber(a.address)})`
                : formatPhoneNumber(a.address),
            }))}
            notFoundContent="Nenhum número WhatsApp configurado"
          />
        </div>

        {/* Template */}
        <div>
          <label className="block text-[13px] text-muted-foreground mb-[6px]">
            Modelo aprovado
          </label>
          <Select
            className="w-full"
            placeholder={
              templatesLoading ? "Carregando modelos..." : "Selecione o modelo"
            }
            loading={templatesLoading}
            value={templateName}
            onChange={setTemplateName}
            disabled={!effectiveOrgAddress}
            options={approvedTemplates.map((t) => ({
              value: t.name,
              label: `${t.name} (${t.language})`,
            }))}
            notFoundContent="Nenhum modelo aprovado"
          />
          {selectedTemplate && bodyText && (
            <div className="mt-[8px] p-[10px] rounded-[8px] bg-muted text-[13px] whitespace-pre-wrap">
              {bodyText}
            </div>
          )}
        </div>

        {/* Spreadsheet upload */}
        <div>
          <label className="block text-[13px] text-muted-foreground mb-[6px]">
            Planilha de contatos (.xlsx ou .csv)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button
            icon={<Upload className="w-[16px] h-[16px]" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {fileName || "Escolher arquivo"}
          </Button>
          <p className="mt-[6px] text-[12px] text-muted-foreground">
            A primeira linha deve conter os títulos das colunas. Use uma coluna
            de telefone (ex.: <code>telefone</code>) e, opcionalmente,{" "}
            <code>nome</code>. Demais colunas preenchem as variáveis do modelo
            na ordem ({"{{1}}"}, {"{{2}}"}…).
          </p>
        </div>

        {/* Parsed preview */}
        {columns.length > 0 && (
          <div className="text-[13px]">
            <div className="mb-[6px] text-muted-foreground">
              Coluna de telefone:{" "}
              <span className="text-foreground font-medium">{phoneCol}</span>
              {nameCol && (
                <>
                  {" · "}nome:{" "}
                  <span className="text-foreground font-medium">{nameCol}</span>
                </>
              )}
              {varColumns.length > 0 && (
                <>
                  {" · "}variáveis:{" "}
                  <span className="text-foreground font-medium">
                    {varColumns.join(", ")}
                  </span>
                </>
              )}
            </div>
            <div className="mb-[10px]">
              <span className="text-green-600 font-medium">
                {validRows.length}
              </span>{" "}
              válidos
              {invalidCount > 0 && (
                <span className="text-muted-foreground">
                  {" · "}
                  {invalidCount} ignorados (sem telefone / duplicados)
                </span>
              )}
            </div>
            <div className="max-h-[180px] overflow-auto border border-border rounded-[8px]">
              <table className="w-full text-[12px]">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="text-left px-[8px] py-[4px]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {columns.map((c) => (
                        <td key={c} className="px-[8px] py-[4px] truncate">
                          {String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Progress / result */}
        {sending && (
          <div>
            <Progress
              percent={
                progress.total
                  ? Math.round((progress.done / progress.total) * 100)
                  : 0
              }
            />
            <div className="text-[13px] text-muted-foreground">
              Enviando {progress.done}/{progress.total}…
            </div>
          </div>
        )}

        {result && (
          <Alert
            type={result.errors ? "warning" : "success"}
            showIcon
            message={`Disparo concluído: ${result.sent} enviados${
              result.errors ? `, ${result.errors} com erro` : ""
            }.`}
          />
        )}

        {/* Dispatch */}
        <Button
          type="primary"
          size="large"
          disabled={!canDispatch}
          onClick={handleDispatch}
          icon={
            sending ? (
              <LoaderCircle className="w-[16px] h-[16px] animate-spin" />
            ) : (
              <Send className="w-[16px] h-[16px]" />
            )
          }
        >
          {sending
            ? "Enviando…"
            : `Disparar para ${validRows.length} contato(s)`}
        </Button>
      </div>
    </>
  );
}
