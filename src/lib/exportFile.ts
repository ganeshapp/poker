import { isNative } from "@/engine/engineClient";

/** Save text to a file: native (writes to ~/Downloads) or browser blob download. */
export async function saveText(
  filename: string,
  contents: string,
): Promise<{ ok: boolean; message: string }> {
  if (isNative()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("save_text_file", { filename, contents });
      return { ok: true, message: `Saved to ${path}` };
    } catch (e) {
      return { ok: false, message: `Save failed: ${String(e)}` };
    }
  }
  try {
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, message: `Downloaded ${filename}` };
  } catch (e) {
    return { ok: false, message: `Download failed: ${String(e)}` };
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
