// Agency Orchestrator — Electron desktop shell.
// Launches the existing Node backend (web/server.js) using Electron's bundled
// Node (ELECTRON_RUN_AS_NODE), then opens a native window onto the local UI.
// No system Node install required.
const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const net = require("node:net");

const ROOT = app.isPackaged ? path.join(process.resourcesPath, "app") : path.resolve(__dirname, "..");
const DEFAULT_PORT = Number(process.env.AO_DESKTOP_PORT || 8799);
let port = DEFAULT_PORT; // 实际端口在启动时确定（可能因占用而顺延）
let backend = null;
let mainWindow = null;

const base = () => `http://127.0.0.1:${port}/`;
const studioUrl = () => {
  const lang = String(app.getLocale() || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  return `${base()}studio?lang=${lang}`;
};

// 启动中 / 失败时显示的本地页面（data URL，不依赖后端，避免后端没起来时白屏）。
function splashHtml(message, spinner = true) {
  const dot = spinner
    ? `<div class="s"></div>`
    : `<div style="font-size:34px;line-height:1">⚠️</div>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
       background:#0b0e14;color:#e5e7eb;font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
  .b{display:grid;place-items:center;width:56px;height:56px;border-radius:14px;background:#7c5cff;
     color:#fff;font-weight:800;font-size:24px}
  .s{width:22px;height:22px;border:3px solid #2a2f3a;border-top-color:#7c5cff;border-radius:50%;
     animation:r .8s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  .m{color:#9aa3b2;max-width:420px;text-align:center;padding:0 24px}
</style></head><body>
  <div class="b">ao</div>${dot}
  <div class="m">${message}</div>
</body></html>`);
}

// GUI apps launched from Finder/Dock inherit the minimal launchd PATH
// (/usr/bin:/bin:/usr/sbin:/sbin), NOT the user's shell PATH. So CLI providers
// installed in homebrew / ~/.local/bin / npm-global (claude, codex, gemini…) are
// invisible to the spawned engine → "找不到 claude / 连不上本地 CLI" (issue #41).
// Rebuild a usable PATH: the login shell's PATH (best effort) + common bin dirs.
function resolvedPath() {
  const parts = [];
  if (process.platform !== "win32") {
    // Ask the login shell for its PATH (covers nvm/asdf/custom installs).
    try {
      const shellBin = process.env.SHELL || "/bin/zsh";
      const out = execFileSync(shellBin, ["-lic", "printf %s \"$PATH\""], {
        timeout: 4000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out) parts.push(out);
    } catch {
      /* shell probe failed — fall back to curated dirs below */
    }
    const home = os.homedir();
    parts.push(
      "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin",
      path.join(home, ".local/bin"),
      path.join(home, ".npm-global/bin"),
      path.join(home, ".bun/bin"),
      path.join(home, ".deno/bin"),
      path.join(home, ".cargo/bin"),
    );
  }
  if (process.env.PATH) parts.push(process.env.PATH);
  // de-dupe, preserve order, drop empties
  const seen = new Set();
  const sep = process.platform === "win32" ? ";" : ":";
  return parts
    .join(sep)
    .split(sep)
    .filter((p) => p && !seen.has(p) && seen.add(p))
    .join(sep);
}

// 找一个可用端口：从首选端口起顺延，避免端口被占用时后端 bind 失败导致整个 app 白屏。
function findFreePort(start, tries = 20) {
  return new Promise((resolve, reject) => {
    let p = start;
    let left = tries;
    const tryOne = () => {
      const srv = net.createServer();
      srv.once("error", () => {
        srv.close();
        if (--left <= 0) return reject(new Error("no free port near " + start));
        p += 1;
        tryOne();
      });
      srv.once("listening", () => srv.close(() => resolve(p)));
      srv.listen(p, "127.0.0.1");
    };
    tryOne();
  });
}

function startBackend() {
  const serverPath = path.join(ROOT, "web", "server.js");
  backend = spawn(process.execPath, [serverPath], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // run the backend (and its engine children) as plain Node
      AO_NODE: process.execPath, // engine binary the server should spawn
      AO_DATA_DIR: app.getPath("userData"), // writable dir for outputs / keys (bundle is read-only)
      PATH: resolvedPath(), // so CLI providers (claude/codex/gemini) are found (issue #41)
      PORT: String(port),
      HOST: "127.0.0.1",
    },
    stdio: "inherit",
  });
  backend.on("exit", () => {
    backend = null;
  });
}

function stopBackend() {
  try {
    backend && backend.kill();
  } catch {
    /* noop */
  }
  backend = null;
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${base()}api/health`, (r) => {
      r.resume();
      resolve(r.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitHealth(timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// 启动引擎并把窗口指向 Studio；失败时给出可重试的原生对话框，而不是静默白屏。
async function boot(win) {
  win.loadURL(splashHtml("正在启动本地引擎…"));
  try {
    port = await findFreePort(DEFAULT_PORT);
  } catch {
    /* 极端情况下找不到空闲端口，仍尝试默认端口 */
    port = DEFAULT_PORT;
  }
  if (!backend) startBackend();
  const ok = await waitHealth();
  if (win.isDestroyed()) return; // 用户在启动期间关掉了窗口
  if (ok) {
    win.loadURL(studioUrl());
    return;
  }
  // 引擎没起来：明确告知 + 重试/退出，避免白屏。
  win.loadURL(splashHtml("本地引擎未能启动。可能端口被占用或启动超时。", false));
  const { response } = await dialog.showMessageBox(win, {
    type: "error",
    title: "Agency Orchestrator",
    message: "本地引擎启动失败",
    detail: "端口可能被占用，或启动超时。可重试，或退出后重新打开应用。",
    buttons: ["重试", "退出"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) {
    stopBackend();
    await boot(win);
  } else {
    app.quit();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: "Agency Orchestrator",
    backgroundColor: "#0b0e14",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  // Open external links in the system browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // Studio 加载失败（偶发：引擎刚好还没就绪）→ 短暂重试几次再放弃。
  let reloadTries = 0;
  win.webContents.on("did-fail-load", (_e, code, _desc, failedUrl) => {
    // -3 = ERR_ABORTED（正常的导航打断），忽略；只对真正的连接失败重试。
    if (code === -3 || !failedUrl.startsWith(base())) return;
    if (reloadTries++ < 5) {
      setTimeout(() => {
        if (!win.isDestroyed()) win.loadURL(studioUrl());
      }, 600);
    }
  });
  win.webContents.on("did-finish-load", () => {
    if (win.webContents.getURL().startsWith(base())) reloadTries = 0;
  });
  boot(win);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已有实例在运行：直接退出，避免第二个后端抢占端口。
  app.quit();
} else {
  app.on("second-instance", () => {
    // 用户再次启动 → 聚焦已有窗口，而不是开新的。
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("quit", stopBackend);
}
