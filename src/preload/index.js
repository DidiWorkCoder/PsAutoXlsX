import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getPaths: () => ipcRenderer.invoke('app:getPaths'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),

  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  pickXlsx: () => ipcRenderer.invoke('dialog:pickXlsx'),
  pickFont: () => ipcRenderer.invoke('dialog:pickFont'),
  pickDir: (defaultPath) => ipcRenderer.invoke('dialog:pickDir', defaultPath),

  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeImages: (payload) => ipcRenderer.invoke('file:writeImages', payload),
  exportPack: (payload) => ipcRenderer.invoke('pack:export', payload),

  batch: {
    readConfig: () => ipcRenderer.invoke('batch:readConfig'),
    write: (payload) => ipcRenderer.invoke('batch:write', payload),
    log: (payload) => ipcRenderer.invoke('batch:log', payload),
    finish: (result) => ipcRenderer.invoke('batch:finish', result),
    onStart: (cb) => ipcRenderer.on('batch:start', (_e, payload) => cb(payload)),
  },
};

contextBridge.exposeInMainWorld('api', api);
