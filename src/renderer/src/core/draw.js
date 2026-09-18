/**
 * 画布文字渲染核心：预览和批量导出共用同一份逻辑，保证所见即所得。
 * 所有坐标都是相对底图的比例（0~1），因此与显示缩放无关。
 */

export const DEFAULT_FONT_FAMILY = 'Microsoft YaHei';

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

function quoteFamily(family) {
  const f = family || DEFAULT_FONT_FAMILY;
  return /[\s,]/.test(f) ? `"${f}"` : f;
}

export function buildFont(box, size, family) {
  const italic = box.italic ? 'italic ' : '';
  const weight = box.bold ? '700' : '400';
  return `${italic}${weight} ${size}px ${quoteFamily(family)}`;
}

/** 按宽度换行：先按空格断词，单词本身超宽时再按字符硬拆 */
export function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    if (para === '') {
      out.push('');
      continue;
    }
    let cur = '';
    for (const word of para.split(/(\s+)/).filter(Boolean)) {
      const test = cur + word;
      if (cur.trim() && ctx.measureText(test).width > maxW) {
        out.push(cur.replace(/\s+$/, ''));
        cur = word.replace(/^\s+/, '');
      } else {
        cur = test;
      }
      while (cur.length > 1 && ctx.measureText(cur).width > maxW) {
        let cut = cur.length - 1;
        while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > maxW) cut -= 1;
        out.push(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
    }
    out.push(cur.replace(/\s+$/, ''));
  }
  return out.length ? out : [''];
}

/**
 * 计算某个文本框最终的字号与行内容。
 * 不换行时若文字超出文本框宽度，会按比例缩小字号以保证一行显示。
 */
export function layoutBox(ctx, box, text, imageWidth, family) {
  const width = box.w * imageWidth;
  let fontSize = box.fontSize || 16;
  const source = String(text ?? '');

  ctx.font = buildFont(box, fontSize, family);
  const flat = source.replace(/\s*\r?\n\s*/g, ' ').trim();
  let lines = box.wrap ? wrapText(ctx, source, Math.max(width, 1)) : [flat];
  let shrunk = false;

  if (!box.wrap && box.autoShrink !== false && lines[0]) {
    const tw = ctx.measureText(lines[0]).width;
    if (tw > width && tw > 0) {
      fontSize = Math.max(1, fontSize * (width / tw));
      shrunk = true;
      ctx.font = buildFont(box, fontSize, family);
    }
  }
  return { lines, fontSize, shrunk };
}

/** 供界面显示「实际字号」用，不依赖真实画布 */
export function measureFit(box, text, imageWidth, family) {
  return layoutBox(measureCtx, box, text, imageWidth, family);
}

function drawBox(ctx, box, text, W, H, family) {
  const x = box.x * W;
  const y = box.y * H;
  const w = box.w * W;
  const h = box.h * H;

  const { lines, fontSize } = layoutBox(ctx, box, text, W, family);
  ctx.font = buildFont(box, fontSize, family);
  ctx.fillStyle = box.color || '#111111';

  // 文字不透明度：0 全透明，1 不透明（下划线一起生效）
  const alpha = Number(box.opacity);
  ctx.globalAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;

  const lineHeight = fontSize * (box.lineHeight || 1.2);
  const totalH = lines.length * lineHeight;

  let startY = y;
  if (box.valign === 'middle') startY = y + (h - totalH) / 2;
  else if (box.valign === 'bottom') startY = y + h - totalH;

  ctx.textAlign = box.align === 'center' ? 'center' : box.align === 'right' ? 'right' : 'left';
  const anchorX = box.align === 'center' ? x + w / 2 : box.align === 'right' ? x + w : x;

  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight + (lineHeight - fontSize) / 2;
    ctx.fillText(line, anchorX, ly);
    if (box.underline) {
      const tw = ctx.measureText(line).width;
      const ux = box.align === 'center' ? anchorX - tw / 2 : box.align === 'right' ? anchorX - tw : anchorX;
      const uy = Math.round(ly + fontSize * 1.05) + 0.5;
      ctx.save();
      ctx.strokeStyle = box.color || '#111111';
      ctx.lineWidth = Math.max(1, fontSize / 16);
      ctx.beginPath();
      ctx.moveTo(ux, uy);
      ctx.lineTo(ux + tw, uy);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.globalAlpha = 1;
}

/** 把内容画到画布上：底图 + 所有文本框 */
export function renderScene({ canvas, image, boxes, values, family, background }) {
  const W = image.naturalWidth || image.width;
  const H = image.naturalHeight || image.height;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.drawImage(image, 0, 0, W, H);
  for (const box of boxes) {
    // 值优先按文本框 id 取（每个框的日期格式可能不同），兼容按列号传值的老用法
    const text = values?.[box.id] ?? values?.[box.column] ?? '';
    drawBox(ctx, box, text, W, H, family);
  }
  return { width: W, height: H };
}

const ILLEGAL = /[\\/:*?"<>|]/g;

/** 文件名安全化：去掉 Windows 不允许的字符 */
export function safeName(raw, fallback = '') {
  const s = String(raw ?? '')
    .replace(ILLEGAL, '_')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return s || fallback;
}

/** 文件名去重：重复的自动加 _2、_3 */
export function uniqueName(name, used) {
  const base = name;
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${i}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
