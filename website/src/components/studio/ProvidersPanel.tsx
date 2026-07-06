import { Check, ChevronDown, Cloud, Eye, EyeOff, Loader2, MonitorCog, Plug, Plus, Sparkles, Terminal, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, API_PROVIDERS, CLI_RELAY_GLOBAL_WRITE, CLI_RELAY_SUPPORT, DEFAULT_PROVIDER, PROVIDER_LABELS, type ApiProviderMeta, type ConfigResponse } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { CustomProviderModal } from "./CustomProviderModal";

// provider 列表/模型建议的唯一来源是 lib/studio.ts 的 API_PROVIDERS —— 新增一家 provider 只用改那一处。
const API_META = API_PROVIDERS;
const MODEL_SUGGESTIONS: Record<string, string[]> = {
  ...Object.fromEntries(API_PROVIDERS.map((p) => [p.id, p.modelSuggestions ?? []])),
  ollama: ["llama3", "qwen2.5", "qwen2.5:14b", "deepseek-r1"],
};

type TestState = { status: "idle" | "testing" | "ok" | "fail"; msg?: string };

function ActiveButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  return on ? (
    <span className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-semibold text-primary">
      <Check className="size-3.5" /> {t.studio.providers.inUse}
    </span>
  ) : (
    <Button size="sm" variant="outline" onClick={onClick}>
      {t.studio.providers.setActive}
    </Button>
  );
}

function useTest(provider: string, enabled: boolean) {
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const run = async () => {
    setTest({ status: "testing" });
    try {
      const r = await api.testProvider(provider);
      setTest(r.ok ? { status: "ok", msg: r.note || `${r.latencyMs}ms` } : { status: "fail", msg: r.error });
    } catch (e: any) {
      setTest({ status: "fail", msg: e?.message });
    }
  };
  return { test, run, enabled };
}

function TestRow({ provider, enabled }: { provider: string; enabled: boolean }) {
  const { t } = useLanguage();
  const { test, run } = useTest(provider, enabled);
  return (
    <>
      <Button size="sm" variant="outline" onClick={run} disabled={!enabled || test.status === "testing"}>
        {test.status === "testing" ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
        {t.studio.providers.testConnection}
      </Button>
      {test.status === "ok" && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
          <Check className="size-3.5" /> {t.studio.providers.ok} · {test.msg}
        </span>
      )}
      {test.status === "fail" && (
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-red-500">
          <XCircle className="size-3.5 shrink-0" /> <span className="truncate">{test.msg}</span>
        </span>
      )}
    </>
  );
}

