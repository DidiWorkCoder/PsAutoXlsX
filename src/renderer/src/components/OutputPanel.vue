<template>
  <div>
    <div class="set-section">输出目录</div>
    <div class="set-row">
      <span class="set-label" style="word-break: break-all">{{ state.output.dir || '未选择' }}</span>
    </div>
    <div class="set-row">
      <a-space>
        <a-button size="small" @click="onPickDir">选择目录</a-button>
        <a-button size="small" :disabled="!state.output.dir" @click="openDir">打开目录</a-button>
      </a-space>
    </div>

    <div class="set-section">文件命名</div>
    <div class="set-row">
      <span class="set-label">格式</span>
      <a-segmented v-model:value="state.output.format" size="small" :options="formatOptions" />
    </div>
    <div class="set-row">
      <span class="set-label">前缀</span>
      <a-input v-model:value="state.output.prefix" size="small" placeholder="可留空" :style="{ width: '150px' }" />
    </div>
    <div class="set-row">
      <span class="set-label">后缀</span>
      <a-input v-model:value="state.output.suffix" size="small" placeholder="可留空" :style="{ width: '150px' }" />
    </div>
    <div class="set-tip">文件名 = 前缀 + 「{{ nameColumnLabel }}」列的值 + 后缀；重名会自动加序号。</div>

    <div class="set-section">批量生成</div>
    <a-button type="primary" block :loading="generating" :disabled="!canGenerate" @click="onGenerate">
      生成 {{ rowCount }} 张图片
    </a-button>
    <div v-if="progress" class="set-tip" style="padding-top: 8px">{{ progress }}</div>
    <div v-if="lastResult" class="set-tip" style="padding-top: 8px">{{ lastResult }}</div>

    <div class="set-section">导出配置包</div>
    <div class="set-tip">
      导出后会得到一个文件夹：PsAuto.exe + 原图 + 表格 + 字体 + config.json。把它整个拷给同事，双击 exe 即可自动生成到 output 目录，无需再配置。
    </div>
    <a-button block :loading="exporting" style="margin-top: 8px" :disabled="!canExport" @click="onExport">
      导出配置包（含 exe）
    </a-button>
    <div v-if="packResult" class="set-tip" style="padding-top: 8px">{{ packResult }}</div>
    <div v-if="exeMissingTip" class="set-tip" style="padding-top: 8px; color: #fa8c16">{{ exeMissingTip }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { columns, dataRows, exportPackage, generateImages, state } from '../core/store';

const formatOptions = [
  { label: 'PNG', value: 'png' },
  { label: 'JPG', value: 'jpg' },
];

const generating = ref(false);
const exporting = ref(false);
const progress = ref('');
const lastResult = ref('');
const packResult = ref('');
const exeMissingTip = ref('');

const rowCount = computed(() => dataRows().length);
const canGenerate = computed(() => !!state.imageUrl && state.boxes.length > 0 && rowCount.value > 0);
const canExport = computed(() => !!state.imagePath && !!state.tablePath);
const nameColumnLabel = computed(() => {
  const found = columns().find((c) => c.value === state.nameColumn);
  return found ? found.label : state.nameColumn || '命名';
});

async function onPickDir() {
  const p = await window.api.pickDir(state.output.dir);
  if (p) state.output.dir = p;
}

function openDir() {
  window.api.openPath(state.output.dir);
}

async function onGenerate() {
  generating.value = true;
  lastResult.value = '';
  progress.value = '';
  try {
    const res = await generateImages(state.output.dir, (n, t) => {
      progress.value = `正在生成 ${n} / ${t}`;
    });
    if (!res || res.ok === false) {
      message.error((res && res.message) || '生成失败');
      lastResult.value = (res && res.message) || '生成失败';
      return;
    }
    lastResult.value = `已生成 ${res.count} 张图片到 ${res.dir}`;
    message.success(`已生成 ${res.count} 张图片`);
  } finally {
    generating.value = false;
    progress.value = '';
  }
}

async function onExport() {
  exporting.value = true;
  packResult.value = '';
  exeMissingTip.value = '';
  try {
    const res = await exportPackage();
    if (!res || res.canceled) return;
    if (res.ok === false) {
      message.error(res.message || '导出失败');
      return;
    }
    packResult.value = `已导出到 ${res.target}`;
    message.success('配置包已导出');
    if (res.exeMissing) {
      exeMissingTip.value = '开发模式下没有打包好的 exe，正式打包后再导出就会包含 PsAuto.exe。';
    }
  } finally {
    exporting.value = false;
  }
}
</script>
