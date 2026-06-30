const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("personalTaskTrack", {
  platform: process.platform,
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
  },
});
