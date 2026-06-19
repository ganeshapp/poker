import { isNative } from "@/engine/engineClient";

/** Open a URL in the system browser (desktop) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (e) {
      console.warn("opener plugin failed, falling back:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
