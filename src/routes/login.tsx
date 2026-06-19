import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { GoogleOutlined } from "@ant-design/icons";

type OAuthProvider = "google";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { redirect } = Route.useSearch();

  const { translate: t } = useTranslation();

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
      },
    });
  }

  return (
    <div className="relative flex flex-col gap-9 justify-center items-center bg-background text-foreground h-dvh w-screen">
      <img
        src="/msnCloud-full.png"
        alt="msnCloud"
        className="w-[220px] h-auto"
      />

      <div className="flex flex-col gap-3 w-[280px]">
        <button
          type="button"
          className="primary bg-primary hover:opacity-90 text-primary-foreground w-full border-none"
          onClick={() => handleLogInWithOauth("google")}
        >
          <GoogleOutlined /> {t("Entrar com Google")}
        </button>
      </div>
    </div>
  );
}
