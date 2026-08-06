'use strict';
// Ponte segura entre a janela do instalador e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installer', {
  install: () => ipcRenderer.invoke('install'),
  launch: (exe) => ipcRenderer.send('launch', exe),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  onProgress: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
});
