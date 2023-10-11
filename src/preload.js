// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.send("ping", "ping"),
  selectFolder: () => ipcRenderer.send("select-folder"),
  selectImage: () => ipcRenderer.send("select-image"),
  startConversion: () => ipcRenderer.send("start-conversion"),
  conversionStatus: () => ipcRenderer.send("conversion-status"),
  conversionProgressUpdate: (fnc) =>
    ipcRenderer.on("conversion-progress-update"),
  cancelConversion: () => ipcRenderer.send("cancel-conversion"),
  conversionDone: () => ipcRenderer.send("conversion-done"),
  conversionFailed: () => ipcRenderer.send("conversion-failed"),
  conversionCanceled: () => ipcRenderer.send("conversion-cancelled"),
  on: (channel, func) => ipcRenderer.on(channel, func),
  // we can also expose variables, not just functions
});
