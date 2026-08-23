/**
 * Personal Task Track -- Electron main process
 *
 * Responsibilities:
 *   - Create and manage the BrowserWindow
 *   - Register IPC handlers (storage, clipboard, PDF export)
 *   - Handle external URL navigation
 *   - Manage application menu
 */

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, screen, shell } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");
const { BugReportClientError, createBugReportClient } = require("./bug-report-client.cjs");
const { readTaskData, writeTaskData } = require("./storage.cjs");
const {
  chooseKnowledgeDocument,
  readKnowledgeDocument,
  saveKnowledgeDocument,
} = require("./knowledge-file.cjs");
const { createKnowledgeFileWatcher } = require("./knowledge-watcher.cjs");
const { stageKnowledgeAssets } = require("./knowledge-assets.cjs");
const {
  deleteKnowledgeRecovery,
  readKnowledgeRecovery,
  writeKnowledgeRecovery,
} = require("./recovery.cjs");
const { createTodayWidgetController } = require("./today-widget.cjs");
const { createUpdateController } = require("./updater.cjs");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
/**
 * Create the main application window.
 * Sets up preload, CSP, and external link handling.
 */

const isMac = process.platform === "darwin";
let updateController = null;
let todayWidgetController = null;
let mainWindow = null;
let isQuitting = false;
let updateInstallPrepared = false;
let recoveryShutdownWaitingFor = null;
let recoveryShutdownTimer = null;
const RECOVERY_SHUTDOWN_TIMEOUT_MS = 2000;
let updateInstallPreparation = null;
const UPDATE_INSTALL_PREPARATION_TIMEOUT_MS = 10_000;
const knowledgeWatcher = createKnowledgeFileWatcher({
  onChange: (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("knowledge-file:changed", event);
  },
});

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
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
  mainWindow = window;
/**
 * Open external URLs (http/https/mailto) in the system browser.
 * @param {string} url - URL to open
 */

  window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  window.once("ready-to-show", () => window.show());
/**
 * Register all IPC handlers for storage, clipboard, and export.
 */

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
  window.on("closed", () => {
    if (mainWindow !== window) return;
    mainWindow = null;
    knowledgeWatcher.closeAll();
    if (!isQuitting && !updateInstallPrepared) app.quit();
  });
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    app.quit();
  });
  return window;
}

function openExternalUrl(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
}

function finishRecoveryShutdown() {
  if (recoveryShutdownTimer) clearTimeout(recoveryShutdownTimer);
  recoveryShutdownTimer = null;
  recoveryShutdownWaitingFor = null;
  isQuitting = true;
  app.quit();
}

function requestRecoveryShutdown(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  event.preventDefault();
  if (recoveryShutdownWaitingFor !== null) return true;
  recoveryShutdownWaitingFor = mainWindow.webContents.id;
  mainWindow.webContents.send("knowledge-recovery:flush-and-quit");
  recoveryShutdownTimer = setTimeout(finishRecoveryShutdown, RECOVERY_SHUTDOWN_TIMEOUT_MS);
  return true;
}

function finishUpdateInstallPreparation(success) {
  if (!updateInstallPreparation) return;
  const { resolve, timer } = updateInstallPreparation;
  clearTimeout(timer);
  updateInstallPreparation = null;
  if (success) {
    // `quitAndInstall` closes windows before `before-quit`, so the renderer has
    // already completed all persistence work when this flag is set.
    updateInstallPrepared = true;
  }
  resolve(success === true);
}

function requestUpdateInstallPreparation() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve(true);
  if (updateInstallPreparation) return updateInstallPreparation.promise;
  const senderId = mainWindow.webContents.id;
  let resolvePreparation;
  const promise = new Promise((resolve) => {
    resolvePreparation = resolve;
  });
  const timer = setTimeout(() => finishUpdateInstallPreparation(false), UPDATE_INSTALL_PREPARATION_TIMEOUT_MS);
  updateInstallPreparation = { promise, resolve: resolvePreparation, senderId, timer };
  mainWindow.webContents.send("app-update:prepare-install");
  return promise;
}

