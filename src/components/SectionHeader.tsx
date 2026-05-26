import { ArrowLeft, Trash2, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocation, useRouter } from "@tanstack/react-router";
import { LinkButton } from "./LinkButton";
import Spinner from "./Spinner";
import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

export default function SectionHeader({
  title,
  closeButton,
  onDelete,
  deleteDisabled,
  deleteDisabledReason,
  deleteLoading,
  deleteTitle,
  deleteDescription,
}: {
  title: string;
  closeButton?: boolean;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteDisabledReason?: string;
  deleteLoading?: boolean;
  deleteTitle?: string;
  deleteDescription?: string;
}) {
  const { translate: t } = useTranslation();
  const location = useLocation();
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const showBackButton = location.pathname.split("/").filter(Boolean).length >= 2;

  const handleConfirm = () => {
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <div className="header items-center truncate">
      {/* Back button */}
      {showBackButton && (
        closeButton ?
          (
            <button
              className="p-[8px] rounded-full hover:bg-muted mr-[8px] ml-[-8px]"
              title={t("Cerrar")}
              onClick={() => router.history.back()}
            >
              <X className="w-[24px] h-[24px]" />
            </button>
          )
          :
          (
            <LinkButton
              to=".."
              className="mr-[8px] ml-[-8px]"
              title={t("Volver")}
            >
              <ArrowLeft className="w-[24px] h-[24px]" />
            </LinkButton>
          )
      )}

      {/* Section title */}
      <div className={showBackButton ? "text-[16px]" : "text-[22px]"}>
        {t(title)}
      </div>

      {onDelete && (
        <>
          <button
            className="p-[8px] rounded-full hover:bg-muted ml-auto disabled:opacity-30 disabled:hover:bg-transparent"
            title={deleteDisabled && deleteDisabledReason
              ? `${t("Eliminar")} - ${deleteDisabledReason}`
              : t("Eliminar")}
            onClick={() => setIsConfirmOpen(true)}
            disabled={deleteDisabled || deleteLoading}
          >
            {deleteLoading ? <Spinner size={24} /> : <Trash2 className="w-[24px] h-[24px]" />}
          </button>

          <ConfirmModal
            isOpen={isConfirmOpen}
            title={deleteTitle || "¿Eliminar elemento?"}
            description={deleteDescription || "¿Estás seguro de que deseas eliminar este elemento? Esta acción no se puede deshacer."}
            onConfirm={handleConfirm}
            onCancel={() => setIsConfirmOpen(false)}
            isLoading={deleteLoading}
          />
        </>
      )}
    </div>
  );
}