<template>
  <div>
    <div class="set-section">底图</div>
    <div class="set-row">
      <span class="set-label">图片</span>
      <a-button size="small" @click="onPickImage">选择底图</a-button>
    </div>
    <div v-if="state.imageName" class="set-tip">{{ state.imageName }} · {{ state.imageW }} × {{ state.imageH }}</div>
    <div v-else class="set-tip">选一张要批量套打的图片作为底图。</div>

    <div class="set-section">表格数据</div>
    <div class="set-row">
      <span class="set-label">Excel 文件</span>
      <a-button size="small" @click="onPickTable">导入表格</a-button>
    </div>
    <div v-if="state.tableFileName" class="set-tip">{{ state.tableFileName }}</div>

    <template v-if="state.sheetNames.length">
      <div class="set-row">
        <span class="set-label">工作表</span>
        <a-select
          :value="state.sheetName"
          :options="sheetOptions"
          size="small"
          :style="{ width: '150px' }"
          @change="onSheet"
        />
      </div>
      <div class="set-row">
        <span class="set-label">
          舍弃前几行
          <div class="set-tip">表格开头的标题行、说明行不计入数据</div>
        </span>
        <a-input-number
          :value="state.skipRows"
          :min="0"
          :max="Math.max(0, state.rows.length - 1)"
          size="small"
          :style="{ width: '90px' }"
          @change="onSkipRows"
        />
      </div>
      <div class="set-row">
        <span class="set-label">
          首行作为表头
          <div class="set-tip">只用来给列下拉显示名字，不生成图片</div>
        </span>
        <a-switch :checked="state.firstRowAsHeader" size="small" @change="onHeaderToggle" />
      </div>
      <div class="set-row">
        <span class="set-label">
          命名列
          <div class="set-tip">用这一列的值当文件名，可与文字列是同一列</div>
        </span>
        <a-select v-model:value="state.nameColumn" :options="columnOptions" size="small" :style="{ width: '150px' }" />
      </div>
      <div class="set-row">
        <span class="set-label">将生成</span>
        <a-tag color="blue" style="margin: 0">{{ rowCount }} 张</a-tag>
      </div>

      <div class="set-section">数据预览（点一行切换画布预览）</div>
      <a-table
        class="preview-table"
        size="small"
        :columns="previewColumns"
        :data-source="previewData"
        :pagination="false"
        :scroll="{ y: 220, x: 'max-content' }"
        :row-class-name="rowClass"
        :custom-row="customRow"
      />
    </template>
    <div v-else class="set-tip" style="padding-top: 8px">还没有导入表格，导入后即可把文本框绑定到某一列。</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import { colLetter } from '../core/table';
import {
  applySheet,
  columns,
  dataRows,
  headerRow,
  pickImage,
  pickTable,
  state,
} from '../core/store';

const sheetOptions = computed(() => state.sheetNames.map((n) => ({ value: n, label: n })));
const columnOptions = computed(() => columns());
const rowCount = computed(() => dataRows().length);

/** 预览表只渲染前 200 行，避免大表格卡住界面 */
const previewData = computed(() =>
  dataRows()
    .slice(0, 200)
    .map((row, i) => {
      const rec = { __index: i, key: i };
      for (let c = 0; c < state.colCount; c += 1) rec[colLetter(c)] = row[c] ?? '';
      return rec;
    }),
);

const previewColumns = computed(() => {
  const head = headerRow();
  const out = [];
  for (let i = 0; i < state.colCount; i += 1) {
    const key = colLetter(i);
    const title = String(head[i] ?? '').trim();
    out.push({ title: title ? `${key} · ${title}` : key, dataIndex: key, key, ellipsis: true, width: 130 });
  }
  return out;
});

function rowClass(record) {
  return record.__index === state.previewRowIndex ? 'row-active' : '';
}

function customRow(record) {
  return {
    onClick: () => {
      state.previewRowIndex = record.__index;
    },
  };
}

async function onPickImage() {
  const res = await pickImage();
  if (res && res.ok === false && !res.canceled) message.error(res.message || '选择底图失败');
}

async function onPickTable() {
  const res = await pickTable();
  if (!res || res.canceled) return;
  if (res.ok === false) message.error(res.message || '导入表格失败');
  else message.success(`已导入 ${state.tableFileName}`);
}

function onSheet(name) {
  applySheet(name);
  state.previewRowIndex = 0;
}

function onSkipRows(v) {
  state.skipRows = Math.max(0, v || 0);
  state.previewRowIndex = 0;
}

function onHeaderToggle(v) {
  state.firstRowAsHeader = !!v;
  state.previewRowIndex = 0;
}
</script>
