import {
  type ConversationRow,
  type IncomingMessage,
  type InternalMessage,
  type MessageInsert,
  type MessageRow,
  type OutgoingMessage,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";

export function newMessage(
  conv: ConversationRow,
  direction: "incoming" | "outgoing" | "internal",
  content: OutgoingMessage | IncomingMessage | InternalMessage,
  agentId?: string,
  file?: File,
): MessageInsert {
  // If a file is provided, update the FilePart with file metadata
  if (file && content.type === "file") {
    const fileUri =
      `internal://media/organizations/${conv.organization_id}/attachments/${crypto.randomUUID()}`;

    content.file = {
      ...content.file,
      uri: fileUri,
      mime_type: file.type,
      size: file.size,
      name: file.name,
    };
  }

  // Build the insert object based on direction
  // TypeScript needs help with the union types, so we use type assertions
  return {
    id: crypto.randomUUID(),
    organization_id: conv.organization_id,
    conversation_id: conv.id,
    service: conv.service,
    organization_address: conv.organization_address,
    contact_address: conv.contact_address,
    direction,
    content,
    agent_id: agentId || null,
  } as MessageInsert;
}

/**
 * Best human-readable text for a "data" message (button reply, interactive
 * reply, template, etc.), so the UI shows a friendly label instead of raw JSON.
 */
export function dataMessageText(content: {
  type: string;
  kind?: string;
  text?: string;
  data?: unknown;
}): string | undefined {
  if (content.type !== "data") return undefined;
  if (content.text) return content.text;

  const data = content.data as Record<string, unknown> | undefined;

  if (content.kind === "button") {
    return (data?.text as string) || undefined;
  }
  if (content.kind === "interactive") {
    const br = data?.button_reply as { title?: string } | undefined;
    const lr = data?.list_reply as { title?: string } | undefined;
    return br?.title || lr?.title;
  }
  if (content.kind === "template") {
    return (data?.name as string) || undefined;
  }
  return undefined;
}

export function pushMessageToStore(record: MessageInsert) {
  // Let's provide a temporary timestamp so the message can be sorted.
  // We do not trust the client's time for setting the `timestamp` and `updated_at` fields. That's why.
  const now = new Date().toISOString();

  // Create the optimistic record with temporary values
  const optimisticRecord = {
    ...record,
    timestamp: now,
    created_at: now,
    updated_at: now, // important because of timestamp <= updated_at filter in chatSlice.ts
    status: { pending: now },
  };

  // TODO: optimistic insert (MessageInsert) lacks some fields that the store considers as present (MessageRow) - cabra 2024/07/28
  useBoundStore.getState().chat.pushMessages([optimisticRecord as MessageRow]);
}

export async function pushMessageToDb(
  record: MessageInsert,
  ignoreDuplicates = true,
) {
  const insertQuery = await supabase.from("messages").upsert(record, {
    ignoreDuplicates,
  });

  if (insertQuery.error) {
    throw insertQuery.error;
  }
}
