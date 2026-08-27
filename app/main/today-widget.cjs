const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PREFERENCES_FILE = "today-widget-preferences.json";
const WIDGET_GAP = 16;
const WIDGET_MIN_HEIGHT = 180;
const WIDGET_MAX_HEIGHT = 720;
const WIDGET_POSITIONS = new Set(["top-left", "top-right", "bottom-left", "bottom-right", "custom"]);
const WIDGET_ZH_FONTS = new Set(["system", "noto", "yahei", "pingfang", "songti", "simsun", "fangsong", "heiti", "kaiti"]);
const WIDGET_EN_FONTS = new Set(["inter", "system", "segoe", "arial", "helvetica", "verdana", "trebuchet", "tahoma", "times", "georgia", "courier", "mono"]);
const DEFAULT_PREFERENCES = Object.freeze({
  position: "top-right",
  alwaysOnTop: true,
  launchWithApp: true,
  visible: true,
  compact: false,
  opacity: 100,
  height: 260,
  customBounds: null,
});

function normalizeTodayWidgetPreferences(value) {
  const raw = value && typeof value === "object" ? value : {};
  const customBounds = normalizeCustomBounds(raw.customBounds);
  const position = WIDGET_POSITIONS.has(raw.position) && (raw.position !== "custom" || customBounds)
    ? raw.position
    : DEFAULT_PREFERENCES.position;
  return {
    position,
    alwaysOnTop: raw.alwaysOnTop !== false,
    launchWithApp: raw.launchWithApp !== false,
    visible: raw.visible !== false,
    compact: raw.compact === true,
    opacity: normalizeOpacity(raw.opacity),
    height: normalizeHeight(raw.height),
    customBounds,
  };
}

function normalizeOpacity(value) {
  const opacity = value == null || value === "" ? Number.NaN : Number(value);
  return Number.isFinite(opacity) ? Math.max(70, Math.min(100, Math.round(opacity))) : DEFAULT_PREFERENCES.opacity;
}

function normalizeHeight(value) {
  const height = value == null || value === "" ? Number.NaN : Number(value);
  return Number.isFinite(height)
    ? Math.max(WIDGET_MIN_HEIGHT, Math.min(WIDGET_MAX_HEIGHT, Math.round(height)))
    : DEFAULT_PREFERENCES.height;
}

