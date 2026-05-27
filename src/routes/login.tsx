import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { GoogleOutlined } from "@ant-design/icons";

type OAuthProvider = "google";

export const ALLOWED_EMAIL_DOMAIN = "pocante.org";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [message, setMessage] = useState("");
  const { redirect } = Route.useSearch();

  const { translate: t } = useTranslation();

  useEffect(() => {
    const denied = sessionStorage.getItem("login_domain_denied");
    if (denied) {
      setMessage(
        t(
          `Acesso restrito: utilize um e-mail @${ALLOWED_EMAIL_DOMAIN} para entrar.`,
        ),
      );
      sessionStorage.removeItem("login_domain_denied");
    }
  }, [t]);

  async function handleLogInWithOauth(provider: OAuthProvider) {
    let hashToPreserve = "";
    if (redirect && redirect.includes("#")) {
      hashToPreserve = redirect.substring(redirect.indexOf("#") + 1);
    } else if (window.location.hash) {
      hashToPreserve = window.location.hash.substring(1);
    }

    if (hashToPreserve) {
      sessionStorage.setItem("oauth_redirect_hash", hashToPreserve);
    }

    const cleanRedirect = redirect ? redirect.split("#")[0] : "/";

    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + cleanRedirect,
        queryParams: {
          hd: ALLOWED_EMAIL_DOMAIN,
        },
      },
    });
  }

  return (
    <div className="relative flex flex-col gap-9 justify-center items-center bg-background text-foreground h-dvh w-screen">
      <img
        src="/pocante-logo.png"
        alt="Rede Pocante"
        className="w-[200px] h-auto"
      />

      <div className="flex flex-col gap-3 w-[280px]">
        <button
          type="button"
          className="primary bg-primary hover:opacity-90 text-primary-foreground w-full border-none"
          onClick={() => handleLogInWithOauth("google")}
        >
          <GoogleOutlined /> {t("Entrar com Google")}
        </button>

        {message && (
          <div className="self-center text-destructive text-sm text-center">
            {message}
          </div>
        )}

        <div className="text-muted-foreground text-xs text-center mt-2">
          {t(`Acesso exclusivo para e-mails @${ALLOWED_EMAIL_DOMAIN}`)}
        </div>
      </div>

      <div className="absolute bottom-6 flex items-center gap-2 text-xs text-muted-foreground">
        {t("Powered by")}
        <img
          src="/msnCloud-logo.png"
          alt="msnCloud"
          className="h-4 w-auto"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <span
          className="font-semibold tracking-tight"
          style={{ color: "var(--brand-msncloud)" }}
        >
          msnCloud
        </span>
      </div>
    </div>
  );
}