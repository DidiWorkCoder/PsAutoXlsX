<template>
  <div class="batch-box">
    <div>{{ status }}</div>
    <div v-if="total">进度：{{ done }} / {{ total }}</div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { renderScene, safeName, uniqueName } from '../core/draw';
import { dataRows, loadFontByPath, loadImageByPath, loadTableByPath, rowValues, runtime, state, valuesOfRow } from '../core/store';

const status = ref('正在读取配置…');
const done = ref(0);
const total = ref(0);

/** 反斜杠拼接，跑批只在 Windows 便携版下使用 */
function joinPath(dir, name) {
  return `${String(dir).replace(/[\\/]+$/, '')}\\${String(name).replace(/^[\\/]+/, '')}`;
}

onMounted(async () => {
  let payload = null;
  try {
    payload = await window.api.batch.readConfig();
  } catch (err) {
    await window.api.batch.finish({ ok: false, message: `读取配置失败：${err.message}` });
    return;
  }
  if (!payload) {
    await window.api.batch.finish({ ok: false, message: '没有找到 config.json' });
    return;
  }
  if (payload.error) {
    await window.api.batch.finish({ ok: false, message: payload.error });
    return;
  }

  const { config, baseDir, files } = payload;
  const outDir = joinPath(baseDir, config.output?.dir || 'output');
  const format = config.output?.format || 'png';
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const log = (text) => window.api.batch.log({ dir: outDir, text }).catch(() => {});

  try {
    if (!files.image) throw new Error('配置里没有指定底图，或底图文件已丢失');
    if (!files.table) throw new Error('配置里没有指定表格，或表格文件已丢失');

    status.value = '正在加载底图与字体…';
    await loadImageByPath(files.image);
    if (files.font) {
      try {
        await loadFontByPath(files.font);
      } catch {
        await log('[警告] 自定义字体加载失败，已改用系统默认字体');
      }
    }

    status.value = '正在解析表格…';
    await loadTableByPath(files.table, config.sheetName);

    state.skipRows = Number(config.skipRows) || 0;
    state.firstRowAsHeader = config.firstRowAsHeader !== false;
    state.nameColumn = config.nameColumn || '';
    state.boxes.splice(0, state.boxes.length, ...(config.boxes || []).map((b) => ({ ...b })));

    const rows = dataRows();
    if (!rows.length) throw new Error('表格里没有可用数据，请检查「舍弃前几行」设置');
    if (!state.boxes.length) throw new Error('配置里没有任何文本框');
    total.value = rows.length;

    await log(`===== ${new Date().toLocaleString()} 开始生成，共 ${rows.length} 条 =====`);

    const canvas = document.createElement('canvas');
    const used = new Set();
    const prefix = config.output?.prefix || '';
    const suffix = config.output?.suffix || '';
    let failed = 0;

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
      const base = safeName(`${prefix}${raw || ''}${suffix}`, `row_${i + 1}`);
      const name = uniqueName(base, used);
      try {
        await window.api.batch.write({ dir: outDir, name, dataUrl: canvas.toDataURL(mime, 0.95), format });
      } catch (err) {
        failed += 1;
        await log(`[失败] ${name}.${format} - ${err.message}`);
      }
      done.value = i + 1;
      status.value = `正在生成 ${done.value} / ${rows.length}`;
      // 每 20 张让出一次事件循环，避免长任务把进程阻塞死
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }

    await log(`===== 完成：成功 ${rows.length - failed} 张，失败 ${failed} 张，输出目录 ${outDir} =====`);
    if (failed && failed === rows.length) {
      await window.api.batch.finish({ ok: false, message: `全部 ${failed} 张都写入失败，请检查输出目录权限` });
      return;
    }
    await window.api.batch.finish({ ok: true, message: `已生成 ${rows.length - failed} 张图片`, outDir });
  } catch (err) {
    await log(`[失败] ${err.message}`);
    await window.api.batch.finish({ ok: false, message: err.message });
  }
});
</script>
