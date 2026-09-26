const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foodplan', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  fetchJson: (url) => ipcRenderer.invoke('net:fetchJson', url),
});
