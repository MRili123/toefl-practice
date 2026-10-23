// TOEFL Practice desktop app: starts the bundled Next.js server and the speech-to-text engine on free
// localhost ports, then opens the app window. User data lives in the OS user-data folder, separate from
// the read-only app files, so reinstalling or updating never touches progress.
const { app, BrowserWindow, dialog, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const PRODUCT = "TOEFL Practice";
app.setName(PRODUCT);

// Packaged: everything sits in resources/. Development (`npm start` in desktop/): use the project folders.
const project = path.join(__dirname, "..");
const res = (packaged, dev) => (app.isPackaged ? path.join(process.resourcesPath, packaged) : path.join(project, dev));
const PATHS = {
  server: res("app-server", ".next/standalone"),
  bank: res("bank", "data/bank"),
  content: res("content/exercises", "content/exercises"),
  audio: res("practice_audios", "practice_audios"),
  stt: res("stt", "build/stt/stt_server"),
};

// TOEFL_DESKTOP_DATA lets testers start with an empty profile without touching the real one.
const userRoot = process.env.TOEFL_DESKTOP_DATA || app.getPath("userData");
const DATA_DIR = path.join(userRoot, "data");
const LOG_DIR = path.join(userRoot, "logs");

const children = [];
let mainWindow = null;
let splash = null;
let appUrl = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function launch(name, command, args, options, { stdinLifeline = true } = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const log = fs.createWriteStream(path.join(LOG_DIR, `${name}.log`), { flags: "w" });
  // stdin stays open as a lifeline: children exit when it closes, even if this app is killed or crashes.
  const child = spawn(command, args, { ...options, windowsHide: true, stdio: [stdinLifeline ? "pipe" : "ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    log.write(`\n[exited with code ${code}]\n`);
    if (name === "server" && !app.isQuitting) {
      dialog.showErrorBox(PRODUCT, `The app stopped unexpectedly (code ${code}).\nDetails: ${path.join(LOG_DIR, "server.log")}`);
      app.quit();
    }
  });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function createSplash() {
  splash = new BrowserWindow({
    width: 420, height: 260, frame: false, resizable: false, show: false, backgroundColor: "#f6f6f3",
    icon: path.join(__dirname, "build-resources", "icon.png"),
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 900, minWidth: 380, minHeight: 600, show: false, backgroundColor: "#f6f6f3", title: PRODUCT,
    autoHideMenuBar: true, icon: path.join(__dirname, "build-resources", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  const isApp = (url) => url.startsWith(appUrl);
  // Links to other sites (e.g. ollama.com) open in the normal browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isApp(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!isApp(url)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.once("ready-to-show", () => {
    splash?.destroy();
    splash = null;
    mainWindow.show();
  });
  mainWindow.loadURL(`${appUrl}/series`);
}

async function start() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const [appPort, sttPort] = [await freePort(), await freePort()];
  appUrl = `http://127.0.0.1:${appPort}`;

  // Microphone only for the app itself (speaking tasks); every other permission is refused.
  const allow = (wc, permission, origin) => (permission === "media" || permission === "audioCapture") && (origin ?? "").startsWith(appUrl);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(allow(wc, permission, details.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow(wc, permission, origin));

  // Speech-to-text engine (bundled; no Python needed).
  const sttExe = path.join(PATHS.stt, process.platform === "win32" ? "stt_server.exe" : "stt_server");
  if (fs.existsSync(sttExe)) {
    launch("stt", sttExe, [], {
      cwd: PATHS.stt,
      env: {
        ...process.env,
        STT_PORT: String(sttPort),
        STT_PARENT_PID: String(process.pid),
        WHISPER_MODEL: path.join(PATHS.stt, "model"),
        KOKORO_DIR: path.join(PATHS.stt, "kokoro"),
        STT_ALLOWED_ROOT: [path.join(DATA_DIR, "recordings"), path.join(DATA_DIR, "exercise-recordings")].join(path.delimiter),
      },
    }, { stdinLifeline: false });
  }

  // The Next.js server, run with Electron's own Node runtime.
  const serverJs = path.join(PATHS.server, "server.js");
  const lifeline = `process.stdin.on("end", () => process.exit(0)); process.stdin.on("error", () => process.exit(0)); process.stdin.resume(); require(${JSON.stringify(serverJs)});`;
  launch("server", process.execPath, ["-e", lifeline], {
    cwd: PATHS.server,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(appPort),
      HOSTNAME: "127.0.0.1",
      TOEFL_DESKTOP: "1",
      TOEFL_DATA_DIR: DATA_DIR,
      TOEFL_BANK_DIR: PATHS.bank,
      TOEFL_CONTENT_DIR: PATHS.content,
      PRACTICE_AUDIO_DIR: PATHS.audio,
      PRACTICE_AUDIO_WRITE_DIR: path.join(DATA_DIR, "practice_audios"),
      STT_URL: `http://127.0.0.1:${sttPort}`,
    },
  });

  if (!(await waitFor(`${appUrl}/series`, 90_000))) {
    dialog.showErrorBox(PRODUCT, `The app could not start.\nDetails: ${path.join(LOG_DIR, "server.log")}`);
    app.quit();
    return;
  }
  createMainWindow();
}

function stopChildren() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    createSplash();
    void start();
  });
  app.on("before-quit", () => {
    app.isQuitting = true;
    stopChildren();
  });
  app.on("window-all-closed", () => app.quit());
  process.on("exit", stopChildren);
}
