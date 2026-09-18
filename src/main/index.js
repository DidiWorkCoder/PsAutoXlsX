import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { basename, dirname, extname, join, isAbsolute } from 'path';
import fs from 'fs';

/** 是否强制显示界面 */
const forceUi = process.argv.includes('--ui');
/** 打包后的 exe 旁边放着 config.json 就进静默跑批；开发模式永远显示界面 */
const batchDir = app.isPackaged && !forceUi ? findBatchDir() : '';
/** 跑批模式不参与单实例锁：界面对着开着时双击 exe 也要能正常跑批 */
const hasSingleInstance = batchDir ? true : app.requestSingleInstanceLock();

let mainWindow = null;
/** 跑批模式下的配置文件绝对路径，非空表示静默模式 */
let batchConfigPath = '';
/** 跑批模式下的工作目录（exe 所在目录） */
let batchBaseDir = '';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'bmp', 'webp'];
const FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];

/** detach 掉全局单例的干扰，直接给 webPreferences */
function baseWebPreferences() {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
  };
}

function loadRenderer(win, query = '') {
  const url = process.env.ELECTRON_RENDERER_URL;
  if (url) win.loadURL(`${url}${query}`);
  else win.loadFile(join(__dirname, '../renderer/index.html'), { search: query.replace(/^\?/, '') });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: '批量图片文字生成器',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: baseWebPreferences(),
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  loadRenderer(mainWindow);
}

/** 静默跑批：窗口不显示，只用来做 canvas 渲染 */
function createBatchWindow(cfgPath, baseDir) {
  batchConfigPath = cfgPath;
  batchBaseDir = baseDir;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    skipTaskbar: true,
    webPreferences: baseWebPreferences(),
  });
  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });
  loadRenderer(win, `?mode=batch&base=${encodeURIComponent(baseDir)}`);
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('batch:start', { configPath: cfgPath });
  });
}

/** 可能存放 config.json 的目录候选：便携版原始 exe 目录 → 真实 exe 目录 → 当前工作目录 */
function baseDirCandidates() {
  const list = [];
  const forced = process.argv.find((a) => a.startsWith('--base='));
  if (forced) list.push(forced.slice(7));
  if (process.env.PORTABLE_EXECUTABLE_DIR) list.push(process.env.PORTABLE_EXECUTABLE_DIR);
  if (process.env.PORTABLE_EXECUTABLE_FILE) list.push(dirname(process.env.PORTABLE_EXECUTABLE_FILE));
  try {
    list.push(dirname(app.getPath('exe')));
  } catch {
    /* 忽略 */
  }
  try {
    list.push(process.cwd());
  } catch {
    /* 忽略 */
  }
  return [...new Set(list.filter(Boolean))];
}

/** exe 所在目录：便携版要取原始 exe 的目录，而不是临时解压目录 */
function resolveBaseDir() {
  return baseDirCandidates()[0] || process.cwd();
}

/** 找到放着 config.json 的目录，找不到返回空串 */
function findBatchDir() {
  for (const dir of baseDirCandidates()) {
    if (fs.existsSync(join(dir, 'config.json'))) return dir;
  }
  return '';
}

/** 当前运行的这个 exe 文件本身（便携版为单文件，可直接拷走） */
function resolveSelfExe() {
  if (!app.isPackaged) return '';
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE;
  return app.getPath('exe');
}

function mimeOf(file) {
  const ext = extname(file).slice(1).toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    bmp: 'image/bmp',
    webp: 'image/webp',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  return map[ext] || 'application/octet-stream';
}

function dataUrlToBuffer(dataUrl) {
  const idx = String(dataUrl).indexOf(',');
  return Buffer.from(String(dataUrl).slice(idx + 1), 'base64');
}

/** 把可能与配置同级的相对路径还原成绝对路径 */
function absOf(base, p) {
  if (!p) return '';
  return isAbsolute(p) ? p : join(base, p);
}

