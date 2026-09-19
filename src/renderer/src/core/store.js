import { reactive, computed } from 'vue';
import { colLetter, formatDate, letterToIndex, parseTable, readSheet } from './table';
import { renderScene, safeName, uniqueName } from './draw';
import { loadImageElement, loadUserFont } from './font';

/** 界面状态 */
export const state = reactive({
  appVersion: '',
  paths: { baseDir: '', selfExe: '', isPackaged: false },

  // 底图
  imagePath: '',
  imageName: '',
  imageUrl: '',
  imageW: 0,
  imageH: 0,

  // 自定义字体
  fontPath: '',
  fontFileName: '',
  fontFamily: '',

  // 表格
  tablePath: '',
  tableFileName: '',
  sheetNames: [],
  sheetName: '',
  rows: [],
  colCount: 0,
  skipRows: 0,
  firstRowAsHeader: true,

  // 映射
  nameColumn: 'A',

  // 文本框
  boxes: [],
  selectedId: '',

  // 预览
  previewRowIndex: 0,
  zoom: 1,

  // 输出
  output: {
    dir: '',
    dirName: 'output',
    format: 'png',
    prefix: '',
    suffix: '',
  },

  theme: 'light',

  // 本机历史配置
  configFile: '',
  configName: '',
});

/** 不参与响应式的运行时对象（DOM 元素、解析后的工作簿） */
export const runtime = {
  imageEl: null,
  workbook: null,
  // 与 state.rows 同形的日期序列号（非日期格为 null），仅用于按框换格式
  dateSerials: [],
};

export function createBox(partial = {}) {
  const index = state.boxes.length;
  return {
    id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    x: 0.08 + (index % 6) * 0.03,
    y: 0.08 + (index % 6) * 0.03,
    w: 0.3,
    h: 0.05,
    column: '',
    fontSize: 24,
    color: '#111111',
    opacity: 1,
    align: 'left',
    valign: 'middle',
    bold: false,
    italic: false,
    underline: false,
    wrap: false,
    autoShrink: true,
    lineHeight: 1.2,
    dateFormat: 'original',
    sampleText: '',
    ...partial,
  };
}

/** 表头行（仅作列名用） */
export function headerRow() {
  return state.firstRowAsHeader ? state.rows[state.skipRows] || [] : [];
}

/** 真正要生成图片的数据行（已舍弃前 N 行） */
export function dataRows() {
  return state.rows.slice(rawRowStart());
}

/** dataRows() 的行下标 -> 原始行下标 */
function rawRowStart() {
  return Math.max(0, state.skipRows + (state.firstRowAsHeader ? 1 : 0));
}

/** 列下拉选项：A · 表头名 */
export function columns() {
  const head = headerRow();
  const out = [];
  for (let i = 0; i < state.colCount; i += 1) {
    const key = colLetter(i);
    const title = String(head[i] ?? '').trim();
    out.push({ value: key, label: title ? `${key} · ${title}` : key });
  }
  return out;
}

/** 某一行的「列号 -> 值」映射 */
export function valuesOfRow(index) {
  const row = dataRows()[index] || [];
  const out = {};
  const n = Math.max(state.colCount, row.length);
  for (let i = 0; i < n; i += 1) out[colLetter(i)] = row[i] ?? '';
  return out;
}

/** 画布预览用的值：按文本框 id 存，因为每个框可以有自己的日期格式 */
export function previewValues() {
  return rowValues(state.previewRowIndex);
}

/** 某一行的「文本框 id -> 最终显示的文字」 */
export function rowValues(index) {
  const out = {};
  for (const box of state.boxes) out[box.id] = valueForBox(box, index);
  return out;
}

/** 某个文本框在某一数据行上最终显示的文字（按该框自己的日期格式重排） */
export function valueForBox(box, index) {
  if (!box.column) return box.sampleText || '';
  const ci = letterToIndex(box.column);
  const raw = rawRowStart() + index;
  const text = state.rows[raw]?.[ci] ?? '';
  const serial = runtime.dateSerials[raw]?.[ci];
  if (serial == null) return text;
  return formatDate(serial, box.dateFormat) ?? text;
}

