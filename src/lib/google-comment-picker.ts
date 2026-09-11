"use client";

interface PickerResult { action: string; docs?: { id: string }[] }
interface PickerBuilder {
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  addView(view: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void; dispose(): void };
}
type PickerWindow = Window & {
  gapi?: { load(name: string, callback: () => void): void };
  google?: { picker: { PickerBuilder: new () => PickerBuilder; ViewId: { DOCS: string }; Action: { PICKED: string; CANCEL: string } } };
};
let loading: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  const surface = window as PickerWindow;
  if (surface.google?.picker) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Google Picker did not load. Check popup/content blockers and try again.")), 15000);
    const load = () => surface.gapi?.load("picker", () => { window.clearTimeout(timeout); resolve(); });
    if (surface.gapi) { load(); return; }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = load;
    script.onerror = () => { window.clearTimeout(timeout); script.remove(); reject(new Error("Google Picker could not load.")); };
    document.head.appendChild(script);
  }).catch((error) => { loading = null; throw error; });
  return loading;
}

export async function chooseCommentFile(config: { accessToken: string; apiKey: string; appId: string }): Promise<string | null> {
  await loadPicker();
  const api = (window as PickerWindow).google?.picker;
  if (!api) throw new Error("Google Picker is unavailable.");
  return new Promise((resolve) => {
    const picker = new api.PickerBuilder().setDeveloperKey(config.apiKey).setAppId(config.appId)
      .setOAuthToken(config.accessToken).setOrigin(window.location.origin).addView(api.ViewId.DOCS)
      .setCallback((result) => {
        if (result.action === api.Action.PICKED || result.action === api.Action.CANCEL) {
          picker.dispose();
          resolve(result.action === api.Action.PICKED ? result.docs?.[0]?.id ?? null : null);
        }
      }).build();
    picker.setVisible(true);
  });
}
