import { Check, Copy, Download, Loader2, MessageCircle, RotateCcw, Send, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, PROVIDER_LABELS, type ChatMessage } from "@/lib/studio";
import { downloadText, safeFilename } from "@/lib/download";
import { track } from "@/lib/track";
import { Markdown } from "./Markdown";
import { RoleAvatar } from "./RoleAvatar";

/** 打开面板时可选携带的首条消息（n 单调递增，防止同一条被重复消费）。 */
export interface ChatSeed {
  text: string;
  n: number;
}

/** 带角色人设聊天时的角色信息（path 形如 "engineering/engineering-sre"）。 */
export interface ChatRole {
  path: string;
  name: string;
  color?: string;
}

interface Bubble extends ChatMessage {
  /** 助手消息的 token 元信息，仅本地展示，不回传给后端 */
  meta?: string;
}

/**
 * 对话（不组队）——普通对话与单角色对话共用的统一聊天面板。不建工作流、不产生
 * 运行记录，直接用顶栏所选 provider/模型问答；带 role 时以该角色人设多轮对话。
 * 组件常驻挂载（open=false 时返回 null），同一人设下会话在 Studio 页面存续期间
 * 保留；切换人设（普通 ↔ 角色 / 换角色）时清空线程。
 */
export function ChatPanel({
  open,
  seed,
  role,
  provider,
  onClose,
  onEscalate,
}: {
  open: boolean;
  seed: ChatSeed | null;
  role: ChatRole | null;
  provider: string;
  onClose: () => void;
  /** 聊天 → 组队的升级桥：把当前问题带到「AI 自动组队」输入框（闭环到核心价值） */
  onEscalate?: (text: string) => void;
}) {
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const consumedSeed = useRef(0);
  const personaKey = role?.path ?? "__plain__";
  const lastPersona = useRef(personaKey);

  const title = role ? role.name : t.studio.chat.title;

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setErr(null);
    setInput("");
    setBusy(true);
    // busy 串行化了发送，这里读闭包里的 messages 是安全的
    const next: Bubble[] = [...messages, { role: "user", content: msg }];
    setMessages(next);
    track("plain_chat_send", { turn: next.length, persona: role ? "role" : "plain" });
    try {
      const r = await api.chat({
        messages: next.map(({ role: mr, content }) => ({ role: mr, content })),
        provider: provider || undefined,
        lang,
        role: role?.path,
      });
      const meta = r.usage ? `${r.usage.input_tokens} → ${r.usage.output_tokens}${t.studio.chat.tokensSuffix}` : undefined;
      setMessages((cur) => [...cur, { role: "assistant", content: r.content, meta }]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // 切换人设（普通 ↔ 角色 / 换角色）= 换对话对象，旧线程不再适用
  useEffect(() => {
    if (open && personaKey !== lastPersona.current) {
      lastPersona.current = personaKey;
      setMessages([]);
      setErr(null);
    }
  }, [open, personaKey]);

  // 从输入框带过来的任务文本：打开即作为第一条消息发出
  useEffect(() => {
    if (open && seed && seed.n !== consumedSeed.current) {
      consumedSeed.current = seed.n;
      void send(seed.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  // 没有逐 token 流式（connector 单轮返回整段），滚动只需跟消息条数走
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyMsg = (idx: number, content: string) => {
    navigator.clipboard?.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    });
  };

  const downloadMd = () => {
    const md = messages
      .map((m) => `**${m.role === "user" ? t.studio.chat.you : title}**：\n\n${m.content}`)
      .join("\n\n---\n\n");
    downloadText(safeFilename(`${title}-${new Date().toISOString().slice(0, 10)}`), md);
  };

  const providerLabel = PROVIDER_LABELS[provider] ?? provider;

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-none border border-border/70 bg-background shadow-2xl sm:max-h-[84vh] sm:min-h-[60vh] sm:rounded-2xl">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] to-transparent px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {role ? (
              <RoleAvatar seed={role.path} name={role.name} color={role.color} className="size-7 shrink-0" />
            ) : (
              <MessageCircle className="size-4 shrink-0 text-primary" />
            )}
            <h3 className="truncate font-semibold">{title}</h3>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={`${t.studio.chat.poweredByPrefix}${providerLabel}`}>
              {providerLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {messages.length > 0 && (
              <>
                <Button size="icon" variant="ghost" title={t.studio.run.downloadMd} onClick={downloadMd}>
                  <Download className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title={t.studio.chat.clearTitle}
                  disabled={busy}
                  onClick={() => {
                    setMessages([]);
                    setErr(null);
                  }}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </>
            )}
            <Button size="icon" variant="ghost" title={t.studio.chat.close} onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* thread */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-5">
          {messages.length === 0 && !busy && (
            <p className="mx-auto max-w-sm py-14 text-center text-sm leading-relaxed text-muted-foreground">
              {role ? `${t.studio.chat.roleEmptyPrefix}${role.name}${t.studio.chat.roleEmptySuffix}` : t.studio.chat.empty}
            </p>
          )}
          <div className="flex flex-col gap-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-sm leading-relaxed">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="group mr-auto max-w-[95%]">
                  <div className="rounded-2xl rounded-bl-md border border-border/60 bg-card/60 px-4 py-3">
                    <Markdown>{m.content}</Markdown>
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-1">
                    <button
                      onClick={() => copyMsg(i, m.content)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      {copiedIdx === i ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      {copiedIdx === i ? t.studio.chat.copied : t.studio.chat.copy}
                    </button>
                    {m.meta && <span className="text-[11px] text-muted-foreground/50">{m.meta}</span>}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-md border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                {t.studio.chat.thinking}
              </div>
            )}
            {err && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {t.studio.chat.failedPrefix}
                {err}
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-border/60 px-5 py-3.5">
          {/* 聊天是钩子，组队是价值——聊到需要深度时给一条顺手的升级路径 */}
          {onEscalate && messages.some((m) => m.role === "user") && (
            <button
              type="button"
              title={t.studio.chat.escalateTitle}
              onClick={() => {
                const lastUser = [...messages].reverse().find((m) => m.role === "user");
                if (lastUser) onEscalate(lastUser.content);
              }}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Users className="size-3.5" />
              {t.studio.chat.escalateBtn}
            </button>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={t.studio.chat.placeholder}
              className="flex-1 resize-none rounded-xl border border-border/70 bg-card/60 px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
            />
            <Button onClick={() => void send(input)} disabled={busy || !input.trim()} className="shrink-0">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {t.studio.chat.send}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