function registerIpc() {
  ipcMain.handle('app:getPaths', () => {
    const baseDir = app.isPackaged ? resolveBaseDir() : process.cwd();
    return {
      baseDir,
      selfExe: resolveSelfExe(),
      isPackaged: app.isPackaged,
      isPortable: !!process.env.PORTABLE_EXECUTABLE_FILE,
      defaultOutputDir: join(baseDir, 'output'),
      version: app.getVersion(),
    };
  });

  ipcMain.handle('shell:openPath', async (_e, p) => {
    if (!p) return '';
    return shell.openPath(p);
  });

  ipcMain.handle('shell:showItem', (_e, p) => {
    if (p) shell.showItemInFolder(p);
  });

  ipcMain.handle('dialog:pickImage', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择底图',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: IMAGE_EXT }],
    });
    return r.canceled ? '' : r.filePaths[0] || '';
  });

  ipcMain.handle('dialog:pickXlsx', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择表格',
      properties: ['openFile'],
      filters: [{ name: 'Excel 表格', extensions: ['xlsx', 'xls', 'csv'] }],
    });
    return r.canceled ? '' : r.filePaths[0] || '';
  });

  ipcMain.handle('dialog:pickFont', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择字体文件',
      properties: ['openFile'],
      filters: [{ name: '字体', extensions: FONT_EXT }],
    });
    return r.canceled ? '' : r.filePaths[0] || '';
  });

  ipcMain.handle('dialog:pickDir', async (_e, defaultPath) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath || undefined,
    });
    return r.canceled ? '' : r.filePaths[0] || '';
  });

  /** 读文件：图片 / 字体 / 表格都用它，统一返回 dataURL */
  ipcMain.handle('file:read', async (_e, file) => {
    if (!file || !fs.existsSync(file)) return null;
    const buf = await fs.promises.readFile(file);
    const ext = extname(file).slice(1).toLowerCase();
    return {
      path: file,
      name: basename(file),
      ext,
      size: buf.length,
      dataUrl: `data:${mimeOf(file)};base64,${buf.toString('base64')}`,
    };
  });

  /** 批量写图片到指定目录 */
  ipcMain.handle('file:writeImages', async (_e, payload) => {
    const { dir, items, format = 'png' } = payload || {};
    if (!dir) return { ok: false, message: '未指定输出目录', written: 0, files: [] };
    await fs.promises.mkdir(dir, { recursive: true });
    const files = [];
    for (const it of items || []) {
      const target = join(dir, `${it.name}.${format}`);
      await fs.promises.writeFile(target, dataUrlToBuffer(it.dataUrl));
      files.push(target);
    }
    return { ok: true, written: files.length, files };
  });

  /** 导出配置包：一个文件夹 = exe + 原图 + 表格 + 字体 + config.json */
  ipcMain.handle('pack:export', async (_e, payload) => {
    const {
      folderName = '批量生成配置',
      imagePath,
      tablePath,
      fontPath,
      table = {},
      nameColumn = '',
      boxes = [],
      output = {},
      selfExe = '',
      parentDir = '',
    } = payload || {};

    let base = parentDir;
    if (!base) {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: '选择导出位置',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (r.canceled) return { ok: false, canceled: true };
      base = r.filePaths[0];
    }

    const target = join(base, folderName);
    await fs.promises.mkdir(target, { recursive: true });

    const copied = { image: '', table: '', font: '', exe: '' };
    const copyIn = async (src, asName) => {
      if (!src || !fs.existsSync(src)) return '';
      const name = asName || basename(src);
      await fs.promises.copyFile(src, join(target, name));
      return name;
    };

    copied.image = await copyIn(imagePath);
    copied.table = await copyIn(tablePath);
    copied.font = await copyIn(fontPath);

    // 便携版 exe 是单文件，直接拷进来即可双击运行
    const exeSrc = selfExe || resolveSelfExe();
    if (exeSrc && fs.existsSync(exeSrc)) {
      copied.exe = await copyIn(exeSrc, 'PsAuto.exe');
    }

    const config = {
      version: 1,
      image: copied.image,
      table: copied.table,
      font: copied.font,
      sheetName: table.sheetName || '',
      skipRows: table.skipRows || 0,
      firstRowAsHeader: table.firstRowAsHeader !== false,
      nameColumn,
      boxes,
      output: {
        dir: output.dirName || 'output',
        format: output.format || 'png',
        prefix: output.prefix || '',
        suffix: output.suffix || '',
      },
    };
    await fs.promises.writeFile(join(target, 'config.json'), JSON.stringify(config, null, 2), 'utf8');

    return { ok: true, target, copied, exeMissing: !copied.exe };
  });

  /** 跑批：主进程读配置原文交给渲染进程 */
  ipcMain.handle('batch:readConfig', async () => {
    if (!batchConfigPath || !fs.existsSync(batchConfigPath)) return null;
    const raw = await fs.promises.readFile(batchConfigPath, 'utf8');
    let config = {};
    try {
      config = JSON.parse(raw);
    } catch {
      return { error: '配置文件 config.json 格式不正确' };
    }
    return {
      config,
      baseDir: batchBaseDir,
      files: {
        image: absOf(batchBaseDir, config.image),
        table: absOf(batchBaseDir, config.table),
        font: absOf(batchBaseDir, config.font),
      },
    };
  });

  ipcMain.handle('batch:write', async (_e, { dir, name, dataUrl, format }) => {
    await fs.promises.mkdir(dir, { recursive: true });
    const target = join(dir, `${name}.${format || 'png'}`);
    await fs.promises.writeFile(target, dataUrlToBuffer(dataUrl));
    return target;
  });

  ipcMain.handle('batch:log', async (_e, { dir, text }) => {
    if (!dir) return '';
    await fs.promises.mkdir(dir, { recursive: true });
    const target = join(dir, '生成日志.txt');
    await fs.promises.appendFile(target, `${text}\n`, 'utf8');
    return target;
  });

  ipcMain.handle('batch:finish', async (_e, result) => {
    const { ok, message = '', outDir = '' } = result || {};
    if (!ok && message) {
      dialog.showErrorBox('生成失败', message);
    }
    setTimeout(() => app.quit(), 200);
    return true;
  });
}

if (!hasSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 跑批模式没有可见界面，重复双击直接忽略
    if (batchConfigPath) return;
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();

    if (batchDir) createBatchWindow(join(batchDir, 'config.json'), batchDir);
    else createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
