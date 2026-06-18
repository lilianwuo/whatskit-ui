import { type MessageRow } from "@/supabase/client";

// ===================================================================
// Browser notifications + sound for new incoming messages.
// Only fires when the tab is not focused, to avoid being noisy.
// ===================================================================

/**
 * Ask the user for notification permission once. Safe to call multiple times;
 * it only prompts when the permission is still in the default state.
 */
export function requestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;

  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {
      // Ignore: the user dismissed the prompt.
    });
  }
}

// A short synthesized "ding" so we don't need to ship a binary audio asset.
let audioCtx: AudioContext | null = null;

function playSound(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!Ctx) return;

    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.value = 880;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // Ignore autoplay / unsupported-context errors.
  }
}

function messagePreview(message: MessageRow): string {
  const content = message.content;

  if (content.type === "text") return content.text;
  if (content.type === "file") return content.text || "📎";
  if (content.type === "data") return content.text || "📋";

  return "";
}

/**
 * Show a desktop notification (and play a sound) for a new incoming message,
 * but only when the tab is hidden / unfocused.
 */
export function notifyNewMessage(message: MessageRow, title: string): void {
  if (message.direction !== "incoming") return;

  // Skip when the user is already looking at the app.
  const focused =
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    document.hasFocus();

  if (focused) return;

  playSound();

  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const notification = new Notification(title, {
    body: messagePreview(message),
    icon: "/msnCloud.favicon.png",
    tag: message.conversation_id,
  });

  notification.onclick = () => {
    window.focus();

    if (window.location.pathname.startsWith("/conversations")) {
      window.location.hash = message.conversation_id;
    } else {
      window.location.href = "/conversations#" + message.conversation_id;
    }

    notification.close();
  };
}