function ApiCard({
  meta,
  status,
  active,
  onSetActive,
  onChanged,
  onDelete,
}: {
  meta: (typeof API_META)[number];
  status?: ConfigResponse["providers"][string];
  active: boolean;
  onSetActive: () => void;
  onChanged: () => void;
  /** 只有自定义供应商才传：删除整条（元数据 + 已存的 key），跟"清空 key"不是一回事。 */
  onDelete?: () => void;
}) {
  const { t } = useLanguage();
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? "");
  const [model, setModel] = useState(status?.model ?? "");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaseUrl(status?.baseUrl ?? "");
    setModel(status?.model ?? "");
  }, [status?.baseUrl, status?.model]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ provider: meta.id, apiKey: key, baseUrl, model });
      setKey("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };
  const clear = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ provider: meta.id, apiKey: "" });
      setKey("");
      setBaseUrl("");
      setModel("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  // 赞助商 CompShare / APINEBULA / RootFlowAI 的名称/说明走 i18n（英文站不露中文）；其余 provider 是品牌名+URL，语言无关
  const displayName = meta.id === "compshare" ? t.studio.providers.compshareName
    : meta.id === "apinebula" ? t.studio.providers.apinebulaName
    : meta.id === "rootflowai" ? t.studio.providers.rootflowaiName
    : meta.name;
  const displayHint = meta.id === "compshare" ? t.studio.providers.compshareHint
    : meta.id === "apinebula" ? t.studio.providers.apinebulaHint
    : meta.id === "rootflowai" ? t.studio.providers.rootflowaiHint
    : meta.hint.replace("{etc}", t.studio.providers.etc);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/60 p-5",
        meta.flagship
          ? "border-gold/60 bg-gold/[0.04] ring-1 ring-gold/30"
          : active
            ? "border-primary/60"
            : "border-border/70",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{displayName}</span>
          {meta.flagship && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">
              <Sparkles className="size-3" /> {t.studio.providers.flagshipTag}
            </span>
          )}
          {meta.sponsor && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t.studio.providers.sponsorTag}
            </span>
          )}
        </div>
        <ActiveButton on={active} onClick={onSetActive} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {displayHint} · {status?.hasKey ? <span className="text-emerald-500">{t.studio.providers.keySet}{status.fromEnv ? t.studio.providers.fromEnv : ""}</span> : t.studio.providers.keyNotSet}
      </p>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={status?.hasKey ? t.studio.providers.pasteNewKey : t.studio.providers.pasteKey}
            className="h-10 w-full rounded-xl border border-border/70 bg-background px-3 pr-9 font-mono text-sm outline-none focus:border-primary/50"
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button onClick={save} disabled={saving || (!key.trim() && baseUrl === (status?.baseUrl ?? "") && model === (status?.model ?? ""))}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : t.studio.providers.save}
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={t.studio.providers.baseUrlPlaceholder} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/50" />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={t.studio.providers.modelPlaceholder}
          autoComplete="off"
          className="h-9 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/50"
        />
      </div>
      {/* 常用模型「胶囊」：点一下填入,也可在上面手敲。主题一致,不用原生 datalist(深色下很丑)。 */}
      {(MODEL_SUGGESTIONS[meta.id] ?? []).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MODEL_SUGGESTIONS[meta.id].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                model === m ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <TestRow provider={meta.id} enabled={!!status?.hasKey} />
        {status?.hasKey && !status.fromEnv && (
          <button onClick={clear} className={cn("text-xs text-muted-foreground hover:text-red-500", !onDelete && "ml-auto")}>
            {t.studio.providers.clear}
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => { if (window.confirm(t.studio.providers.customProviderDeleteConfirm)) onDelete(); }}
            className="ml-auto text-muted-foreground hover:text-red-500"
            title={t.studio.providers.customProviderDeleteConfirm}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * claude-code / gemini-cli / codex-cli 卡片里的可选"自定义中转"折叠区。这些官方 CLI
 * 都支持把请求指向第三方中转服务（如 Cubence），不登录官方账号也能用 —— 但需要先自己
 * 装好 CLI 本身（中转只是换了请求目的地，不代替 CLI 安装）。
 * codex-cli 特殊：没有环境变量覆盖，只能写用户 home 目录下的 ~/.codex/config.toml +
 * auth.json（全局生效，会影响 AO 之外直接用 codex 命令行的行为），保存前会有明确提示。
 */
function CliRelayFields({ providerId, status, onChanged }: { providerId: string; status?: ConfigResponse["providers"][string]; onChanged: () => void }) {
  const { t } = useLanguage();
  const isGlobalWrite = CLI_RELAY_GLOBAL_WRITE.has(providerId);
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState<string[] | null>(null);

  useEffect(() => {
    setBaseUrl(status?.baseUrl ?? "");
  }, [status?.baseUrl]);

  const save = async () => {
    if (isGlobalWrite && !window.confirm(t.studio.providers.cliRelayGlobalConfirm)) return;
    setSaving(true);
    try {
      const r = await api.saveConfig({ provider: providerId, apiKey: token, baseUrl });
      setToken("");
      setBackups(r.backups && r.backups.length > 0 ? r.backups : null);
      onChanged();
    } finally {
      setSaving(false);
    }
  };
  const clear = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ provider: providerId, apiKey: "" });
      setToken("");
      setBaseUrl("");
      setBackups(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  if (!open && !status?.hasKey) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className="size-3" /> {t.studio.providers.cliRelayToggle}
      </button>
    );
  }

  return (
    <div className="mt-2 border-t border-border/60 pt-2" onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] text-muted-foreground">
        {status?.hasKey ? (
          <span className="text-emerald-500">{t.studio.providers.cliRelaySet}</span>
        ) : (
          t.studio.providers.cliRelayHint
        )}
      </p>
      {isGlobalWrite && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" /> {t.studio.providers.cliRelayGlobalWarning}
        </p>
      )}
      {backups && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t.studio.providers.cliRelayBackedUp} {backups.map((b) => b.split("/").pop()).join(", ")}
        </p>
      )}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={t.studio.providers.cliRelayBaseUrlPlaceholder}
          className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus:border-primary/50"
        />
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t.studio.providers.cliRelayTokenPlaceholder}
            className="h-8 w-full rounded-lg border border-border/70 bg-background px-2 pr-7 font-mono text-xs outline-none focus:border-primary/50"
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={save}
          disabled={saving || (!token.trim() && baseUrl === (status?.baseUrl ?? ""))}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : t.studio.providers.save}
        </Button>
        {status?.hasKey && (
          <button onClick={clear} className="text-xs text-muted-foreground hover:text-red-500">
            {t.studio.providers.clear}
          </button>
        )}
      </div>
    </div>
  );
}

