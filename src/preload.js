// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
	node: () => process.versions.node,
	chrome: () => process.versions.chrome,
	electron: () => process.versions.electron,
	ping: () => ipcRenderer.send('ping', 'ping'),
	selectFolder: () => ipcRenderer.send('select-folder'),
	startConversion: () => ipcRenderer.send('start-conversion'),
	cancelConversion: () => ipcRenderer.send('cancel-conversion'),
	selectImage: () => ipcRenderer.send('select-image'),
	on: (channel, func) => ipcRenderer.on(channel, func),
	// we can also expose variables, not just functions
});

