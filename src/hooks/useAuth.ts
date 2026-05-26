import { supabase } from "@/supabase/client";
import useBoundStore, { reset as resetStore } from "@/stores/useBoundStore";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Route } from "@/routes/__root";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook to manage authentication state
 * Syncs Supabase auth session with the app's global store
 * Redirects to login when user logs out
 */
export function useAuth() {
  const setUser = useBoundStore((state) => state.ui.setUser);
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);

      // There is a SIGNED_IN event at tab focus. Checking if the user is
      // already logged in to avoid navigating to "/" or "/login".
      const loggedUser = useBoundStore.getState().ui.user;

      const user = session?.user ?? null;
      setUser(user);

      // Signed in
      if (!loggedUser && user && event === "SIGNED_IN") {
        const savedHash = sessionStorage.getItem("oauth_redirect_hash");
        sessionStorage.removeItem("oauth_redirect_hash");

        const targetPath = redirect ? redirect.split("#")[0] : "/";

        navigate({
          to: targetPath,
          hash: savedHash || undefined,
        });
      }

      // Signed out
      if (
        !user && !window.location.pathname.startsWith("/login")
      ) {
        // Clear all queries and reset store
        queryClient.clear();
        resetStore();

        navigate({
          to: "/login",
          search: { redirect: window.location.pathname + window.location.hash },
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [redirect]);
}
