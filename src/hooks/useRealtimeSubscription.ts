import {
  type ConversationRow,
  type MessageRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { useEffect } from "react";
import { formatPhoneNumber } from "@/utils/FormatUtils";
import {
  notifyNewMessage,
  requestNotificationPermission,
} from "@/utils/NotificationUtils";

export const useRealtimeSubscription = () => {
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );
  const pushMessages = useBoundStore((state) => state.chat.pushMessages);

  useEffect(() => {
    if (!activeOrgId) return;

    // Ask once for permission so we can notify about new messages.
    requestNotificationPermission();

    const filter = `organization_id=eq.${activeOrgId}`;

    const channel = supabase
      .channel("rialtaim")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter,
        },
        (payload) => {
          // TODO: https://github.com/supabase/supabase/issues/32817
          if (payload.table !== "conversations") return;

          const conversation = payload.new as ConversationRow;

          pushConversations([conversation]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter,
        },
        (payload) => {
          // TODO: https://github.com/supabase/supabase/issues/32817
          if (payload.table !== "messages") return;

          const message = payload.new as MessageRow;

          pushMessages([message]);

          // Notify about new incoming messages (only when the tab is unfocused).
          if (message.direction === "incoming") {
            const conversation = useBoundStore
              .getState()
              .chat.conversations.get(message.conversation_id);

            const title =
              conversation?.name ||
              (conversation?.contact_address
                ? formatPhoneNumber(conversation.contact_address)
                : "msnCloud");

            notifyNewMessage(message, title);
          }

          //updateMessagesCache([message]);
        },
      );

    channel.subscribe();

    // Cleanup subscription on unmount
    return () => {
      channel.unsubscribe();
    };
  }, [activeOrgId]);
};
