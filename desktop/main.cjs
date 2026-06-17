// Agency Orchestrator — Electron desktop shell.
// Launches the existing Node backend (web/server.js) using Electron's bundled
// Node (ELECTRON_RUN_AS_NODE), then opens a native window onto the local UI.
// No system Node install required.
const { app, BrowserWindow, shell } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const ROOT = app.isPackaged ? path.join(process.resourcesPath, "app") : path.resolve(__dirname, "..");
const PORT = process.env.AO_DESKTOP_PORT || "8799";
const BASE = `http://127.0.0.1:${PORT}/`;
let backend = null;

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
      PORT,
      HOST: "127.0.0.1",
    },
    stdio: "inherit",
  });
  backend.on("exit", () => {
    backend = null;
  });
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}api/health`, (r) => {
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

async function waitHealth(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
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
  // Open external links in the system browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // 按操作系统语言给 Studio 一个首启默认语言（用户在界面里切换后由 localStorage 记住）。
  const lang = String(app.getLocale() || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  win.loadURL(`${BASE}studio?lang=${lang}`);
}

app.whenReady().then(async () => {
  startBackend();
  const ok = await waitHealth();
  if (!ok) console.error("[desktop] backend did not become healthy in time");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  try {
    backend && backend.kill();
  } catch {
    /* noop */
  }
});