/** 该列是否存在日期单元格（决定要不要显示日期格式选项） */
export function columnHasDate(column) {
  // dateSerials 不是响应式的，这里读一下 rows 让调用方的 computed 能随表格切换重新求值
  const rowCount = state.rows.length;
  if (!column) return false;
  const ci = letterToIndex(column);
  for (let r = rawRowStart(); r < Math.min(rowCount, runtime.dateSerials.length); r += 1) {
    if (runtime.dateSerials[r]?.[ci] != null) return true;
  }
  return false;
}

export function selectedBox() {
  return state.boxes.find((b) => b.id === state.selectedId) || null;
}

export const rowCount = computed(() => dataRows().length);

/* ---------------------------------- 底图 ---------------------------------- */

export async function loadImageByPath(filePath) {
  const f = await window.api.readFile(filePath);
  if (!f) return { ok: false, message: '读取图片失败' };
  const el = await loadImageElement(f.dataUrl);
  runtime.imageEl = el;
  state.imagePath = f.path;
  state.imageName = f.name;
  state.imageUrl = f.dataUrl;
  state.imageW = el.naturalWidth;
  state.imageH = el.naturalHeight;
  if (!state.output.dir) state.output.dir = `${state.paths.baseDir}\\output`;
  return { ok: true };
}

export async function pickImage() {
  const p = await window.api.pickImage();
  if (!p) return { ok: false, canceled: true };
  return loadImageByPath(p);
}

/* --------------------------------- 自定义字体 -------------------------------- */

export async function loadFontByPath(filePath) {
  const f = await window.api.readFile(filePath);
  if (!f) return { ok: false, message: '读取字体失败' };
  const { family } = await loadUserFont(f.dataUrl, f.name);
  state.fontPath = f.path;
  state.fontFileName = f.name;
  state.fontFamily = family;
  return { ok: true, family };
}

export async function pickFont() {
  const p = await window.api.pickFont();
  if (!p) return { ok: false, canceled: true };
  return loadFontByPath(p);
}

export function clearFont() {
  state.fontPath = '';
  state.fontFileName = '';
  state.fontFamily = '';
}

/* ---------------------------------- 表格 ---------------------------------- */

export function applySheet(name) {
  state.sheetName = name;
  const { rows, colCount, dateSerials } = readSheet(runtime.workbook, name);
  state.rows = rows;
  runtime.dateSerials = dateSerials;
  state.colCount = colCount;
  if (!state.nameColumn && colCount) state.nameColumn = 'A';
  if (state.previewRowIndex >= Math.max(dataRows().length, 1)) state.previewRowIndex = 0;
}

export async function loadTableByPath(filePath, sheetName) {
  const f = await window.api.readFile(filePath);
  if (!f) return { ok: false, message: '读取表格失败' };
  const { sheetNames, workbook } = parseTable(f.dataUrl.split(',')[1] || '');
  runtime.workbook = workbook;
  state.tablePath = f.path;
  state.tableFileName = f.name;
  state.sheetNames = sheetNames;
  applySheet(sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0]);
  return { ok: true };
}

export async function pickTable() {
  const p = await window.api.pickXlsx();
  if (!p) return { ok: false, canceled: true };
  return loadTableByPath(p);
}

/* --------------------------------- 文本框操作 -------------------------------- */

export function addBox(partial = {}) {
  const used = new Set(state.boxes.map((b) => b.column));
  let column = '';
  for (let i = 0; i < state.colCount; i += 1) {
    const key = colLetter(i);
    if (!used.has(key)) {
      column = key;
      break;
    }
  }
  const box = createBox({ column, ...partial });
  state.boxes.push(box);
  state.selectedId = box.id;
  return box;
}

export function removeBox(id) {
  const i = state.boxes.findIndex((b) => b.id === id);
  if (i < 0) return;
  state.boxes.splice(i, 1);
  if (state.selectedId === id) {
    state.selectedId = state.boxes[Math.min(i, state.boxes.length - 1)]?.id || '';
  }
}