function registerStorageHandlers() {
  ipcMain.on("app:version", (event) => {
    event.returnValue = app.getVersion();
  });
  ipcMain.on("app:environment", (event) => {
    event.returnValue = {
      os: `${platformName(process.platform)} ${os.release()}`,
      architecture: process.arch,
    };
  });
  ipcMain.handle("task-data:read", () => readTaskData(app.getPath("userData")));
/**
 * Export a task document as Markdown or PDF.
 * Shows a save dialog, renders PDF with a hidden BrowserWindow if needed.
 * @param {object} payload - { taskTitle, markdown?, html? }
 * @returns {Promise<{ canceled: boolean, filePath?: string }>}
 */
  ipcMain.handle("task-data:write", (_event, data) => writeTaskData(app.getPath("userData"), data));
  ipcMain.handle("knowledge-document:save", async (event, payload) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await saveKnowledgeDocument(payload, { dialog, parent, platform: process.platform });
    if (result?.success && payload?.noteId) knowledgeWatcher.updateBaseline(payload.noteId, result);
    return result;
  });
  ipcMain.handle("knowledge-document:stage-assets", (_event, payload) => stageKnowledgeAssets(
    app.getPath("userData"),
    payload,
  ));
  ipcMain.handle("knowledge-document:read", (_event, payload) => readKnowledgeDocument(payload?.filePath));
  ipcMain.handle("knowledge-document:choose", async (event, payload) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    return chooseKnowledgeDocument({
      dialog,
      parent,
      boundPaths: payload?.boundPaths,
      platform: process.platform,
    });
  });
  ipcMain.handle("knowledge-document:watch", (_event, payload) => knowledgeWatcher.watch(payload));
  ipcMain.handle("knowledge-document:unwatch", (_event, payload) => knowledgeWatcher.unwatch(payload?.noteId));
  ipcMain.handle("knowledge-document:update-baseline", (_event, payload) => knowledgeWatcher.updateBaseline(payload?.noteId, payload));
  ipcMain.handle("knowledge-recovery:read", () => readKnowledgeRecovery(app.getPath("userData")));
  ipcMain.handle("knowledge-recovery:write", (_event, record) => writeKnowledgeRecovery(app.getPath("userData"), record));
  ipcMain.handle("knowledge-recovery:delete", (_event, noteId) => deleteKnowledgeRecovery(app.getPath("userData"), noteId));
  ipcMain.on("knowledge-recovery:flush-complete", (event) => {
    if (event.sender.id !== recoveryShutdownWaitingFor) return;
    finishRecoveryShutdown();
  });
  ipcMain.on("app-update:prepare-install-complete", (event, success) => {
    if (event.sender.id !== updateInstallPreparation?.senderId) return;
    finishUpdateInstallPreparation(success === true);
  });
  ipcMain.handle("app:confirm-destructive", async (event, value) => {
    const message = String(value?.message || "确定删除所选内容？").slice(0, 500);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "warning",
      buttons: ["取消", "删除"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "确认删除",
      message,
    };
    const result = parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });
  ipcMain.handle("clipboard:read-image-data-url", () => {
    const image = clipboard.readImage();
    return image.isEmpty() ? "" : image.toDataURL();
  });
  ipcMain.on("clipboard:read-image-data-url-sync", (event) => {
    const image = clipboard.readImage();
    event.returnValue = image.isEmpty() ? "" : image.toDataURL();
  });
  ipcMain.handle("node-detail:export-pdf", async (_event, payload) => exportNodeDetailPdf(payload));
  ipcMain.handle("task:export-document", async (_event, payload) => exportTaskDocument(payload));
  ipcMain.handle("bug-report:submit", async (_event, payload) => {
    try {
      const baseUrl = process.env.BUG_REPORT_API_URL || (app.isPackaged ? "" : "http://127.0.0.1:3000");
      return await createBugReportClient({ baseUrl }).submit(payload);
    } catch (error) {
      const safeError = error instanceof BugReportClientError
        ? error
        : new BugReportClientError("REQUEST_FAILED", "反馈提交失败，请稍后重试");
      return { success: false, code: safeError.code, message: safeError.message };
    }
  });
}

function platformName(platform) {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return "Unknown OS";
}

async function exportTaskDocument(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const taskTitle = String(safePayload.taskTitle || "未命名任务").trim() || "未命名任务";
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "导出任务",
    defaultPath: `${sanitizeFileName(taskTitle)}.md`,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "PDF", extensions: ["pdf"] },
    ],
  });
  if (canceled || !filePath) return { canceled: true };

