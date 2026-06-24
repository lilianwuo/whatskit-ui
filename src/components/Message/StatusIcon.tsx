import { type OutgoingStatus } from "@/supabase/client";
import { getHighestStatus, getStatusIcon } from "@/utils/MessageStatusUtils";

export default function StatusIcon(status: OutgoingStatus) {
  const highest = getHighestStatus(status);
  const { icon, color } = getStatusIcon(highest);

  // For failed messages, surface the WhatsApp/Meta error as a tooltip.
  // Errors may be flat (webhook status) or nested under `error` (send response).
  const errorText =
    highest === "failed" && status?.errors?.length
      ? status.errors
          .map((e) => {
            const err = e as {
              message?: string;
              error_data?: { details?: string };
              error?: { message?: string; error_data?: { details?: string } };
            };
            return (
              err.error?.message ||
              err.error?.error_data?.details ||
              err.message ||
              err.error_data?.details
            );
          })
          .filter(Boolean)
          .join(" • ")
      : undefined;

  const svg = (
    <svg
      className={
        `w-[16px] ml-[3px] ${color}` +
        (icon === "clock" ? " h-[15px]" : " h-[11px]")
      }
    >
      <use href={`/icons.svg#msg-${icon}`} />
    </svg>
  );

  if (errorText) {
    return (
      <span title={errorText} className="inline-flex cursor-help">
        {svg}
      </span>
    );
  }

  return svg;
}