export function duplicateBox(id) {
  const src = state.boxes.find((b) => b.id === id);
  if (!src) return null;
  const copy = createBox({ ...src, id: undefined, x: Math.min(0.95, src.x + 0.02), y: Math.min(0.95, src.y + 0.02) });
  delete copy.id;
  return addBox(copy);
}

/* --------------------------------- 生成导出 -------------------------------- */

/** 把配置里的文本框部分整理成纯数据，去掉只给界面用的字段 */
export function serializeBoxes() {
  return state.boxes.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    column: b.column,
    fontSize: b.fontSize,
    color: b.color,
    opacity: b.opacity ?? 1,
    align: b.align,
    valign: b.valign,
    bold: b.bold,
    italic: b.italic,
    underline: b.underline,
    wrap: b.wrap,
    autoShrink: b.autoShrink,
    lineHeight: b.lineHeight,
    dateFormat: b.dateFormat || 'original',
  }));
}

/** 按行生成图片并写入目录，文件名取「命名列」的值 */
export async function generateImages(dir, onProgress) {
  const targetDir = dir || state.output.dir;
  if (!runtime.imageEl) return { ok: false, message: '请先选择底图' };
  if (!state.boxes.length) return { ok: false, message: '请先在底图上添加文本框' };
  const rows = dataRows();
  if (!rows.length) return { ok: false, message: '表格里没有可用数据，请检查「舍弃前几行」设置' };
  if (!targetDir) return { ok: false, message: '请先选择输出目录' };

  const format = state.output.format || 'png';
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const canvas = document.createElement('canvas');
  const used = new Set();

  // 逐张写盘，避免把上百兆的 base64 一次性塞进 IPC
  for (let i = 0; i < rows.length; i += 1) {
    const values = rowValues(i);
    renderScene({
      canvas,
      image: runtime.imageEl,
      boxes: state.boxes,
      values,
      family: state.fontFamily,
      background: format === 'jpg' ? '#ffffff' : undefined,
    });
    const raw = state.nameColumn ? valuesOfRow(i)[state.nameColumn] : '';
    const base = safeName(`${state.output.prefix || ''}${raw || ''}${state.output.suffix || ''}`, `row_${i + 1}`);
    const name = uniqueName(base, used);
    const res = await window.api.writeImages({
      dir: targetDir,
      items: [{ name, dataUrl: canvas.toDataURL(mime, 0.95) }],
      format,
    });
    if (!res || res.ok === false) {
      return { ok: false, message: (res && res.message) || `写入第 ${i + 1} 张时报错`, count: i, dir: targetDir };
    }
    onProgress?.(i + 1, rows.length);
    // 每 20 张让出一次事件循环，避免界面长时间无响应
    if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
  }

  return { ok: true, count: rows.length, dir: targetDir };
}

/** 导出配置包：exe + 原图 + 表格 + 字体 + config.json */
export async function exportPackage() {
  if (!state.imagePath) return { ok: false, message: '请先选择底图' };
  if (!state.tablePath) return { ok: false, message: '请先导入表格' };
  const baseName = safeName((state.imageName || '').replace(/\.[^.]+$/, ''), 'batch');
  return window.api.exportPack({
    folderName: `${baseName}_导出配置`,
    imagePath: state.imagePath,
    tablePath: state.tablePath,
    fontPath: state.fontPath,
    table: {
      skipRows: state.skipRows,
      firstRowAsHeader: state.firstRowAsHeader,
      sheetName: state.sheetName,
    },
    nameColumn: state.nameColumn,
    boxes: serializeBoxes(),
    output: {
      dirName: state.output.dirName,
      format: state.output.format,
      prefix: state.output.prefix,
      suffix: state.output.suffix,
    },
  });
}

export async function initApp() {
  const paths = await window.api.getPaths();
  state.paths = paths;
  state.appVersion = paths.version;
  if (!state.output.dir) state.output.dir = `${paths.baseDir}\\output`;
}

/* ------------------------------ 本机历史配置 ------------------------------ */

