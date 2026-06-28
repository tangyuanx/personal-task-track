const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("personalTaskTrack", {
  platform: process.platform,
});
