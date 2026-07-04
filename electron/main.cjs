const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
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
  ipcMain.on("app:version", (event) => {
    event.returnValue = app.getVersion();
  });
  ipcMain.handle("task-data:read", () => readTaskData(app.getPath("userData")));
  ipcMain.handle("task-data:write", (_event, data) => writeTaskData(app.getPath("userData"), data));
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

function taskDocumentPdfHtml({ taskTitle, bodyHtml }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    :root { color: #17211c; font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    body { margin: 0; padding: 36px 42px; background: #ffffff; }
    header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #d9e2dc; }
    .kicker { margin: 0 0 7px; color: #5f756b; font-size: 12px; letter-spacing: 0; }
    h1 { margin: 0; color: #10251d; font-size: 26px; line-height: 1.25; }
    main { font-size: 14.5px; line-height: 1.72; }
    h1, h2, h3, h4, h5, h6 { color: #10251d; page-break-after: avoid; }
    h2 { margin-top: 24px; font-size: 20px; border-bottom: 1px solid #edf2ef; padding-bottom: 5px; }
    h3 { margin-top: 18px; font-size: 17px; }
    p, ul, ol, blockquote, pre, table, img { margin: 0 0 13px; }
    a { color: #2f7d68; text-decoration: none; }
    blockquote { padding: 10px 13px; border-left: 3px solid #2f7d68; color: #52665d; background: #f5faf7; }
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
