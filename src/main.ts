import { app, BrowserWindow, ipcMain, Notification, shell } from "electron";
import path from "node:path";
import os from "node:os";
import started from "electron-squirrel-startup";
import { updateElectronApp } from "update-electron-app";

if (app.isPackaged) {
  updateElectronApp();
}

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("open-external", (_event, url: string) =>
  shell.openExternal(url),
);
ipcMain.handle("get-system-info", () => ({
  platform: process.platform,
  osVersion: os.release(),
}));

// ---------------------------------------------------------------------
// Notifications (plans/notification-system). The renderer receives them
// over Supabase Realtime and asks for an OS notification only while the
// window is not focused; clicking it brings the window back and opens the
// notification's screen.
// ---------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;

// Windows only shows notifications for an app with an AppUserModelID; this
// is the one the Squirrel installer registers for this app.
if (process.platform === "win32" && app.isPackaged) {
  app.setAppUserModelId("com.squirrel.egc-management.egc-management");
}

ipcMain.handle("window-is-focused", () => mainWindow?.isFocused() ?? false);

ipcMain.handle("notify-show", (_event, payload: { title: string; body: string; route?: string | null }) => {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    title: String(payload?.title ?? "").slice(0, 200),
    body: String(payload?.body ?? "").slice(0, 1000),
  });
  notification.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (payload?.route) mainWindow.webContents.send("notify-open", payload.route);
  });
  notification.show();
  if (process.platform === "win32" && mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
  return true;
});

// Unread count on the dock (macOS) and launcher (Linux). Windows has no
// numeric badge; the taskbar button flashes on a new notification instead.
ipcMain.handle("notify-badge", (_event, count: number) => {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  app.setBadgeCount(n);
});
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(process.resourcesPath, "../assets/icons/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on("focus", () => mainWindow?.flashFrame(false));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open the DevTools.
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
