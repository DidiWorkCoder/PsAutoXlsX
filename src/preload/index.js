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

  app: {
    /** 界面处理完「退出前保存」后放行关闭 */
    confirmClose: () => ipcRenderer.invoke('app:confirmClose'),
    /** 主进程拦下关闭时通知界面 */
    onBeforeClose: (cb) => ipcRenderer.on('app:beforeClose', () => cb()),
  },

  config: {
    getDir: () => ipcRenderer.invoke('config:getDir'),
    list: () => ipcRenderer.invoke('config:list'),
    save: (payload) => ipcRenderer.invoke('config:save', payload),
    load: (filePath) => ipcRenderer.invoke('config:load', filePath),
    remove: (filePath) => ipcRenderer.invoke('config:remove', filePath),
    rename: (payload) => ipcRenderer.invoke('config:rename', payload),
  },

  batch: {
    readConfig: () => ipcRenderer.invoke('batch:readConfig'),
    write: (payload) => ipcRenderer.invoke('batch:write', payload),
    log: (payload) => ipcRenderer.invoke('batch:log', payload),
    finish: (result) => ipcRenderer.invoke('batch:finish', result),
    onStart: (cb) => ipcRenderer.on('batch:start', (_e, payload) => cb(payload)),
  },
};

contextBridge.exposeInMainWorld('api', api);
