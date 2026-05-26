import { useTranslation } from "@/hooks/useTranslation";
import Button from "./Button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmModalProps) {
  const { translate: t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-[24px]">
      <div className="bg-background border border-border w-full max-w-[400px] rounded-2xl flex flex-col p-[24px] gap-[16px] shadow-2xl relative text-left">
        <h3 className="text-[18px] font-semibold text-foreground">
          {t(title)}
        </h3>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          {t(description)}
        </p>
        <div className="flex gap-[12px] justify-end mt-[8px]">
          <button
            type="button"
            className="px-[16px] py-[8px] rounded-full hover:bg-muted text-[14px] font-medium text-foreground transition-colors shrink-0 disabled:opacity-50"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t(cancelLabel || "Cancelar")}
          </button>
          <Button
            type="button"
            className="primary bg-red-600 hover:bg-red-700 text-white font-medium text-[14px] px-[16px] py-[8px] rounded-full shrink-0"
            onClick={onConfirm}
            loading={isLoading}
          >
            {t(confirmLabel || "Eliminar")}
          </Button>
        </div>
      </div>
    </div>
  );
}
