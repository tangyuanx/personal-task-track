const fs = require("node:fs/promises");
const path = require("node:path");

const UPDATE_CHANNELS = Object.freeze({
  getState: "app-update:get-state",
  setAutomaticChecks: "app-update:set-automatic-checks",
  check: "app-update:check",
  download: "app-update:download",
  install: "app-update:install",
  state: "app-update:state",
});

const DEFAULT_STARTUP_DELAY_MS = 25_000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const PREFERENCES_FILE = "update-preferences.json";

function createUpdateController({
  app,
  BrowserWindow,
  ipcMain,
  autoUpdater,
  platform = process.platform,
  macUpdatesEnabled = false,
  installDirectory = "",
  startupDelayMs = DEFAULT_STARTUP_DELAY_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fileSystem = fs,
  prepareInstall = async () => true,
} = {}) {
  if (!app || !BrowserWindow || !ipcMain || !autoUpdater) {
    throw new TypeError("Updater controller requires Electron app, BrowserWindow, ipcMain, and autoUpdater.");
  }

  const supportedPlatform = platform === "win32" || (platform === "darwin" && macUpdatesEnabled);
  const supported = Boolean(app.isPackaged && supportedPlatform);
  const unsupportedReason = !app.isPackaged
    ? "development"
    : platform === "darwin"
      ? "mac-signing-required"
      : "platform-unsupported";
  let state = {
    status: supported ? "idle" : "unsupported",
    supported,
    unsupportedReason: supported ? "" : unsupportedReason,
    automaticChecks: true,
    currentVersion: sanitizeVersion(app.getVersion?.()),
    version: "",
    releaseDate: "",
    size: 0,
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    lastCheckedAt: "",
    errorCode: "",
  };
  let startupTimer = null;
  let intervalTimer = null;
  let started = false;
  let userApprovedInstall = false;
  let installInFlight = null;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = state.currentVersion.includes("-");
  if (platform === "win32" && supported && typeof installDirectory === "string" && installDirectory.trim()) {
    autoUpdater.installDirectory = installDirectory;
  }

  const preferencesPath = () => path.join(app.getPath("userData"), PREFERENCES_FILE);

  function getState() {
    return { ...state };
  }

  function updateState(patch, { broadcast = true } = {}) {
    state = { ...state, ...patch };
    if (broadcast) broadcastState();
    return getState();
  }

  function broadcastState() {
    const snapshot = getState();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window?.isDestroyed?.()) window.webContents?.send?.(UPDATE_CHANNELS.state, snapshot);
    }
  }

  async function loadPreferences() {
    try {
      const parsed = JSON.parse(await fileSystem.readFile(preferencesPath(), "utf8"));
      if (typeof parsed.automaticChecks === "boolean") {
        updateState({ automaticChecks: parsed.automaticChecks }, { broadcast: false });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn("Unable to read update preferences.", safeErrorCode(error));
    }
  }

  async function savePreferences() {
    try {
      await fileSystem.mkdir(app.getPath("userData"), { recursive: true });
      await fileSystem.writeFile(
        preferencesPath(),
        `${JSON.stringify({ automaticChecks: state.automaticChecks }, null, 2)}\n`,
        "utf8",
      );
    } catch (error) {
      console.warn("Unable to save update preferences.", safeErrorCode(error));
    }
  }

  function clearSchedule() {
    if (startupTimer) clearTimeout(startupTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    startupTimer = null;
    intervalTimer = null;
  }

  function scheduleAutomaticChecks(delay = startupDelayMs) {
    clearSchedule();
    if (!supported || !state.automaticChecks) return;
    startupTimer = setTimeout(() => void checkForUpdates("automatic"), Math.max(0, delay));
    startupTimer.unref?.();
    intervalTimer = setInterval(() => void checkForUpdates("automatic"), Math.max(60_000, intervalMs));
    intervalTimer.unref?.();
  }

  async function setAutomaticChecks(value) {
    const automaticChecks = value === true;
    updateState({ automaticChecks });
    await savePreferences();
    if (automaticChecks) scheduleAutomaticChecks(1_500);
    else clearSchedule();
    return getState();
  }

  async function checkForUpdates(source = "manual") {
    if (!supported || ["checking", "downloading", "downloaded", "preparing", "installing"].includes(state.status)) return getState();
    updateState({
      status: "checking",
      errorCode: "",
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
      checkSource: source === "automatic" ? "automatic" : "manual",
    });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      setError(error);
    }
    return getState();
  }

  async function downloadUpdate() {
    if (!supported || !["available", "downloaded"].includes(state.status)) return getState();
    userApprovedInstall = true;
    if (state.status === "downloaded") return installDownloadedUpdate();
    updateState({ status: "downloading", errorCode: "", percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      userApprovedInstall = false;
      setError(error);
    }
    return getState();
  }

  function installUpdate() {
    if (!supported || state.status !== "downloaded") return getState();
    userApprovedInstall = true;
    return installDownloadedUpdate();
  }

  function installDownloadedUpdate() {
    if (!supported || !userApprovedInstall || state.status !== "downloaded") return Promise.resolve(getState());
    if (installInFlight) return installInFlight;
    installInFlight = (async () => {
      updateState({ status: "preparing", errorCode: "" });
      let prepared = false;
      try {
        prepared = await prepareInstall();
      } catch (error) {
        updateState({ status: "downloaded", errorCode: safeErrorCode(error) });
        userApprovedInstall = false;
        return getState();
      }
      if (!prepared) {
        updateState({ status: "downloaded", errorCode: "INSTALL_PREPARATION_FAILED" });
        userApprovedInstall = false;
        return getState();
      }
      updateState({ status: "installing", errorCode: "" });
      try {
        // The explicit in-app upgrade action has already authorized this
        // Windows-only silent installer run and the automatic relaunch.
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        userApprovedInstall = false;
        setError(error);
      }
      return getState();
    })().finally(() => {
      installInFlight = null;
    });
    return installInFlight;
  }

  function setError(error) {
    userApprovedInstall = false;
    updateState({
      status: "error",
      errorCode: classifyUpdateError(error),
      percent: 0,
      bytesPerSecond: 0,
    });
  }

  autoUpdater.on("checking-for-update", () => {
    updateState({ status: "checking", errorCode: "" });
  });
  autoUpdater.on("update-available", (info) => {
    const file = Array.isArray(info?.files) ? info.files[0] : null;
    updateState({
      status: "available",
      version: sanitizeVersion(info?.version),
      releaseDate: sanitizeDate(info?.releaseDate),
      size: safeNumber(file?.size),
      lastCheckedAt: new Date().toISOString(),
      errorCode: "",
    });
  });
  autoUpdater.on("update-not-available", () => {
    userApprovedInstall = false;
    updateState({
      status: "latest",
      version: "",
      releaseDate: "",
      size: 0,
      lastCheckedAt: new Date().toISOString(),
      errorCode: "",
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    updateState({
      status: "downloading",
      percent: clampPercent(progress?.percent),
      transferred: safeNumber(progress?.transferred),
      total: safeNumber(progress?.total),
      bytesPerSecond: safeNumber(progress?.bytesPerSecond),
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateState({
      status: "downloaded",
      version: sanitizeVersion(info?.version || state.version),
      percent: 100,
      transferred: state.total || state.transferred,
      errorCode: "",
    });
    if (userApprovedInstall) void installDownloadedUpdate();
  });
  autoUpdater.on("update-cancelled", () => {
    userApprovedInstall = false;
    updateState({ status: "available", percent: 0, transferred: 0, bytesPerSecond: 0 });
  });
  autoUpdater.on("error", setError);

  function registerIpc() {
    ipcMain.handle(UPDATE_CHANNELS.getState, () => getState());
    ipcMain.handle(UPDATE_CHANNELS.setAutomaticChecks, (_event, value) => setAutomaticChecks(value));
    ipcMain.handle(UPDATE_CHANNELS.check, () => checkForUpdates("manual"));
    ipcMain.handle(UPDATE_CHANNELS.download, () => downloadUpdate());
    ipcMain.handle(UPDATE_CHANNELS.install, () => installUpdate());
  }

  async function start({ schedule = true } = {}) {
    if (started) return getState();
    started = true;
    await loadPreferences();
    broadcastState();
    if (schedule) scheduleAutomaticChecks();
    return getState();
  }

  function stop() {
    clearSchedule();
  }

  return {
    registerIpc,
    start,
    stop,
    getState,
    setAutomaticChecks,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}

function sanitizeVersion(value) {
  return String(value || "").replace(/[^0-9A-Za-z.+-]/g, "").slice(0, 64);
}

function sanitizeDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
}

function safeErrorCode(error) {
  const code = String(error?.code || "UPDATE_FAILED").replace(/[^0-9A-Z_.-]/gi, "").slice(0, 64);
  return code || "UPDATE_FAILED";
}

function classifyUpdateError(error) {
  const code = safeErrorCode(error).toUpperCase();
  const message = `${error?.message || ""} ${error?.stack || ""}`.toLowerCase();

  if (
    code === "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" ||
    /cannot find (?:channel )?["']?latest(?:-[a-z0-9-]+)?\.yml/.test(message) ||
    (/latest(?:-[a-z0-9-]+)?\.yml/.test(message) && /\b404\b|not found/.test(message))
  ) {
    return "UPDATE_METADATA_MISSING";
  }
  if (code === "ERR_UPDATER_INVALID_UPDATE_INFO" || /cannot parse update info|invalid update info/.test(message)) {
    return "UPDATE_METADATA_INVALID";
  }
  if (code === "ERR_UPDATER_NO_PUBLISHED_VERSIONS" || /no published versions|unable to find latest version/.test(message)) {
    return "UPDATE_RELEASE_NOT_FOUND";
  }
  if (code === "ETIMEDOUT" || code === "ERR_TIMED_OUT" || /timed?\s*out|timeout/.test(message)) {
    return "UPDATE_TIMEOUT";
  }
  if (
    ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "ERR_NETWORK", "ERR_INTERNET_DISCONNECTED"].includes(code) ||
    /net::err_(?:name_not_resolved|internet_disconnected|connection_refused|connection_reset|network_changed)/.test(message)
  ) {
    return "UPDATE_NETWORK_UNAVAILABLE";
  }
  if (/certificate|cert_|ssl|tls/.test(`${code.toLowerCase()} ${message}`)) return "UPDATE_TLS_FAILED";
  if (/\b429\b|rate.?limit/.test(message)) return "UPDATE_RATE_LIMITED";
  if (/\b403\b|forbidden/.test(message)) return "UPDATE_ACCESS_DENIED";
  if (/sha512|checksum|signature/.test(message)) return "UPDATE_INTEGRITY_FAILED";
  return code;
}

module.exports = {
  UPDATE_CHANNELS,
  classifyUpdateError,
  createUpdateController,
  sanitizeVersion,
};
