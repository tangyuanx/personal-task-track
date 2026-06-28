const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("personalTaskTrack", {
  platform: process.platform,
  storage: {
    read: () => ipcRenderer.invoke("task-data:read"),
    write: (data) => ipcRenderer.invoke("task-data:write", data),
  },
});