function normalizeCustomBounds(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

function cornerWindowBounds(workArea, size, position, gap = WIDGET_GAP) {
  const safeArea = workArea && typeof workArea === "object" ? workArea : { x: 0, y: 0, width: 1280, height: 800 };
  const width = Math.max(1, Math.round(Number(size?.width) || 360));
  const height = Math.max(1, Math.round(Number(size?.height) || 260));
  const left = Math.round(Number(safeArea.x) || 0) + gap;
  const top = Math.round(Number(safeArea.y) || 0) + gap;
  const right = Math.round(Number(safeArea.x) || 0) + Math.round(Number(safeArea.width) || width) - width - gap;
  const bottom = Math.round(Number(safeArea.y) || 0) + Math.round(Number(safeArea.height) || height) - height - gap;
  return {
    x: position.endsWith("right") ? Math.max(left, right) : left,
    y: position.startsWith("bottom") ? Math.max(top, bottom) : top,
    width,
    height,
  };
}

function resizedWidgetBounds(bounds, workArea, requestedHeight, edge = "bottom") {
  const safeBounds = bounds && typeof bounds === "object" ? bounds : { x: 0, y: 0, width: 360, height: 260 };
  const safeArea = workArea && typeof workArea === "object" ? workArea : { x: 0, y: 0, width: 1280, height: 800 };
  const x = Math.round(Number(safeBounds.x) || 0);
  const y = Math.round(Number(safeBounds.y) || 0);
  const width = Math.max(296, Math.round(Number(safeBounds.width) || 360));
  const currentHeight = Math.max(49, Math.round(Number(safeBounds.height) || DEFAULT_PREFERENCES.height));
  const areaTop = Math.round(Number(safeArea.y) || 0);
  const areaHeight = Math.max(1, Math.round(Number(safeArea.height) || 800));
  const areaBottom = areaTop + areaHeight;
  const resizeFromTop = edge === "top";
  const availableHeight = resizeFromTop ? y + currentHeight - areaTop : areaBottom - y;
  const minimumHeight = Math.min(WIDGET_MIN_HEIGHT, areaHeight);
  const maximumHeight = Math.max(minimumHeight, Math.min(WIDGET_MAX_HEIGHT, availableHeight));
  const numericHeight = Number(requestedHeight);
  const desiredHeight = Number.isFinite(numericHeight) ? Math.round(numericHeight) : currentHeight;
  const height = Math.max(minimumHeight, Math.min(maximumHeight, desiredHeight));
  return {
    x,
    y: resizeFromTop ? y + currentHeight - height : y,
    width,
    height,
  };
}

function applyTodayWidgetTopmost(window, enabled, platform = process.platform) {
  if (!window || window.isDestroyed()) return;
  const topmost = enabled === true;
  if (platform === "darwin") {
    window.setVisibleOnAllWorkspaces(topmost, {
      visibleOnFullScreen: topmost,
      // The widget is already an NSPanel. Keep the host application a regular
      // foreground app so macOS does not remove its icon from the Dock.
      skipTransformProcessType: true,
    });
    window.setHiddenInMissionControl(topmost);
  }
  window.setAlwaysOnTop(topmost, topmost ? "screen-saver" : "normal", topmost && platform === "darwin" ? 1 : 0);
  if (topmost && window.isVisible()) window.moveTop();
}

async function readTodayWidgetPreferences(userDataPath) {
  try {
    const raw = await fs.readFile(path.join(userDataPath, PREFERENCES_FILE), "utf8");
    return normalizeTodayWidgetPreferences(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return { ...DEFAULT_PREFERENCES };
    throw error;
  }
}

async function writeTodayWidgetPreferences(userDataPath, value) {
  const preferences = normalizeTodayWidgetPreferences(value);
  await fs.mkdir(userDataPath, { recursive: true });
  const filePath = path.join(userDataPath, PREFERENCES_FILE);
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
  return preferences;
}

function createTodayWidgetController({ app, BrowserWindow, ipcMain, screen, getMainWindow, ensureMainWindow }) {
  let preferences = { ...DEFAULT_PREFERENCES };
  let widgetWindow = null;
  let snapshot = { date: "", items: [] };
  let currentSize = { width: 360, height: DEFAULT_PREFERENCES.height };
  let moveSaveTimer = null;
  let resizeSaveTimer = null;
  let suppressMoveUntil = 0;
  const pendingCompletions = new Map();

  function widgetState() {
    return {
      ...preferences,
      visible: Boolean(preferences.visible && widgetWindow && !widgetWindow.isDestroyed()),
    };
  }

  function broadcast(channel, payload) {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    });
  }

  function broadcastState() {
    broadcast("today-widget:state", widgetState());
  }

  function persistPreferences() {
    return writeTodayWidgetPreferences(app.getPath("userData"), preferences).catch((error) => {
      console.error("Failed to persist Today widget preferences.", error);
    });
  }

  function activeDisplay() {
    if (widgetWindow && !widgetWindow.isDestroyed()) return screen.getDisplayMatching(widgetWindow.getBounds());
    return screen.getPrimaryDisplay();
  }

  function positionWidget() {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const display = activeDisplay();
    let bounds;
    if (preferences.position === "custom" && preferences.customBounds) {
      const area = screen.getDisplayNearestPoint(preferences.customBounds).workArea;
      bounds = {
        x: Math.max(area.x, Math.min(area.x + area.width - currentSize.width, preferences.customBounds.x)),
        y: Math.max(area.y, Math.min(area.y + area.height - currentSize.height, preferences.customBounds.y)),
        ...currentSize,
      };
    } else {
      bounds = cornerWindowBounds(display.workArea, currentSize, preferences.position);
    }
    suppressMoveUntil = Date.now() + 350;
    widgetWindow.setBounds(bounds, false);
  }

  function applyAlwaysOnTop() {
    applyTodayWidgetTopmost(widgetWindow, preferences.alwaysOnTop);
  }

  function createWidgetWindow() {
    if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
    widgetWindow = new BrowserWindow({
      width: currentSize.width,
      height: currentSize.height,
      minWidth: 296,
      minHeight: 49,
      frame: false,
      acceptFirstMouse: true,
      transparent: true,
      hasShadow: false,
      backgroundColor: "#00000000",
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      type: process.platform === "darwin" ? "panel" : undefined,
      alwaysOnTop: preferences.alwaysOnTop,
      title: "今日任务",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    positionWidget();
    widgetWindow.loadFile(path.join(__dirname, "..", "renderer", "today-widget.html"));
    widgetWindow.once("ready-to-show", () => {
      if (preferences.visible) widgetWindow.showInactive();
      applyAlwaysOnTop();
      widgetWindow.webContents.send("today-widget:snapshot", snapshot);
      widgetWindow.webContents.send("today-widget:state", widgetState());
      broadcastState();
    });
    widgetWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    widgetWindow.on("show", applyAlwaysOnTop);
    widgetWindow.on("move", () => {
      if (Date.now() < suppressMoveUntil || !widgetWindow || widgetWindow.isDestroyed()) return;
      const { x, y } = widgetWindow.getBounds();
      preferences = { ...preferences, position: "custom", customBounds: { x, y } };
      clearTimeout(moveSaveTimer);
      moveSaveTimer = setTimeout(() => {
        void persistPreferences();
        broadcastState();
      }, 180);
    });
    widgetWindow.on("closed", () => {
      widgetWindow = null;
      broadcastState();
    });
    return widgetWindow;
  }

  async function waitForMainWindow() {
    const window = getMainWindow() || ensureMainWindow();
    if (!window.webContents.isLoadingMainFrame()) return window;
    await new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
    return window;
  }

  async function showMainWindow(taskId = "") {
    const window = await waitForMainWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    window.webContents.send("today-widget:open-task", { taskId: normalizeTaskId(taskId) });
    return { success: true };
  }

  async function showWidget() {
    preferences = { ...preferences, visible: true };
    const window = createWidgetWindow();
    positionWidget();
    window.showInactive();
    applyAlwaysOnTop();
    await persistPreferences();
    broadcastState();
    return widgetState();
  }

  async function hideWidget() {
    preferences = { ...preferences, visible: false };
    widgetWindow?.hide();
    await persistPreferences();
    broadcastState();
    return widgetState();
  }

  async function updatePreferences(patch) {
    const raw = patch && typeof patch === "object" ? patch : {};
    preferences = normalizeTodayWidgetPreferences({ ...preferences, ...raw });
    if (raw.position && raw.position !== "custom") preferences.customBounds = null;
    applyAlwaysOnTop();
    if (Object.hasOwn(raw, "compact")) {
      currentSize = preferences.compact
        ? { width: 296, height: 49 }
        : { width: 360, height: preferences.height };
    }
    if (raw.position || Object.hasOwn(raw, "compact")) positionWidget();
    await persistPreferences();
    broadcastState();
    return widgetState();
  }

  async function resizeWidget(size) {
    if (!widgetWindow || widgetWindow.isDestroyed()) return widgetState();
    if (preferences.compact) {
      if (size?.transient !== true) return widgetState();
      currentSize = {
        width: 296,
        height: Math.max(49, Math.min(420, Math.round(Number(size?.height) || 49))),
      };
      positionWidget();
      return widgetState();
    }
    const bounds = widgetWindow.getBounds();
    const workArea = screen.getDisplayMatching(bounds).workArea;
    const edge = size?.edge === "top" ? "top" : "bottom";
    const nextBounds = resizedWidgetBounds(bounds, workArea, size?.height, edge);
    currentSize = { width: nextBounds.width, height: nextBounds.height };
    preferences = normalizeTodayWidgetPreferences({
      ...preferences,
      position: "custom",
      height: nextBounds.height,
      customBounds: { x: nextBounds.x, y: nextBounds.y },
    });
    suppressMoveUntil = Date.now() + 350;
    widgetWindow.setBounds(nextBounds, false);
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(() => {
      void persistPreferences();
      broadcastState();
    }, 180);
    return widgetState();
  }

  function publishSnapshot(value) {
    snapshot = normalizeSnapshot(value);
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.webContents.send("today-widget:snapshot", snapshot);
  }

  async function requestCompletion(taskId) {
    const normalizedTaskId = normalizeTaskId(taskId);
    if (!normalizedTaskId) return { success: false, code: "TASK_NOT_FOUND" };
    const mainWindow = await waitForMainWindow();
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingCompletions.delete(requestId);
        resolve({ success: false, code: "TIMEOUT" });
      }, 5000);
      pendingCompletions.set(requestId, { resolve, timer });
      mainWindow.webContents.send("today-widget:complete-request", { requestId, taskId: normalizedTaskId });
    }).then(async (result) => {
      if (result?.code === "CONCLUSION_REQUIRED") await showMainWindow(normalizedTaskId);
      return result;
    });
  }

  function resolveCompletion(event, value) {
    if (event.sender !== getMainWindow()?.webContents) return;
    const requestId = String(value?.requestId || "");
    const pending = pendingCompletions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCompletions.delete(requestId);
    pending.resolve({
      success: value?.success === true,
      code: ["COMPLETED", "CONCLUSION_REQUIRED", "TASK_NOT_FOUND"].includes(value?.code) ? value.code : "TASK_NOT_FOUND",
    });
  }

  function registerIpc() {
    ipcMain.handle("today-widget:get-state", () => ({ ...widgetState(), snapshot }));
    ipcMain.handle("today-widget:show", () => showWidget());
    ipcMain.handle("today-widget:hide", () => hideWidget());
    ipcMain.handle("today-widget:set-preferences", (_event, patch) => updatePreferences(patch));
    ipcMain.handle("today-widget:resize", (_event, size) => resizeWidget(size));
    ipcMain.handle("today-widget:open-main", (_event, taskId) => showMainWindow(taskId));
    ipcMain.handle("today-widget:complete-task", (_event, taskId) => requestCompletion(taskId));
    ipcMain.on("today-widget:publish", (event, value) => {
      if (event.sender === getMainWindow()?.webContents) publishSnapshot(value);
    });
    ipcMain.on("today-widget:complete-result", resolveCompletion);
  }

  async function start() {
    preferences = await readTodayWidgetPreferences(app.getPath("userData"));
    currentSize = preferences.compact
      ? { width: 296, height: 49 }
      : { width: 360, height: preferences.height };
    if (preferences.launchWithApp && preferences.visible) createWidgetWindow();
    screen.on("display-added", positionWidget);
    screen.on("display-removed", positionWidget);
    screen.on("display-metrics-changed", positionWidget);
    broadcastState();
  }

  function stop() {
    clearTimeout(moveSaveTimer);
    clearTimeout(resizeSaveTimer);
    screen.removeListener("display-added", positionWidget);
    screen.removeListener("display-removed", positionWidget);
    screen.removeListener("display-metrics-changed", positionWidget);
    pendingCompletions.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve({ success: false, code: "APP_QUITTING" });
    });
    pendingCompletions.clear();
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.destroy();
    widgetWindow = null;
  }

  return { applyAlwaysOnTop, registerIpc, start, stop };
}

