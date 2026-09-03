const { contextBridge, ipcRenderer } = require("electron");
const crypto = require("node:crypto");

const WORK_RHYTHM_PASSWORD_SHA256 = "091af679ab7c82f0d20e8e13cc68ebb5b51cec80b457c4acd1e56c7f38dbabf4";

function verifyWorkRhythmPassword(value) {
  const input = String(value || "");
  const digest = crypto.createHash("sha256").update(input, "utf8").digest("hex");
  const actual = Buffer.from(digest, "utf8");
  const expected = Buffer.from(WORK_RHYTHM_PASSWORD_SHA256, "utf8");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

contextBridge.exposeInMainWorld("personalTaskTrack", {
  platform: process.platform,
  appVersion: ipcRenderer.sendSync("app:version"),
  environment: ipcRenderer.sendSync("app:environment"),
  storage: {
    read: () => ipcRenderer.invoke("task-data:read"),
    write: (data) => ipcRenderer.invoke("task-data:write", data),
  },
  dataBackup: {
    export: () => ipcRenderer.invoke("data-backup:export"),
    importFile: () => ipcRenderer.invoke("data-backup:import", { selectionType: "file" }),
    importDirectory: () => ipcRenderer.invoke("data-backup:import", { selectionType: "directory" }),
  },
  knowledgeRecovery: {
    read: () => ipcRenderer.invoke("knowledge-recovery:read"),
    write: (record) => ipcRenderer.invoke("knowledge-recovery:write", record),
    delete: (noteId) => ipcRenderer.invoke("knowledge-recovery:delete", noteId),
    onFlushAndQuit: (callback) => subscribe("knowledge-recovery:flush-and-quit", callback),
    completeFlushAndQuit: () => ipcRenderer.send("knowledge-recovery:flush-complete"),
  },
  knowledgeFile: {
    save: (payload) => ipcRenderer.invoke("knowledge-document:save", payload),
    stageAssets: (payload) => ipcRenderer.invoke("knowledge-document:stage-assets", payload),
    read: (payload) => ipcRenderer.invoke("knowledge-document:read", payload),
    choose: (payload) => ipcRenderer.invoke("knowledge-document:choose", payload),
    watch: (payload) => ipcRenderer.invoke("knowledge-document:watch", payload),
    unwatch: (payload) => ipcRenderer.invoke("knowledge-document:unwatch", payload),
    updateBaseline: (payload) => ipcRenderer.invoke("knowledge-document:update-baseline", payload),
    onChange: (callback) => subscribe("knowledge-file:changed", callback),
  },
  clipboard: {
    readImageDataUrl: () => ipcRenderer.invoke("clipboard:read-image-data-url"),
    readImageDataUrlSync: () => ipcRenderer.sendSync("clipboard:read-image-data-url-sync"),
  },
  export: {
    nodeDetailPdf: (payload) => ipcRenderer.invoke("node-detail:export-pdf", payload),
    taskDocument: (payload) => ipcRenderer.invoke("task:export-document", payload),
  },
  bugReports: {
    submit: (payload) => ipcRenderer.invoke("bug-report:submit", payload),
  },
  dialogs: {
    confirmDestructive: (options) => ipcRenderer.invoke("app:confirm-destructive", options),
  },
  deadlineReminders: {
    sync: (tasks) => ipcRenderer.invoke("deadline-reminders:sync", tasks),
    getState: () => ipcRenderer.invoke("deadline-reminders:get-state"),
    onOpenTask: (callback) => subscribe("deadline-reminders:open-task", callback),
    onOpenCalendar: (callback) => subscribe("deadline-reminders:open-calendar", callback),
  },
  workRhythm: {
    verifyPassword: async (password) => verifyWorkRhythmPassword(password),
  },
  updates: {
    getState: () => ipcRenderer.invoke("app-update:get-state"),
    setAutomaticChecks: (enabled) => ipcRenderer.invoke("app-update:set-automatic-checks", enabled === true),
    check: () => ipcRenderer.invoke("app-update:check"),
    download: () => ipcRenderer.invoke("app-update:download"),
    install: () => ipcRenderer.invoke("app-update:install"),
    onPrepareInstall: (callback) => subscribe("app-update:prepare-install", callback),
    completeInstallPreparation: (success) => ipcRenderer.send("app-update:prepare-install-complete", success === true),
    onState: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("app-update:state", listener);
      return () => ipcRenderer.removeListener("app-update:state", listener);
    },
  },
  todayWidget: {
    getState: () => ipcRenderer.invoke("today-widget:get-state"),
    show: () => ipcRenderer.invoke("today-widget:show"),
    hide: () => ipcRenderer.invoke("today-widget:hide"),
    setPreferences: (preferences) => ipcRenderer.invoke("today-widget:set-preferences", preferences),
    resize: (size) => ipcRenderer.invoke("today-widget:resize", size),
    openMain: (taskId = "") => ipcRenderer.invoke("today-widget:open-main", taskId),
    completeTask: (taskId) => ipcRenderer.invoke("today-widget:complete-task", taskId),
    createTask: (payload) => ipcRenderer.invoke("today-widget:create-task", payload),
    updateTaskTitle: (payload) => ipcRenderer.invoke("today-widget:update-task-title", payload),
    promoteQuickCapture: (payload) => ipcRenderer.invoke("today-widget:promote-quick-capture", payload),
    setEditing: (enabled) => ipcRenderer.invoke("today-widget:set-editing", enabled === true),
    publish: (snapshot) => ipcRenderer.send("today-widget:publish", snapshot),
    respondCompletion: (result) => ipcRenderer.send("today-widget:complete-result", result),
    onSnapshot: (callback) => subscribe("today-widget:snapshot", callback),
    onState: (callback) => subscribe("today-widget:state", callback),
    onOpenTask: (callback) => subscribe("today-widget:open-task", callback),
    onCompleteRequest: (callback) => subscribe("today-widget:complete-request", callback),
    onCreateTaskRequest: (callback) => subscribe("today-widget:create-task", callback),
    onUpdateTaskTitleRequest: (callback) => subscribe("today-widget:update-task-title", callback),
    onPromoteQuickCaptureRequest: (callback) => subscribe("today-widget:promote-quick-capture", callback),
    respondMutation: (result) => ipcRenderer.send("today-widget:mutation-result", result),
  },
});

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
