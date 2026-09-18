/** 图片与自定义字体的加载（界面预览、批量导出、静默跑批共用） */

export function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败，请确认文件是有效的图片'));
    img.src = dataUrl;
  });
}

let fontSeq = 0;

/** 注册一个自定义字体文件，返回可直接用在 canvas 上的 family 名 */
export async function loadUserFont(dataUrl, label) {
  const family = `PsAutoFont_${Date.now()}_${(fontSeq += 1)}`;
  const face = new FontFace(family, `url(${dataUrl})`);
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
  return { family, label: label || '自定义字体' };
}

export function pickerDataUrlForExt(ext) {
  const map = {
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  return map[String(ext || '').toLowerCase()] || 'font/ttf';
}
