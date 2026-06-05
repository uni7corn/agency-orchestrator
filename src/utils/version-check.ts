/**
 * 版本更新提醒 — npm 风格：本次运行只读缓存提示，后台异步拉取新版本存缓存。
 *
 * 禁用：环境变量 AO_NO_UPDATE_CHECK=1 或 CI=1
 * 缓存：~/.ao/version-check.json（24h）
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const PKG = 'agency-orchestrator';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cacheFile = join(homedir(), '.ao', 'version-check.json');

interface Cache {
  checkedAt: number;
  latest?: string;
}

function readCache(): Cache | null {
  try {
    if (!existsSync(cacheFile)) return null;
    return JSON.parse(readFileSync(cacheFile, 'utf-8'));
  } catch { return null; }
}

function writeCache(c: Cache): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(c));
  } catch { /* silent */ }
}

/** 简单 semver 比较：a > b 返回 true */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map(n => parseInt(n, 10));
  const pb = b.split(/[.-]/).map(n => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** 拉取 npm 上的最新版本号；网络失败/超时返回 null（静默）。 */
export async function fetchLatestVersion(timeoutMs = 5000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`https://registry.npmjs.org/${PKG}/latest`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * 根据 CLI 自身的安装路径推断该用哪个包管理器升级。
 * 纯函数，便于测试；可用 AO_UPGRADE_CMD 环境变量整条覆盖。
 * @param pkgSpec 形如 "agency-orchestrator@1.2.3"
 * @param selfPath 当前模块路径（fileURLToPath(import.meta.url)）
 */
export function detectUpgradeCommand(
  pkgSpec: string,
  selfPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.AO_UPGRADE_CMD) return env.AO_UPGRADE_CMD;
  const p = selfPath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/pnpm/') || p.includes('/.pnpm/')) return `pnpm add -g ${pkgSpec}`;
  if (p.includes('/.bun/') || p.includes('/bun/install/')) return `bun add -g ${pkgSpec}`;
  if (p.includes('/.yarn/') || p.includes('/yarn/global/')) return `yarn global add ${pkgSpec}`;
  return `npm i -g ${pkgSpec}`;
}

function printHint(current: string, latest: string): void {
  const msg = [
    '',
    `  ╭──────────────────────────────────────────────────────────╮`,
    `  │  新版本可用 / Update available: ${current} → ${latest.padEnd(16)}│`,
    `  │  升级 / Run: npm i -g agency-orchestrator@latest         │`,
    `  ╰──────────────────────────────────────────────────────────╯`,
    '',
  ];
  console.error(msg.join('\n'));
}

/**
 * 启动时调用：立即返回。
 * - 有缓存且最新版更高 → 立刻打印提示
 * - 缓存过期或缺失 → 后台异步拉取新版本存缓存（本次不提示）
 */
export function scheduleUpdateCheck(currentVersion: string): void {
  if (process.env.AO_NO_UPDATE_CHECK || process.env.CI) return;
  if (!process.stderr.isTTY) return;

  const cache = readCache();
  const fresh = cache && Date.now() - cache.checkedAt < CACHE_TTL_MS;

  if (cache?.latest && isNewer(cache.latest, currentVersion)) {
    printHint(currentVersion, cache.latest);
  }

  if (fresh) return;

  // 后台异步拉取：不阻塞 CLI，失败静默
  (async () => {
    const latest = await fetchLatestVersion(3000);
    if (latest) writeCache({ checkedAt: Date.now(), latest });
  })().catch(() => { /* silent */ });
}