/**
 * Export a single node detail as PDF.
 * Opens a hidden BrowserWindow, renders HTML, prints to PDF.
 * @param {object} payload - { nodeTitle, taskTitle, status, updatedAt, html }
 * @returns {Promise<{ canceled: boolean, filePath?: string }>}
 */
  if (filePath.toLowerCase().endsWith(".pdf")) {
    const window = new BrowserWindow({
      width: 900,
      height: 1200,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    try {
      const html = taskDocumentPdfHtml({
        taskTitle,
        bodyHtml: String(safePayload.html || ""),
      });
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await window.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { marginType: "custom", top: 0.48, bottom: 0.48, left: 0.52, right: 0.52 },
      });
      await fs.writeFile(filePath, pdf);
      return { canceled: false, filePath };
    } finally {
      window.destroy();
    }
  }

  const markdownPath = filePath.toLowerCase().endsWith(".md") ? filePath : `${filePath}.md`;
  await fs.writeFile(markdownPath, String(safePayload.markdown || ""), "utf8");
  return { canceled: false, filePath: markdownPath };
}

/**
 * Generate HTML template for node detail PDF.
 * @param {object} params - { taskTitle, nodeTitle, status, updatedAt, bodyHtml }
 * @returns {string} Complete HTML document
 */
async function exportNodeDetailPdf(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const nodeTitle = String(safePayload.nodeTitle || "未命名节点").trim() || "未命名节点";
  const taskTitle = String(safePayload.taskTitle || "未命名任务").trim() || "未命名任务";
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "导出节点详情",
    defaultPath: `${sanitizeFileName(nodeTitle)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const window = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    const html = nodeDetailPdfHtml({
      taskTitle,
      nodeTitle,
      status: String(safePayload.status || ""),
      updatedAt: String(safePayload.updatedAt || ""),
      bodyHtml: String(safePayload.html || ""),
    });
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "custom", top: 0.48, bottom: 0.48, left: 0.52, right: 0.52 },
    });
    await fs.writeFile(filePath, pdf);
    return { canceled: false, filePath };
  } finally {
    window.destroy();
  }
}

/**
 * Generate HTML template for task document PDF.
 * @param {object} params - { taskTitle, bodyHtml }
 * @returns {string} Complete HTML document
 */
function nodeDetailPdfHtml({ taskTitle, nodeTitle, status, updatedAt, bodyHtml }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    :root { color: #24221f; font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    body { margin: 0; padding: 34px 38px; background: #ffffff; }
    header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ddd8cf; }
    .kicker { margin: 0 0 7px; color: #83796c; font-size: 12px; letter-spacing: 0; }
    h1 { margin: 0; color: #171512; font-size: 25px; line-height: 1.25; }
    .meta { display: flex; gap: 12px; margin-top: 10px; color: #6f665b; font-size: 12px; }
    main { font-size: 14px; line-height: 1.7; }
    h1, h2, h3, h4, h5, h6 { color: #171512; page-break-after: avoid; }
    h2 { margin-top: 22px; font-size: 20px; }
    h3 { margin-top: 18px; font-size: 17px; }
    p, ul, ol, blockquote, pre, table, img { margin: 0 0 13px; }
    a { color: #b4232f; text-decoration: none; }
    blockquote { padding: 10px 13px; border-left: 3px solid #b4232f; color: #62594f; background: #faf7f2; }
    code { padding: 1px 5px; border: 1px solid #e4ded4; border-radius: 5px; background: #f7f4ee; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.92em; }
    pre { overflow-wrap: anywhere; padding: 12px; border: 1px solid #e4ded4; border-radius: 8px; background: #f7f4ee; white-space: pre-wrap; }
    pre code { padding: 0; border: 0; background: transparent; }
    img { display: block; max-width: 100%; border: 1px solid #e4ded4; border-radius: 6px; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 7px 8px; border: 1px solid #e4ded4; text-align: left; vertical-align: top; }
    th { background: #f8f5ef; }
    hr { border: 0; border-top: 1px solid #e4ded4; margin: 18px 0; }
    .md-task { display: inline-flex; gap: 8px; align-items: flex-start; }
    .markdown-empty { color: #83796c; }
  </style>
</head>
<body>
  <header>
    <p class="kicker">${escapeHtml(taskTitle)}</p>
    <h1>${escapeHtml(nodeTitle)}</h1>
    <div class="meta"><span>${escapeHtml(status)}</span><span>${escapeHtml(updatedAt)}</span></div>
  </header>
  <main>${bodyHtml}</main>
</body>
</html>`;
}

