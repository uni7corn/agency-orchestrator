import { Eye, EyeOff, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, CUSTOM_PROVIDER_PRESETS } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * "添加自定义供应商"弹窗 —— 任意 OpenAI 兼容 endpoint,不用等 AO 加代码支持。
 * 预设图库只是点一下帮用户填 name+base_url 的快捷方式(纯数据,不是赞助商)。
 */
export function CustomProviderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useLanguage();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (preset: (typeof CUSTOM_PROVIDER_PRESETS)[number]) => {
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    if (!id.trim()) {
      const suggested = preset.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 30);
      if (/^[a-z]/.test(suggested)) setId(suggested);
    }
  };

  const submit = async () => {
    setError(null);
    if (!id.trim()) return setError(t.studio.providers.customProviderIdRequired);
    if (!name.trim()) return setError(t.studio.providers.customProviderNameRequired);
    if (!baseUrl.trim()) return setError(t.studio.providers.customProviderBaseUrlRequired);
    setSaving(true);
    try {
      await api.createCustomProvider({
        id: id.trim(),
        name: name.trim(),
        note: note.trim() || undefined,
        homepageUrl: homepageUrl.trim() || undefined,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-[58] flex items-stretch justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-none border border-border/70 bg-background shadow-2xl sm:max-h-[86vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] to-transparent px-5 py-4">
          <h3 className="flex items-center gap-2 font-bold">
            <Plus className="size-4 text-primary" />
            {t.studio.providers.addCustomProvider}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderPresetsLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    baseUrl === preset.baseUrl ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderIdLabel} *</label>
              <input value={id} onChange={(e) => setId(e.target.value)} placeholder={t.studio.providers.customProviderIdPlaceholder} className={inputCls} />
              <p className="mt-1 text-[11px] text-muted-foreground">{t.studio.providers.customProviderIdHint}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderNameLabel} *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.studio.providers.customProviderNamePlaceholder} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderBaseUrlLabel} *</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={t.studio.providers.customProviderBaseUrlPlaceholder} className={cn(inputCls, "font-mono")} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderApiKeyLabel}</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={cn(inputCls, "pr-9 font-mono")}
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderModelLabel}</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t.studio.providers.customProviderModelPlaceholder} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderHomepageLabel}</label>
              <input value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://example.com" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.studio.providers.customProviderNoteLabel}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {t.studio.providers.customProviderCancel}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t.studio.providers.customProviderSubmit}
          </Button>
        </div>
      </div>
    </div>
  );
}
