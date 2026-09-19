import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { basename, dirname, extname, join, isAbsolute, resolve } from 'path';
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
/** 界面已确认可以关闭（用于「退出前保存」拦截） */
let allowClose = false;

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
  // 拦截关闭：先问渲染进程要不要保存配置，确认后才真正退出
  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:beforeClose');
  });
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

/** 工作配置目录：exe（开发时为项目根）同级的 config 文件夹 */
function workspaceConfigDir() {
  const base = app.isPackaged ? resolveBaseDir() : process.cwd();
  return join(base, 'config');
}

/** 配置文件名安全化：去掉 Windows 不允许的字符 */
function safeFileStem(raw) {
  const s = String(raw ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return s || `配置_${Date.now()}`;
}

/** 读配置：文件夹取里面的 config.json；旧版单文件配置直接用 */
function configJsonPath(p) {
  if (!p) return '';
  try {
    if (fs.statSync(p).isDirectory()) return join(p, 'config.json');
  } catch {
    /* 不存在，按文件处理 */
  }
  return p;
}

/** 写配置：统一落到文件夹，旧版单文件会升级成同名文件夹 */
function configFolderOf(p) {
  if (!p) return '';
  try {
    if (fs.statSync(p).isDirectory()) return p;
  } catch {
    /* 不存在，按文件路径推断 */
  }
  return p.replace(/\.json$/i, '');
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

  /** 界面处理完「退出前保存」后放行关闭 */
  ipcMain.handle('app:confirmClose', () => {
    allowClose = true;
    if (mainWindow) mainWindow.close();
    return true;
  });

  /** 本机工作配置目录（config 文件夹） */
  ipcMain.handle('config:getDir', () => workspaceConfigDir());

  /** 列出 config 目录下的历史配置，按保存时间倒序 */
  ipcMain.handle('config:list', async () => {
    const dir = workspaceConfigDir();
    if (!fs.existsSync(dir)) return { dir, items: [] };
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const items = [];
    for (const ent of entries) {
      const full = join(dir, ent.name);
      const json = ent.isDirectory()
        ? join(full, 'config.json')
        : ent.name.toLowerCase().endsWith('.json')
          ? full
          : '';
      if (!json || !fs.existsSync(json)) continue;
      try {
        const cfg = JSON.parse(await fs.promises.readFile(json, 'utf8'));
        items.push({
          file: ent.name,
          path: full,
          name: cfg.name || ent.name.replace(/\.json$/i, ''),
          savedAt: cfg.savedAt || '',
          imageName: cfg.imageName || basename(cfg.image || cfg.imagePath || ''),
          tableName: cfg.tableName || basename(cfg.table || cfg.tablePath || ''),
          boxCount: Array.isArray(cfg.boxes) ? cfg.boxes.length : 0,
          built: cfg.kind === 'workspace',
        });
      } catch {
        /* 忽略无法解析的文件 */
      }
    }
    // 本工具保存的配置排在前面（kind 为 workspace），再按时间倒序
    items.sort((a, b) => Number(b.built) - Number(a.built) || String(b.savedAt).localeCompare(String(a.savedAt)));
    return { dir, items };
  });

  /**
   * 保存配置：一份配置 = 一个自包含文件夹
   *   文件夹里放 config.json + 底图 + 表格 + 字体，原文件丢了也能从这里找回来
   *   传 path        → 覆盖写入该配置（文件夹，或旧的单文件 json）
   *   传 dir + name  → 写入 dir/<name>/
   *   都不传          → 写入默认 config 目录/<name>/
   */
  ipcMain.handle('config:save', async (_e, payload) => {
    const { path, dir, name, data, overwrite = false } = payload || {};
    const folder = path
      ? configFolderOf(path)
      : join(dir || workspaceConfigDir(), safeFileStem(name));
    const target = join(folder, 'config.json');

    if (!overwrite && fs.existsSync(target)) {
      return { ok: false, exists: true, path: folder, file: 'config.json' };
    }

    await fs.promises.mkdir(folder, { recursive: true });

    // 把底图 / 表格 / 字体一起拷进配置文件夹
    const copied = { image: '', table: '', font: '' };
    for (const key of Object.keys(copied)) {
      const src = data && data[`${key}Path`];
      if (!src || !fs.existsSync(src)) continue;
      const fileName = basename(src);
      const dest = join(folder, fileName);
      if (resolve(dest) !== resolve(src)) await fs.promises.copyFile(src, dest);
      copied[key] = fileName;
    }

    // 清掉上次保存留下、这次已经不用了的文件
    const keep = new Set(['config.json', ...Object.values(copied).filter(Boolean)]);
    for (const n of await fs.promises.readdir(folder)) {
      if (!keep.has(n)) await fs.promises.rm(join(folder, n), { recursive: true, force: true });
    }

    const record = {
      ...(data || {}),
      name: name || (data && data.name) || '',
      folder: true,
      savedAt: new Date().toISOString(),
      image: copied.image,
      table: copied.table,
      font: copied.font,
    };
    // 存的是文件夹内的相对文件名，整个文件夹搬走也还能用
    delete record.imagePath;
    delete record.tablePath;
    delete record.fontPath;

    await fs.promises.writeFile(target, JSON.stringify(record, null, 2), 'utf8');
    // 旧版单文件配置已升级成文件夹，删掉原文件
    if (path && resolve(path) !== resolve(target) && fs.existsSync(path)) {
      await fs.promises.rm(path, { force: true });
    }
    return { ok: true, path: folder, file: 'config.json', dir: folder };
  });

  /** 读取一份配置原文；文件夹里存的相对文件名在这里还原成绝对路径 */
  ipcMain.handle('config:load', async (_e, filePath) => {
    const json = configJsonPath(filePath);
    if (!json || !fs.existsSync(json)) return { ok: false, message: '配置文件不存在' };
    try {
      const cfg = JSON.parse(await fs.promises.readFile(json, 'utf8'));
      const base = dirname(json);
      const abs = (rel, old) => (rel ? (isAbsolute(rel) ? rel : join(base, rel)) : old || '');
      cfg.imagePath = abs(cfg.image, cfg.imagePath);
      cfg.tablePath = abs(cfg.table, cfg.tablePath);
      cfg.fontPath = abs(cfg.font, cfg.fontPath);
      return { ok: true, path: filePath, config: cfg };
    } catch {
      return { ok: false, message: '配置文件格式不正确' };
    }
  });

  /** 删除一份配置（整个文件夹一起删） */
  ipcMain.handle('config:remove', async (_e, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, message: '配置文件不存在' };
    await fs.promises.rm(filePath, { recursive: true, force: true });
    return { ok: true };
  });

  /** 重命名：文件夹名与内部 name 一起改 */
  ipcMain.handle('config:rename', async (_e, { filePath, name } = {}) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, message: '配置文件不存在' };
    let cfg;
    try {
      cfg = JSON.parse(await fs.promises.readFile(configJsonPath(filePath), 'utf8'));
    } catch {
      return { ok: false, message: '配置文件格式不正确' };
    }
    cfg.name = name;
    const isFolder = fs.statSync(filePath).isDirectory();

    if (!isFolder) {
      // 旧版单文件
      const target = join(dirname(filePath), `${safeFileStem(name)}.json`);
      if (target !== filePath && fs.existsSync(target)) return { ok: false, message: '已有同名配置' };
      await fs.promises.writeFile(filePath, JSON.stringify(cfg, null, 2), 'utf8');
      if (target !== filePath) await fs.promises.rename(filePath, target);
      return { ok: true, path: target, file: basename(target) };
    }

    const targetFolder = join(dirname(filePath), safeFileStem(name));
    if (targetFolder !== filePath && fs.existsSync(targetFolder)) return { ok: false, message: '已有同名配置' };
    if (targetFolder !== filePath) await fs.promises.rename(filePath, targetFolder);
    await fs.promises.writeFile(join(targetFolder, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8');
    return { ok: true, path: targetFolder, file: 'config.json' };
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
