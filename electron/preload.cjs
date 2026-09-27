const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foodplan', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  saveStateSync: (state) => ipcRenderer.sendSync('state:saveSync', state),
  fetchJson: (url) => ipcRenderer.invoke('net:fetchJson', url),
});
