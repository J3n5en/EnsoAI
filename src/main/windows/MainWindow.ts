import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { is } from "@electron-toolkit/utils";
import { BrowserWindow, app, dialog, shell } from "electron";

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1400,
  height: 900,
};

function getStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function loadWindowState(): WindowState {
  try {
    const statePath = getStatePath();
    if (existsSync(statePath)) {
      const data = readFileSync(statePath, "utf-8");
      return { ...DEFAULT_STATE, ...JSON.parse(data) };
    }
  } catch {}
  return DEFAULT_STATE;
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const state: WindowState = {
      isMaximized: win.isMaximized(),
      ...(!win.isMaximized() && win.getBounds()),
    };
    writeFileSync(getStatePath(), JSON.stringify(state));
  } catch {}
}

export function createMainWindow(): BrowserWindow {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 685,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#1e1e1e",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, "../preload/index.cjs"),
    },
  });

  // Restore maximized state
  if (state.isMaximized) {
    win.maximize();
  }

  win.once("ready-to-show", () => {
    win.show();
  });

  // Confirm before close
  let forceClose = false;
  win.on("close", (e) => {
    if (forceClose) {
      saveWindowState(win);
      return;
    }

    e.preventDefault();
    dialog
      .showMessageBox(win, {
        type: "question",
        buttons: ["取消", "退出"],
        defaultId: 1,
        cancelId: 0,
        title: "确认退出",
        message: "确定要退出应用吗？",
      })
      .then(({ response }) => {
        if (response === 1) {
          forceClose = true;
          win.close();
        }
      });
  });

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Load renderer
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}