/**
 * Sanitize a filename by removing invalid characters.
 * @param {string} value - Raw filename
 * @returns {string} Safe filename (max 90 chars)
 */
function taskDocumentPdfHtml({ taskTitle, bodyHtml }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
/**
 * Escape HTML special characters for safe rendering in PDF templates.
 * @param {string} value - Raw text
 * @returns {string} HTML-escaped text
 */
    :root { color: #17211c; font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    body { margin: 0; padding: 36px 42px; background: #ffffff; }
    header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #d9e2dc; }
    .kicker { margin: 0 0 7px; color: #5f756b; font-size: 12px; letter-spacing: 0; }
    h1 { margin: 0; color: #10251d; font-size: 26px; line-height: 1.25; }
    main { font-size: 14.5px; line-height: 1.72; }
    h1, h2, h3, h4, h5, h6 { color: #10251d; page-break-after: avoid; }
    h2 { margin-top: 24px; font-size: 20px; border-bottom: 1px solid #edf2ef; padding-bottom: 5px; }
/**
 * Create the application menu (currently set to null, hiding the default menu bar).
 */
    h3 { margin-top: 18px; font-size: 17px; }
    p, ul, ol, blockquote, pre, table, img { margin: 0 0 13px; }
    a { color: #2f7d68; text-decoration: none; }
    blockquote { padding: 10px 13px; border-left: 3px solid #2f7d68; color: #52665d; background: #f5faf7; }
/**
 * Application ready handler: registers IPC, sets up menu, creates window.
 */
    code { padding: 1px 5px; border: 1px solid #dfe9e4; border-radius: 5px; background: #f6faf8; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.92em; }
    pre { overflow-wrap: anywhere; padding: 12px; border: 1px solid #dfe9e4; border-radius: 8px; background: #f6faf8; white-space: pre-wrap; }
    pre code { padding: 0; border: 0; background: transparent; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 7px 8px; border: 1px solid #dfe9e4; text-align: left; vertical-align: top; }
    th { background: #f3f8f5; }
    .markdown-empty { color: #7d8e86; }
  </style>
</head>
<body>
  <header>
    <p class="kicker">Personal Task Track</p>
    <h1>${escapeHtml(taskTitle)}</h1>
  </header>
  <main>${bodyHtml}</main>
</body>
</html>`;
}

function sanitizeFileName(value) {
  return String(value || "node-detail")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "node-detail";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createMenu() {
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  app.setName("Personal Task Track");
  if (isMac) {
    app.setActivationPolicy("regular");
    await app.dock.show();
  }
  registerStorageHandlers();
  todayWidgetController = createTodayWidgetController({
    app,
    BrowserWindow,
    ipcMain,
    screen,
    getMainWindow: () => mainWindow,
    ensureMainWindow: createWindow,
  });
  todayWidgetController.registerIpc();
  updateController = createUpdateController({
    app,
    BrowserWindow,
    ipcMain,
    autoUpdater,
    macUpdatesEnabled: false,
    prepareInstall: requestUpdateInstallPreparation,
  });
  autoUpdater.on("error", () => {
    updateInstallPrepared = false;
  });
  updateController.registerIpc();
  createMenu();
  createWindow();
  await Promise.all([updateController.start(), todayWidgetController.start()]);

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.show();
    todayWidgetController?.applyAlwaysOnTop();
  });
  if (isMac) {
    app.on("did-become-active", () => todayWidgetController?.applyAlwaysOnTop());
    app.on("did-resign-active", () => {
      todayWidgetController?.applyAlwaysOnTop();
      const fullscreenTransitionRefresh = setTimeout(() => todayWidgetController?.applyAlwaysOnTop(), 1200);
      fullscreenTransitionRefresh.unref();
    });
  }
});

app.on("before-quit", (event) => {
  // Stop filesystem watchers as soon as shutdown begins. The window `closed`
  // event is a secondary cleanup path, not the lifecycle guarantee.
  knowledgeWatcher.closeAll();
  if (!isQuitting && !updateInstallPrepared && requestRecoveryShutdown(event)) return;
  isQuitting = true;
  updateController?.stop();
  todayWidgetController?.stop();
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
