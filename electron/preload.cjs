const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("personalTaskTrack", {
  platform: process.platform,
  appVersion: ipcRenderer.sendSync("app:version"),
  environment: ipcRenderer.sendSync("app:environment"),
  storage: {
    read: () => ipcRenderer.invoke("task-data:read"),
    write: (data) => ipcRenderer.invoke("task-data:write", data),
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
  updates: {
    getState: () => ipcRenderer.invoke("app-update:get-state"),
    setAutomaticChecks: (enabled) => ipcRenderer.invoke("app-update:set-automatic-checks", enabled === true),
    check: () => ipcRenderer.invoke("app-update:check"),
    download: () => ipcRenderer.invoke("app-update:download"),
    install: () => ipcRenderer.invoke("app-update:install"),
    onState: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("app-update:state", listener);
      return () => ipcRenderer.removeListener("app-update:state", listener);
    },
  },
});
