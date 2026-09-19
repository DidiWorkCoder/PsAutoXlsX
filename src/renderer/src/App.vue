<template>
  <a-config-provider :theme="antdTheme">
    <div class="app">
      <aside class="sider">
        <div class="sider-header">
          <span class="sider-title">文本框</span>
          <a-button type="primary" size="small" :disabled="!state.imageUrl" @click="onAddBox">新增</a-button>
        </div>
        <div class="sider-list">
          <div v-if="!state.boxes.length" class="sider-group">
            还没有文本框。先选底图，再点右上角「新增」，然后在图上拖拽摆好位置。
          </div>
          <div
            v-for="box in state.boxes"
            :key="box.id"
            class="rec-item"
            :class="{ active: box.id === state.selectedId }"
            @click="state.selectedId = box.id"
          >
            <div class="rec-title">{{ titleOf(box) }}</div>
            <div class="rec-meta">
              <a-tag color="blue" style="margin: 0">{{ box.column || '未绑定列' }}</a-tag>
              <span>{{ box.fontSize }}px</span>
              <span>{{ alignText(box.align) }}</span>
            </div>
          </div>
        </div>
        <div class="sider-footer">
          <span class="set-tip">v{{ state.appVersion || '1.0.0' }}</span>
          <a-button size="small" @click="toggleTheme">{{ state.theme === 'dark' ? '浅色' : '深色' }}</a-button>
        </div>
      </aside>

      <div class="main">
        <div class="main-header">
          <div class="header-info">
            <div class="header-row">
              <span class="sider-title">批量图片文字生成器</span>
              <a-tag v-if="state.imageName" color="blue" style="margin: 0">{{ state.imageName }}</a-tag>
              <a-tag v-if="state.tableFileName" color="green" style="margin: 0">{{ state.tableFileName }}</a-tag>
              <a-tag v-if="state.fontFileName" color="purple" style="margin: 0">{{ state.fontFileName }}</a-tag>
              <a-tag v-else color="default" style="margin: 0">默认字体</a-tag>
              <a-tag v-if="state.configName" color="gold" style="margin: 0">配置：{{ state.configName }}</a-tag>
            </div>
            <div class="header-sub">{{ subtitle }}</div>
          </div>
          <div class="header-actions">
            <a-button @click="openStartup">历史 / 新建</a-button>
            <a-button @click="onPickImage">选择底图</a-button>
            <a-button @click="onPickTable">导入表格</a-button>
            <a-button @click="onPickFont">导入字体</a-button>
            <a-button type="primary" :loading="generating" :disabled="!canGenerate" @click="onGenerate">
              {{ generating ? `生成中 ${progress}` : '生成图片' }}
            </a-button>
          </div>
        </div>

        <div class="workspace">
          <div class="split">
            <div class="split-left">
              <a-tabs v-model:activeKey="tab" size="small">
                <a-tab-pane key="data" tab="数据源"><DataPanel /></a-tab-pane>
                <a-tab-pane key="box" tab="文本框"><TextBoxPanel /></a-tab-pane>
                <a-tab-pane key="out" tab="输出"><OutputPanel /></a-tab-pane>
              </a-tabs>
            </div>
            <div class="split-right">
              <CanvasEditor />
            </div>
          </div>
        </div>
      </div>
    </div>
    <StartupDialog v-model:open="startupOpen" :dismissible="startupDismissible" @manage="configOpen = true" />
    <ConfigManager v-model:open="configOpen" />

    <a-modal
      :open="closeAskOpen"
      title="退出前保存配置？"
      :width="420"
      :footer="null"
      :closable="false"
      :maskClosable="false"
      :keyboard="false"
    >
      <div class="set-tip">
        当前工作区<template v-if="state.configName">「{{ state.configName }}」</template>的改动还没保存，直接退出会丢失。
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px">
        <a-button @click="closeAskOpen = false">取消</a-button>
        <a-button @click="onExitWithoutSave">不保存退出</a-button>
        <a-button type="primary" :loading="savingOnExit" @click="onExitWithSave">保存并退出</a-button>
      </div>
    </a-modal>
  </a-config-provider>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { message, theme } from 'ant-design-vue';
import CanvasEditor from './components/CanvasEditor.vue';
import ConfigManager from './components/ConfigManager.vue';
import DataPanel from './components/DataPanel.vue';
import OutputPanel from './components/OutputPanel.vue';
import StartupDialog from './components/StartupDialog.vue';
import TextBoxPanel from './components/TextBoxPanel.vue';
import { letterToIndex } from './core/table';
import { addBox, dataRows, generateImages, initApp, pickFont, pickImage, pickTable, snapshotConfig, state } from './core/store';

