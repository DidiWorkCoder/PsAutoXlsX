<template>
  <div>
    <div v-if="!box">
      <div class="set-section">文本框属性</div>
      <a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="先在底图上添加一个文本框">
        <a-button type="primary" :disabled="!state.imageUrl" @click="onAdd">新增文本框</a-button>
      </a-empty>
    </div>

    <div v-else>
      <div class="set-section">内容绑定</div>
      <div class="set-row">
        <span class="set-label">对应表格列</span>
        <a-select
          v-model:value="box.column"
          :options="columnOptions"
          size="small"
          allow-clear
          placeholder="选择列"
          :style="{ width: '150px' }"
        />
      </div>
      <div v-if="!box.column" class="set-row">
        <span class="set-label">预览文字</span>
        <a-input v-model:value="box.sampleText" size="small" placeholder="尚未绑定列" :style="{ width: '150px' }" />
      </div>
      <div v-if="showDateFormat" class="set-row">
        <span class="set-label">
          日期格式
          <div class="set-tip">这一列是日期，只影响当前这个文本框</div>
        </span>
        <a-select v-model:value="box.dateFormat" :options="dateFormatOptions" size="small" :style="{ width: '150px' }" />
      </div>
      <div class="set-tip">表格里第 {{ state.previewRowIndex + 1 }} 条数据的值会实时画在图上，改字号颜色立刻能看到效果。</div>

      <div class="set-section">文字样式</div>
      <div class="set-row">
        <span class="set-label">字号</span>
        <a-input-number v-model:value="box.fontSize" size="small" :min="6" :max="400" :step="1" :style="{ width: '90px' }" />
        <span class="set-tip" style="flex: 0 0 auto">px</span>
      </div>
      <div v-if="fit.shrunk" class="set-row">
        <span class="set-label set-tip">超出文本框，已自动缩小为</span>
        <a-tag color="orange" style="margin: 0">{{ fit.size }} px</a-tag>
      </div>
      <div class="set-row">
        <span class="set-label">颜色</span>
        <div class="color-input">
          <input type="color" :value="normalizedColor" @input="(e) => (box.color = e.target.value)" />
          <a-input v-model:value="box.color" size="small" :style="{ width: '90px' }" />
        </div>
      </div>
      <div class="set-row">
        <span class="set-label">不透明度</span>
        <a-slider v-model:value="opacityPct" :min="0" :max="100" :step="1" :style="{ width: '140px' }" />
        <span class="set-tip" style="flex: 0 0 auto">{{ opacityPct }}%</span>
      </div>
      <div class="set-row">
        <span class="set-label">水平对齐</span>
        <a-segmented v-model:value="box.align" size="small" :options="alignOptions" />
      </div>
      <div class="set-row">
        <span class="set-label">垂直对齐</span>
        <a-segmented v-model:value="box.valign" size="small" :options="valignOptions" />
      </div>
      <div class="set-row">
        <span class="set-label">字形</span>
        <a-checkbox-group v-model:value="styles" size="small" :options="styleOptions" />
      </div>
      <div class="set-row">
        <span class="set-label">行高</span>
        <a-input-number v-model:value="box.lineHeight" size="small" :min="0.8" :max="3" :step="0.05" :style="{ width: '90px' }" />
      </div>

      <div class="set-section">自适应</div>
      <div class="set-row">
        <span class="set-label">
          超长自动缩小
          <div class="set-tip">文字超出文本框宽度时自动缩小字号，保证一行显示完</div>
        </span>
        <a-switch v-model:checked="box.autoShrink" :disabled="box.wrap" size="small" />
      </div>
      <div class="set-row">
        <span class="set-label">
          自动换行
          <div class="set-tip">允许折行显示，开启后不再自动缩小字号</div>
        </span>
        <a-switch v-model:checked="box.wrap" size="small" />
      </div>

      <div class="set-section">位置与尺寸（百分比）</div>
      <div class="form-grid">
        <div>
          <div class="field-label">左边距 X</div>
          <a-input-number v-model:value="pct.x" size="small" :min="0" :max="100" :step="0.5" :style="{ width: '100%' }" />
        </div>
        <div>
          <div class="field-label">上边距 Y</div>
          <a-input-number v-model:value="pct.y" size="small" :min="0" :max="100" :step="0.5" :style="{ width: '100%' }" />
        </div>
        <div>
          <div class="field-label">宽度 W</div>
          <a-input-number v-model:value="pct.w" size="small" :min="1" :max="100" :step="0.5" :style="{ width: '100%' }" />
        </div>
        <div>
          <div class="field-label">高度 H</div>
          <a-input-number v-model:value="pct.h" size="small" :min="1" :max="100" :step="0.5" :style="{ width: '100%' }" />
        </div>
      </div>

      <div class="set-row" style="margin-top: 12px">
        <a-space>
          <a-button size="small" @click="onDuplicate">复制</a-button>
          <a-button size="small" danger @click="removeBox(box.id)">删除</a-button>
        </a-space>
      </div>
      <div class="set-tip">画布上可直接拖拽移动，拖四周小方块改尺寸；方向键微调，Delete 删除。</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Empty } from 'ant-design-vue';
