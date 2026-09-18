import * as XLSX from 'xlsx';

/** 0 -> A、25 -> Z、26 -> AA */
export function colLetter(index) {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function letterToIndex(letter) {
  let n = 0;
  for (const ch of String(letter || '').toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** 把表格解析成二维数组，保留空白列以免列号错位 */
export function parseTable(base64) {
  // cellNF 让单元格带上数字格式（.z），否则无法判断一个数字是不是日期
  const wb = XLSX.read(base64, { type: 'base64', cellNF: true });
  return { sheetNames: wb.SheetNames, workbook: wb };
}

/** 可选日期输出格式：original 表示跟表格里显示的一致 */
export const DATE_FORMATS = [
  { value: 'original', label: '原样（跟表格一致）' },
  { value: 'mmm-d-yyyy', label: 'May 24,2024' },
  { value: 'dd-mmm-yyyy-upper', label: '23-MAY-2024' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 按指定格式重排日期序列号，返回 null 表示保持表格原样 */
export function formatDate(serial, dateFormat) {
  if (!dateFormat || dateFormat === 'original') return null;
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.y) return null;
  const mon = MONTHS[(d.m || 1) - 1] || '';
  if (dateFormat === 'mmm-d-yyyy') return `${mon} ${d.d},${d.y}`;
  if (dateFormat === 'dd-mmm-yyyy-upper') return `${String(d.d).padStart(2, '0')}-${mon.toUpperCase()}-${d.y}`;
  return null;
}

/**
 * 单元格取值：日期在 xlsx 里存的是数字序列号（如 45384），
 * 这里换成表格里实际显示的文本（如 7-Aug-24），其它单元格保持原值。
 */
function cellText(cell) {
  if (!cell) return '';
  if (cell.t === 'n' && XLSX.SSF.is_date(cell.z)) return cell.w ?? String(cell.v);
  return cell.v === undefined || cell.v === null ? cell.w ?? '' : cell.v;
}

/** 日期单元格返回它的序列号（供文本框换格式用），其它返回 null */
function cellSerial(cell) {
  if (!cell || cell.t !== 'n' || !cell.w || !XLSX.SSF.is_date(cell.z)) return null;
  return cell.v;
}

export function readSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws || !ws['!ref']) return { rows: [], colCount: 0, dateSerials: [] };
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  const dateSerials = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = [];
    const serials = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cellText(cell));
      serials.push(cellSerial(cell));
    }
    rows.push(row);
    dateSerials.push(serials);
  }
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return { rows, colCount, dateSerials };
}
