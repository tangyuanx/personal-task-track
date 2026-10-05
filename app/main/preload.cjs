const { contextBridge, ipcRenderer } = require("electron");

const WORK_RHYTHM_PASSWORD = "20000911";

function verifyWorkRhythmPassword(value) {
  return String(value || "") === WORK_RHYTHM_PASSWORD;
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
  window: {
    // Phase19: a minimized window has to come back before an in-app readiness
    // panel can be read.
    revealMain: () => ipcRenderer.invoke("app:reveal-main"),
  },
  // Phase25 integrated title bar. The window controls stay native (macOS traffic
  // lights / Windows-Linux controls overlay), so this bridge only reports real
  // window state and paints the overlay with the app's own theme colours.
  windowControls: {
    getState: () => ipcRenderer.invoke("window-controls:get-state"),
    setChromeColors: (colors) => ipcRenderer.invoke("window-controls:set-chrome-colors", colors),
    onState: (callback) => subscribe("window-controls:state", callback),
  },
  deadlineReminders: {
    sync: (tasks) => ipcRenderer.invoke("deadline-reminders:sync", tasks),
    getState: () => ipcRenderer.invoke("deadline-reminders:get-state"),
    // Phase19: the only path that asks for a scan, and the live state feed.
    check: () => ipcRenderer.invoke("deadline-reminders:check"),
    onState: (callback) => subscribe("deadline-reminders:state", callback),
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
    deleteQuickCapture: (payload) => ipcRenderer.invoke("today-widget:delete-quick-capture", payload),
    moveItem: (payload) => ipcRenderer.invoke("today-widget:move-item", payload),
    reorderItem: (payload) => ipcRenderer.invoke("today-widget:reorder-item", payload),
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
    onDeleteQuickCaptureRequest: (callback) => subscribe("today-widget:delete-quick-capture", callback),
    onMoveItemRequest: (callback) => subscribe("today-widget:move-item", callback),
    onReorderRequest: (callback) => subscribe("today-widget:reorder-item", callback),
    respondMutation: (result) => ipcRenderer.send("today-widget:mutation-result", result),
    // The window is sized from the rendered panel plus the ring that carries the
    // Demo's own drop shadow, so the renderer reports its content box.
    fit: (size) => ipcRenderer.invoke("today-widget:fit", size),
    nudge: (delta) => ipcRenderer.invoke("today-widget:nudge", delta),
    openSurface: (payload) => ipcRenderer.invoke("today-widget:open-surface", payload),
    closeSurface: (payload) => ipcRenderer.invoke("today-widget:close-surface", payload),
    // The transparent ring that carries the panel's shadow must not swallow
    // input aimed at whatever is behind it.
    setRingRegion: (payload) => ipcRenderer.invoke("today-widget:ring", payload),
    onSurface: (callback) => subscribe("today-widget:surface", callback),
    onBeginRename: (callback) => subscribe("today-widget:begin-rename", callback),
    onToast: (callback) => subscribe("today-widget:toast", callback),
  },
  // Popover surfaces (settings / row menu / promote / delete) live in their own
  // frameless window so they can extend past the widget window, exactly where
  // the Demo places them relative to the panel.
  widgetSurface: {
    getPayload: () => ipcRenderer.invoke("widget-surface:get"),
    fit: (size) => ipcRenderer.invoke("widget-surface:fit", size),
    act: (payload) => ipcRenderer.invoke("widget-surface:act", payload),
    close: (payload) => ipcRenderer.invoke("widget-surface:close", payload),
    setRingRegion: (payload) => ipcRenderer.invoke("today-widget:ring", payload),
    onPayload: (callback) => subscribe("widget-surface:payload", callback),
  },
});

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