import { measureFit } from '../core/draw';
import { DATE_FORMATS } from '../core/table';
import { addBox, columnHasDate, columns, duplicateBox, previewValues, removeBox, state } from '../core/store';

const alignOptions = [
  { label: '左', value: 'left' },
  { label: '中', value: 'center' },
  { label: '右', value: 'right' },
];
const valignOptions = [
  { label: '上', value: 'top' },
  { label: '中', value: 'middle' },
  { label: '下', value: 'bottom' },
];
const styleOptions = [
  { label: '粗体', value: 'bold' },
  { label: '斜体', value: 'italic' },
  { label: '下划线', value: 'underline' },
];

const box = computed(() => state.boxes.find((b) => b.id === state.selectedId) || null);
const columnOptions = computed(() => columns());
const dateFormatOptions = DATE_FORMATS;

/** 只有绑定的列里确实有日期时才显示日期格式选项 */
const showDateFormat = computed(() => !!box.value?.column && columnHasDate(box.value.column));

/** 勾选组与文本框字段双向同步 */
const styles = computed({
  get: () => (box.value ? styleOptions.filter((o) => box.value[o.value]).map((o) => o.value) : []),
  set: (val) => {
    if (!box.value) return;
    for (const o of styleOptions) box.value[o.value] = val.includes(o.value);
  },
});

const pct = computed(() => ({
  get x() {
    return round(box.value?.x);
  },
  set x(v) {
    if (box.value) box.value.x = (v || 0) / 100;
  },
  get y() {
    return round(box.value?.y);
  },
  set y(v) {
    if (box.value) box.value.y = (v || 0) / 100;
  },
  get w() {
    return round(box.value?.w);
  },
  set w(v) {
    if (box.value) box.value.w = (v || 1) / 100;
  },
  get h() {
    return round(box.value?.h);
  },
  set h(v) {
    if (box.value) box.value.h = (v || 1) / 100;
  },
}));

function round(v) {
  return Math.round((v || 0) * 1000) / 10;
}

const normalizedColor = computed(() => (/^#[0-9a-f]{6}$/i.test(box.value?.color || '') ? box.value.color : '#111111'));

/** 不透明度：界面用 0~100，存储用 0~1 */
const opacityPct = computed({
  get: () => Math.round((box.value?.opacity ?? 1) * 100),
  set: (v) => {
    if (box.value) box.value.opacity = Math.round(v || 0) / 100;
  },
});

/** 实际渲染字号：自动缩小时会小于设定值 */
const fit = computed(() => {
  const b = box.value;
  if (!b || !state.imageW) return { size: b?.fontSize || 0, shrunk: false };
  const text = previewValues()[b.id] || '';
  const r = measureFit(b, text, state.imageW, state.fontFamily);
  return { size: Math.round(r.fontSize * 10) / 10, shrunk: r.shrunk };
});

function onAdd() {
  addBox();
}

function onDuplicate() {
  duplicateBox(state.selectedId);
}
</script>