const tab = ref('data');
const generating = ref(false);
const progress = ref('');
const configOpen = ref(false);
const startupOpen = ref(false);
/** 启动时必须先选一个；手动点「历史 / 新建」打开时允许直接关掉 */
const startupDismissible = ref(false);
const closeAskOpen = ref(false);
const savingOnExit = ref(false);

const antdTheme = computed(() => ({
  algorithm: state.theme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
}));

const rowCount = computed(() => dataRows().length);
const canGenerate = computed(() => !!state.imageUrl && state.boxes.length > 0 && rowCount.value > 0);

const subtitle = computed(() => {
  if (!state.imageUrl) return '第一步：选择底图，然后在图上新增文本框';
  if (!state.tableFileName) return '第二步：导入 xlsx 表格，给每个文本框绑定对应的列';
  if (!state.boxes.length) return '第三步：点左上角「新增」在底图上添加文本框';
  return `底图 ${state.imageW} × ${state.imageH} 像素 · 共 ${state.boxes.length} 个文本框 · 表格可用数据 ${rowCount.value} 条`;
});

function titleOf(box) {
  const rows = dataRows();
  const row = rows[Math.min(state.previewRowIndex, Math.max(rows.length - 1, 0))] || [];
  const cell = box.column ? row[letterToIndex(box.column)] ?? '' : box.sampleText || '';
  const short = String(cell).length > 12 ? `${String(cell).slice(0, 12)}…` : String(cell);
  return `${box.column || '未绑定'}${short ? ` · ${short}` : ''}`;
}

function alignText(align) {
  return { left: '左对齐', center: '居中', right: '右对齐' }[align] || align;
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
}

watch(
  () => state.theme,
  (v) => {
    document.documentElement.setAttribute('data-theme', v);
  },
  { immediate: true },
);

async function onAddBox() {
  addBox();
  tab.value = 'box';
}

async function onPickImage() {
  const res = await pickImage();
  if (res && res.ok === false && !res.canceled) message.error(res.message || '选择底图失败');
  else if (res && res.ok) message.success('底图已加载');
}

async function onPickTable() {
  const res = await pickTable();
  if (!res || res.canceled) return;
  if (res.ok === false) message.error(res.message || '导入表格失败');
  else message.success(`已导入 ${state.tableFileName}，共 ${rowCount.value} 条数据`);
}

async function onPickFont() {
  const res = await pickFont();
  if (!res || res.canceled) return;
  if (res.ok === false) message.error(res.message || '导入字体失败');
  else message.success(`已应用字体 ${state.fontFileName}`);
}

async function onGenerate() {
  generating.value = true;
  progress.value = '';
  try {
    const res = await generateImages(state.output.dir, (n, t) => {
      progress.value = `${n}/${t}`;
    });
    if (!res || res.ok === false) message.error((res && res.message) || '生成失败');
    else message.success(`已生成 ${res.count} 张图片到 ${res.dir}`);
  } finally {
    generating.value = false;
    progress.value = '';
  }
}

/** 启动即弹出选择窗：载入历史配置，或新建空白配置 */
async function bootstrap() {
  await initApp();
  startupDismissible.value = false;
  startupOpen.value = true;
}

/** 头部入口：同一个弹窗，但不强制选择，可以直接关掉 */
function openStartup() {
  startupDismissible.value = true;
  startupOpen.value = true;
}

/** 退出前的默认配置名 */
function closeConfigName() {
  const base = (state.imageName || '').replace(/\.[^.]+$/, '');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return base ? `${base}_配置` : `新配置_${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 主进程拦下了关闭，问要不要保存 */
function askBeforeClose() {
  // 还没选底图，没什么可存的，直接放行
  if (!state.imagePath) {
    window.api.app.confirmClose();
    return;
  }
  closeAskOpen.value = true;
}

function onExitWithoutSave() {
  closeAskOpen.value = false;
  window.api.app.confirmClose();
}

async function onExitWithSave() {
  savingOnExit.value = true;
  try {
    const name = state.configName || closeConfigName();
    const data = snapshotConfig();
    data.name = name;
    const res = await window.api.config.save({ path: state.configFile || '', name, data, overwrite: true });
    if (!res || !res.ok) {
      message.error((res && res.message) || '保存失败');
      return;
    }
    state.configFile = res.path;
    state.configName = name;
    message.success(`已保存到 ${res.path}`);
    closeAskOpen.value = false;
    window.api.app.confirmClose();
  } finally {
    savingOnExit.value = false;
  }
}

onMounted(() => {
  window.api.app.onBeforeClose(askBeforeClose);
  bootstrap();
});
</script>