function OllamaCard({ status, active, onSetActive, onChanged }: { status?: ConfigResponse["providers"][string]; active: boolean; onSetActive: () => void; onChanged: () => void }) {
  const { t } = useLanguage();
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? "http://localhost:11434");
  const [model, setModel] = useState(status?.model ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaseUrl(status?.baseUrl ?? "http://localhost:11434");
    setModel(status?.model ?? "");
  }, [status?.baseUrl, status?.model]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ provider: "ollama", baseUrl, model });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-card/60 p-5", active ? "border-primary/60" : "border-border/70")}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Ollama</span>
        <ActiveButton on={active} onClick={onSetActive} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t.studio.providers.ollamaDescBeforeServe}<code className="rounded bg-muted px-1 py-0.5">ollama serve</code>{t.studio.providers.ollamaDescBeforePull}<code className="rounded bg-muted px-1 py-0.5">ollama pull llama3</code>{t.studio.providers.ollamaDescAfter}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434" className="h-9 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/50" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t.studio.providers.ollamaModelPlaceholder} className="h-9 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/50" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : t.studio.providers.save}
        </Button>
        <TestRow provider="ollama" enabled />
      </div>
    </div>
  );
}

export function ProvidersPanel({ active, onSetActive }: { active: string; onSetActive: (p: string) => void }) {
  const { t } = useLanguage();
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const load = () => {
    setFailed(false);
    // 演示站没有引擎后端：config 拉不到时退回空配置，照样展示供应商卡片（可看、可填，只是无法实际运行 / 测试），不再弹「加载失败」
    api.config().then(setCfg).catch(() => setCfg({ providers: {}, cli: [], defaultProvider: "" }));
  };
  useEffect(load, []);

  const eff = active || DEFAULT_PROVIDER;
  // cli 项兼容新旧两种形态：{name,installed} 或裸字符串
  const cliItems = (cfg?.cli ?? []).map((c) => (typeof c === "string" ? { name: c, installed: false } : c));
  const installedCli = cfg?.installedCli ?? cliItems.filter((c) => c.installed).map((c) => c.name);
  // 推荐零配置路径：本机已装 CLI、且当前选中的 provider 既不是它、又没配 key 时，给一条横幅引导一键切换。
  const activeHasKey = !!cfg?.providers?.[eff]?.hasKey;
  const showRecommend = installedCli.length > 0 && !installedCli.includes(eff) && !activeHasKey;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {t.studio.providers.privacyBeforeLocal}<strong>{t.studio.providers.privacyLocal}</strong>{t.studio.providers.privacyBeforeCode}<code className="rounded bg-muted px-1 py-0.5">.local/web-keys.json</code>{t.studio.providers.privacyAfter}
      </div>

      {/* 零配置推荐：探测到本机已装订阅制 CLI 时，引导一键切换，绕开 key 墙 */}
      {showRecommend && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.07] px-4 py-3 text-sm">
          <span className="text-foreground">
            {t.studio.providers.recommendPre}
            <strong>{PROVIDER_LABELS[installedCli[0]] ?? installedCli[0]}</strong>
            {t.studio.providers.recommendPost}
          </span>
          <Button size="sm" className="ml-auto" onClick={() => onSetActive(installedCli[0])}>
            {t.studio.providers.recommendUse}
          </Button>
        </div>
      )}

      {failed ? (
        <p className="py-10 text-center text-sm text-red-500">{t.studio.providers.loadFailed}</p>
      ) : !cfg ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t.studio.providers.loading}
        </div>
      ) : (
        <>
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Cloud className="size-4 text-primary" /> {t.studio.providers.cloudApiTitle} <span className="font-normal text-muted-foreground">· {t.studio.providers.cloudApiHint}</span>
            </h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {API_META.map((m) => (
                <ApiCard key={m.id} meta={m} status={cfg.providers[m.id]} active={eff === m.id} onSetActive={() => onSetActive(m.id)} onChanged={load} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-bold">
              <span className="flex items-center gap-2">
                <Plus className="size-4 text-primary" /> {t.studio.providers.customProvidersTitle}{" "}
                <span className="font-normal text-muted-foreground">· {t.studio.providers.customProvidersHint}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setShowAddCustom(true)}>
                <Plus className="size-3.5" /> {t.studio.providers.addCustomProvider}
              </Button>
            </h3>
            {(cfg.customProviders ?? []).length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {(cfg.customProviders ?? []).map((cp) => (
                  <ApiCard
                    key={cp.id}
                    meta={{ id: cp.id, name: cp.name, hint: cp.homepageUrl || cp.note || "" }}
                    status={cfg.providers[cp.id]}
                    active={eff === cp.id}
                    onSetActive={() => onSetActive(cp.id)}
                    onChanged={load}
                    onDelete={async () => {
                      await api.deleteCustomProvider(cp.id);
                      load();
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <MonitorCog className="size-4 text-emerald-500" /> {t.studio.providers.localModelTitle} <span className="font-normal text-muted-foreground">· {t.studio.providers.localModelHint}</span>
            </h3>
            <OllamaCard status={cfg.providers.ollama} active={eff === "ollama"} onSetActive={() => onSetActive("ollama")} onChanged={load} />
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Terminal className="size-4 text-muted-foreground" /> {t.studio.providers.localCliTitle} <span className="font-normal text-muted-foreground">· {t.studio.providers.localCliHint}</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cliItems.map(({ name: id, installed }) => (
                <div key={id} className={cn("rounded-2xl border bg-card/60 px-4 py-3", installed ? "border-emerald-500/50" : eff === id ? "border-primary/60" : "border-border/70")}>
                  <div className="flex items-center justify-between">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{PROVIDER_LABELS[id] ?? id}</span>
                      <span className={cn("block truncate text-[11px]", installed ? "font-medium text-emerald-500" : "text-muted-foreground")}>
                        {installed ? t.studio.providers.cliInstalledBadge : t.studio.providers.cliRequirement}
                      </span>
                    </span>
                    <ActiveButton on={eff === id} onClick={() => onSetActive(id)} />
                  </div>
                  {CLI_RELAY_SUPPORT.has(id) && (
                    <CliRelayFields providerId={id} status={cfg.providers[id]} onChanged={load} />
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {showAddCustom && <CustomProviderModal onClose={() => setShowAddCustom(false)} onCreated={load} />}
    </div>
  );
}
