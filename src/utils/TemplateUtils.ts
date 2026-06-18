import { type TemplateData, type TemplateMessage } from "@/supabase/client";

// Counts {{1}}, {{2}}, ... placeholders in a template text.
export function countVars(text?: string): number {
  return (text?.match(/\{\{\d+\}\}/g) || []).length;
}

/**
 * Builds the WhatsApp template message payload (components for Meta) and a
 * human-readable rendered body (used as the message `text`, shown in previews).
 *
 * Extracted from ChatFooter so it can be reused by the bulk dispatch feature.
 */
export function buildTemplateMessage({
  template: templateData,
  headVarValues = [],
  bodyVarValues = [],
}: {
  template: TemplateData;
  headVarValues?: string[];
  bodyVarValues?: string[];
}): { template: TemplateMessage["template"]; renderedBody: string } {
  const templateBody = templateData.components.find((c) => c.type === "BODY");
  const templateHead = templateData.components.find((c) => c.type === "HEADER");
  const templateFoot = templateData.components.find((c) => c.type === "FOOTER");
  const templateButtons = templateData.components.find(
    (c) => c.type === "BUTTONS",
  );

  const bodyVarCount = countVars(templateBody?.text);
  const headVarCount = countVars(templateHead?.text);

  let bodyContent = templateBody?.text || "";
  let headContent = templateHead?.text;

  const components: NonNullable<TemplateMessage["template"]["components"]> = [];

  if (headVarValues.length && headVarCount > 0) {
    let idx = 1;
    for (const value of headVarValues.slice(0, headVarCount)) {
      headContent = headContent?.replaceAll(`{{${idx}}}`, value);
      idx++;
    }
    components.push({
      type: "header",
      parameters: headVarValues
        .slice(0, headVarCount)
        .map((text) => ({ type: "text" as const, text })),
    });
  }

  if (bodyVarValues.length && bodyVarCount > 0) {
    let idx = 1;
    for (const value of bodyVarValues.slice(0, bodyVarCount)) {
      bodyContent = bodyContent.replaceAll(`{{${idx}}}`, value);
      idx++;
    }
    components.push({
      type: "body",
      parameters: bodyVarValues
        .slice(0, bodyVarCount)
        .map((text) => ({ type: "text" as const, text })),
    });
  }

  if (templateButtons?.buttons) {
    let idx = 0;
    for (const button of templateButtons.buttons) {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: idx.toString(),
        parameters: [
          {
            type: "payload",
            payload: button.text.toLowerCase().replaceAll(" ", "_"),
          },
        ],
      });
      idx++;
    }
  }

  const template: TemplateMessage["template"] = {
    name: templateData.name,
    language: {
      code: templateData.language,
      policy: "deterministic" as const,
    },
  };

  if (components.length) {
    template.components = components;
  }

  // Build rendered text for display (markdown, same convention as ChatFooter).
  const renderedParts: string[] = [];
  if (headContent) renderedParts.push(`*${headContent}*`);
  renderedParts.push(bodyContent);
  if (templateFoot?.text) renderedParts.push(`_${templateFoot.text}_`);
  const renderedBody = renderedParts.join("\n\n");

  return { template, renderedBody };
}
