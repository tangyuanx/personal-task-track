const { app, BrowserWindow, Menu, clipboard, ipcMain, shell } = require("electron");
const path = require("node:path");
const { readTaskData, writeTaskData } = require("./storage.cjs");

const isMac = process.platform === "darwin";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: "个人任务流",
    backgroundColor: "#ffffff",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile(path.join(__dirname, "..", "index.html"));
  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });
}

function openExternalUrl(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

function registerStorageHandlers() {
  ipcMain.handle("task-data:read", () => readTaskData(app.getPath("userData")));
  ipcMain.handle("task-data:write", (_event, data) => writeTaskData(app.getPath("userData"), data));
  ipcMain.handle("clipboard:read-image-data-url", () => {
    const image = clipboard.readImage();
    return image.isEmpty() ? "" : image.toDataURL();
  });
}

function createMenu() {
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  app.setName("Personal Task Track");
  registerStorageHandlers();
  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
