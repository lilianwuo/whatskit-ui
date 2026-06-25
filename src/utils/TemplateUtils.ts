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
export type HeaderMedia = {
  type: "image" | "video" | "document";
  link: string;
  filename?: string;
};

/**
 * Extracts the header media (image/video/document link) from a stored template
 * message's `data`, so the conversation can render the media that was sent.
 */
export function templateHeaderMedia(data: unknown): HeaderMedia | undefined {
  const components = (data as { components?: unknown[] })?.components;
  if (!Array.isArray(components)) return undefined;

  const header = components.find(
    (c) => (c as { type?: string })?.type === "header",
  ) as { parameters?: unknown[] } | undefined;

  const p = header?.parameters?.[0] as
    | {
        type?: string;
        image?: { link?: string };
        video?: { link?: string };
        document?: { link?: string; filename?: string };
      }
    | undefined;

  if (!p) return undefined;
  if (p.type === "image" && p.image?.link)
    return { type: "image", link: p.image.link };
  if (p.type === "video" && p.video?.link)
    return { type: "video", link: p.video.link };
  if (p.type === "document" && p.document?.link)
    return {
      type: "document",
      link: p.document.link,
      filename: p.document.filename,
    };

  return undefined;
}

export function buildTemplateMessage({
  template: templateData,
  headVarValues = [],
  bodyVarValues = [],
  headerMedia,
}: {
  template: TemplateData;
  headVarValues?: string[];
  bodyVarValues?: string[];
  headerMedia?: HeaderMedia;
}): { template: TemplateMessage["template"]; renderedBody: string } {
  const templateBody = templateData.components.find((c) => c.type === "BODY");
  const templateHead = templateData.components.find((c) => c.type === "HEADER");
  const templateFoot = templateData.components.find((c) => c.type === "FOOTER");

  const bodyVarCount = countVars(templateBody?.text);
  const headVarCount = countVars(templateHead?.text);

  let bodyContent = templateBody?.text || "";
  let headContent = templateHead?.text;

  const components: NonNullable<TemplateMessage["template"]["components"]> = [];

  // Media header (image/video/document): Meta needs the header component with a
  // media parameter (public link). A header is either text or media, not both.
  if (headerMedia?.link) {
    const parameter =
      headerMedia.type === "image"
        ? { type: "image" as const, image: { link: headerMedia.link } }
        : headerMedia.type === "video"
          ? { type: "video" as const, video: { link: headerMedia.link } }
          : {
              type: "document" as const,
              document: {
                link: headerMedia.link,
                ...(headerMedia.filename
                  ? { filename: headerMedia.filename }
                  : {}),
              },
            };

    components.push({ type: "header", parameters: [parameter] });
  }

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

  // Note: we intentionally do NOT emit button components. Static URL / phone
  // buttons must not be sent as parameters (Meta rejects with #132000/#132001),
  // and quick-reply buttons don't require parameters to render. Dynamic URL /
  // copy-code buttons would need dedicated handling (not supported yet).

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