/** 当前界面的完整快照：存绝对路径，供本机复用（与分发用的 config.json 不同） */
export function snapshotConfig() {
  return {
    version: 1,
    kind: 'workspace',
    name: state.configName || '',
    savedAt: new Date().toISOString(),
    imagePath: state.imagePath,
    imageName: state.imageName,
    tablePath: state.tablePath,
    tableName: state.tableFileName,
    fontPath: state.fontPath,
    fontName: state.fontFileName,
    sheetName: state.sheetName,
    skipRows: state.skipRows,
    firstRowAsHeader: state.firstRowAsHeader,
    nameColumn: state.nameColumn,
    boxes: serializeBoxes(),
    output: {
      dir: state.output.dir,
      dirName: state.output.dirName,
      format: state.output.format,
      prefix: state.output.prefix,
      suffix: state.output.suffix,
    },
  };
}

/** 把一份历史配置载回界面；文件丢失只记警告，不中断 */
export async function applyWorkspaceConfig(cfg, filePath = '') {
  const warnings = [];
  const attempt = async (fn, label, reset) => {
    try {
      const r = await fn();
      if (!r || r.ok === false) {
        warnings.push(`${label}读取失败${r?.message ? `：${r.message}` : ''}`);
        reset?.();
      }
    } catch (err) {
      warnings.push(`${label}读取失败：${err.message}`);
      reset?.();
    }
  };

  resetWorkspace({ keepOutput: true });

  if (cfg.imagePath) await attempt(() => loadImageByPath(cfg.imagePath), '底图');
  if (cfg.fontPath) await attempt(() => loadFontByPath(cfg.fontPath), '字体');
  if (cfg.tablePath) {
    await attempt(() => loadTableByPath(cfg.tablePath, cfg.sheetName), '表格', () => {
      state.rows = [];
      state.colCount = 0;
      state.sheetNames = [];
      state.sheetName = '';
      runtime.workbook = null;
      runtime.dateSerials = [];
    });
  }

  // 这些设置必须放在表格载入之后：applySheet 会把 nameColumn 重置为 A
  state.skipRows = Number(cfg.skipRows) || 0;
  state.firstRowAsHeader = cfg.firstRowAsHeader !== false;
  state.nameColumn = cfg.nameColumn || (state.colCount ? 'A' : '');
  state.previewRowIndex = 0;

  const boxes = (cfg.boxes || []).map((b) => createBox({ ...b }));
  state.boxes.splice(0, state.boxes.length, ...boxes);
  state.selectedId = boxes[0]?.id || '';

  if (cfg.output) {
    state.output.dir = cfg.output.dir || state.output.dir;
    state.output.dirName = cfg.output.dirName || 'output';
    state.output.format = cfg.output.format === 'jpg' ? 'jpg' : 'png';
    state.output.prefix = cfg.output.prefix || '';
    state.output.suffix = cfg.output.suffix || '';
  }

  state.configFile = filePath;
  state.configName = cfg.name || '';
  return { warnings };
}

/** 清空为一个全新工作区，keepOutput 为真时保留输出设置 */
export function resetWorkspace({ keepOutput = false } = {}) {
  runtime.imageEl = null;
  runtime.workbook = null;
  runtime.dateSerials = [];
  Object.assign(state, {
    imagePath: '',
    imageName: '',
    imageUrl: '',
    imageW: 0,
    imageH: 0,
    fontPath: '',
    fontFileName: '',
    fontFamily: '',
    tablePath: '',
    tableFileName: '',
    sheetNames: [],
    sheetName: '',
    rows: [],
    colCount: 0,
    skipRows: 0,
    firstRowAsHeader: true,
    nameColumn: '',
    boxes: [],
    selectedId: '',
    previewRowIndex: 0,
    zoom: 1,
    configFile: '',
    configName: '',
  });
  if (!keepOutput) {
    state.output.dir = state.paths.baseDir ? `${state.paths.baseDir}\\output` : '';
    state.output.dirName = 'output';
    state.output.format = 'png';
    state.output.prefix = '';
    state.output.suffix = '';
  }
}

