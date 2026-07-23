import { Check, ChevronDown, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, API_PROVIDER_MAP, CLI_PROVIDER_IDS, DEFAULT_PROVIDER } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * 顶栏模型快切:显示当前供应商正在用的模型,展开时拉取该供应商的真实可用模型
 * (GET /models),点选即保存为该供应商的默认模型 —— 解决"同一家聚合商下换模型
 * (如优云智算的 Claude ↔ GPT)要钻进配置页"的问题。
 * CLI provider(claude-code 等)用各自工具的登录态选模型,这里不显示。
 */
export function ModelSelect({ provider }: { provider: string }) {
  const { t } = useLanguage();
  const p = t.studio.providers;
  const eff = provider || DEFAULT_PROVIDER;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  // 远程清单下发的换代模型建议（providerOverrides）——比打包进前端的静态建议新
  const [remoteSuggestions, setRemoteSuggestions] = useState<string[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 当前供应商已保存的模型（切换供应商时刷新）
  useEffect(() => {
    setModels(null);
    setRemoteSuggestions(null);
    // model 为空 = 用引擎默认(按钮显示"默认模型"),不在前端猜具体默认值
    api
      .config()
      .then((c) => {
        setCurrent(c.providers[eff]?.model || "");
        setRemoteSuggestions(c.providers[eff]?.modelSuggestions ?? null);
      })
      .catch(() => setCurrent(""));
  }, [eff]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (CLI_PROVIDER_IDS.has(eff)) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && models === null) {
      // 顶栏快切只给「精简推荐集 + 当前模型」——不倒整个目录:聚合商 /models 常有上百个,
      // 还混着图像/视频/向量/TTS 等非对话模型(如 doubao-seedance、flux、bge),快切里没意义。
      // 完整目录去配置页的「获取模型列表」按供应商挑。没配 model 时就是这份「最新推荐」。
      const suggestions = remoteSuggestions ?? API_PROVIDER_MAP[eff]?.modelSuggestions ?? [];
      // 当前已选但不在推荐集里的模型也带上,避免下拉里看不到自己正在用的那个。
      setModels(current && !suggestions.includes(current) ? [current, ...suggestions] : suggestions);
    }
  };

  const pick = async (m: string) => {
    setSaving(true);
    setOpen(false);
    try {
      await api.saveConfig({ provider: eff, model: m });
      setCurrent(m);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        title={p.modelSelectTitle}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 text-sm text-foreground outline-none transition-colors hover:border-border"
      >
        <Cpu className="size-3.5 shrink-0 opacity-60" />
        <span className="max-w-[140px] truncate font-mono text-xs">{saving ? "…" : current || p.modelDefaultLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 max-h-[60vh] w-64 overflow-auto rounded-xl border border-border/70 bg-card p-1 shadow-xl">
          {(models ?? []).length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">{p.modelsEmpty}</div>
          ) : (
            (models ?? []).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => pick(m)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors hover:bg-muted",
                  m === current ? "bg-muted text-foreground" : "text-foreground",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{m}</span>
                {m === current && <Check className="size-3.5 shrink-0 text-gold" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
