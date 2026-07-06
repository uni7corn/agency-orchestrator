/**
 * Codex CLI 的"第三方中转"配置写入器。
 *
 * Codex（跟 claude-code / gemini-cli 不一样）没有环境变量覆盖机制 —— 它的模型
 * provider 路由只能通过 ~/.codex/config.toml + ~/.codex/auth.json 这两个文件配置，
 * 没有等价于 ANTHROPIC_BASE_URL / GOOGLE_GEMINI_BASE_URL 的 env 变量可用。这意味着
 * 要让 Codex 走中转商（如 Cubence），必须写这两个文件 —— 它们在用户 home 目录，
 * 不在项目里，所以：
 *   1. 写之前总是先备份（.ao-backup-<timestamp> 后缀，不覆盖旧备份）
 *   2. 只合并/更新 AO 管理的这一段（model_provider 顶层键 + model_providers.<id> 表），
 *      保留用户自己在 config.toml 里已有的其它内容（其它 provider、其它配置项）
 *   3. auth.json 同理，只更新 OPENAI_API_KEY 字段，不动其它可能存在的字段
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'smol-toml';

const CODEX_DIR = join(homedir(), '.codex');
const CONFIG_TOML = join(CODEX_DIR, 'config.toml');
const AUTH_JSON = join(CODEX_DIR, 'auth.json');

export interface CodexRelayConfig {
  /** provider 标识，写进 config.toml 的 [model_providers.<id>] 表名，如 "cubence" */
  providerId: string;
  /** 展示名 */
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
}

function backupIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  const backupPath = `${path}.ao-backup-${Date.now()}`;
  copyFileSync(path, backupPath);
  return backupPath;
}

function readTomlSafe(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  try {
    return parse(readFileSync(path, 'utf-8')) as Record<string, any>;
  } catch {
    return {}; // 解析失败（用户手改坏了之类）—— 兜底当空文件处理，仍会先备份原文件
  }
}

function readJsonSafe(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 把中转配置合并写入 Codex 的 config.toml + auth.json。
 * 返回本次实际产生的备份文件路径（供上层提示用户"已备份到 xxx"）。
 */
export function applyCodexRelay(cfg: CodexRelayConfig): { backups: string[] } {
  mkdirSync(CODEX_DIR, { recursive: true });
  const backups: string[] = [];

  const configBackup = backupIfExists(CONFIG_TOML);
  if (configBackup) backups.push(configBackup);
  const doc = readTomlSafe(CONFIG_TOML);
  doc.model_provider = cfg.providerId;
  if (cfg.model) doc.model = cfg.model;
  doc.model_providers = doc.model_providers && typeof doc.model_providers === 'object' ? doc.model_providers : {};
  doc.model_providers[cfg.providerId] = {
    name: cfg.name,
    base_url: cfg.baseUrl.replace(/\/+$/, ''),
    wire_api: 'responses',
    requires_openai_auth: true,
  };
  writeFileSync(CONFIG_TOML, stringify(doc), 'utf-8');

  const authBackup = backupIfExists(AUTH_JSON);
  if (authBackup) backups.push(authBackup);
  const auth = readJsonSafe(AUTH_JSON);
  auth.OPENAI_API_KEY = cfg.apiKey;
  writeFileSync(AUTH_JSON, JSON.stringify(auth, null, 2), 'utf-8');

  return { backups };
}

/**
 * 清除 AO 写入的中转配置：把 config.toml 的 model_provider 顶层覆盖去掉（不删除
 * model_providers.<id> 这张表本身，避免用户下次想切回来还得重填 base_url），
 * auth.json 里的 key 置空。不影响用户自己其它的 provider 配置。
 */
export function clearCodexRelay(providerId: string): void {
  if (existsSync(CONFIG_TOML)) {
    const doc = readTomlSafe(CONFIG_TOML);
    if (doc.model_provider === providerId) delete doc.model_provider;
    if (doc.model_providers && typeof doc.model_providers === 'object') {
      delete doc.model_providers[providerId];
    }
    writeFileSync(CONFIG_TOML, stringify(doc), 'utf-8');
  }
  if (existsSync(AUTH_JSON)) {
    const auth = readJsonSafe(AUTH_JSON);
    delete auth.OPENAI_API_KEY;
    writeFileSync(AUTH_JSON, JSON.stringify(auth, null, 2), 'utf-8');
  }
}

/** 当前是否已配置了给定 provider 的中转（供 UI 展示状态用）。 */
export function readCodexRelayStatus(providerId: string): { configured: boolean; baseUrl?: string } {
  const doc = readTomlSafe(CONFIG_TOML);
  const active = doc.model_provider === providerId;
  const providerCfg = doc.model_providers?.[providerId];
  return {
    configured: active && !!providerCfg,
    baseUrl: providerCfg?.base_url,
  };
}