function normalizeTaskId(value) {
  const taskId = String(value || "");
  return /^[A-Za-z0-9_-]{1,160}$/.test(taskId) ? taskId : "";
}

function normalizeSnapshot(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    date: String(raw.date || "").slice(0, 32),
    appearance: normalizeTodayWidgetAppearance(raw.appearance),
    items: (Array.isArray(raw.items) ? raw.items : []).map((item) => ({
      taskId: normalizeTaskId(item?.taskId),
      title: String(item?.title || "未命名任务").slice(0, 240),
      nextText: String(item?.nextText || "补充任务背景或新增第一个节点").slice(0, 500),
      kind: ["normal", "high", "blocked"].includes(item?.kind) ? item.kind : "normal",
    })).filter((item) => item.taskId),
  };
}

function normalizeTodayWidgetAppearance(value) {
  const raw = value && typeof value === "object" ? value : {};
  const fontSize = Number(raw.fontSize);
  return {
    theme: raw.theme === "dark" ? "dark" : "light",
    zhFont: WIDGET_ZH_FONTS.has(raw.zhFont) ? raw.zhFont : "system",
    enFont: WIDGET_EN_FONTS.has(raw.enFont) ? raw.enFont : "inter",
    fontSize: Number.isFinite(fontSize) ? Math.max(12, Math.min(24, fontSize)) : 16.5,
  };
}

module.exports = {
  DEFAULT_PREFERENCES,
  applyTodayWidgetTopmost,
  cornerWindowBounds,
  createTodayWidgetController,
  resizedWidgetBounds,
  normalizeTodayWidgetPreferences,
  normalizeTodayWidgetAppearance,
  normalizeSnapshot,
  readTodayWidgetPreferences,
  writeTodayWidgetPreferences,
};
