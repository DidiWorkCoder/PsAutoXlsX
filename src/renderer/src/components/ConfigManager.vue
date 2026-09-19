<template>
  <a-modal
    :open="open"
    title="配置管理"
    :width="740"
    :footer="null"
    @cancel="close"
  >
    <div class="set-row">
      <span class="set-label">配置名</span>
      <a-input
        v-model:value="name"
        size="small"
        placeholder="给这份配置起个名字"
        :style="{ width: '200px' }"
        @pressEnter="onSaveDefault"
      />
      <a-button type="primary" size="small" :disabled="!canSave" @click="onSaveDefault">保存</a-button>
      <a-button size="small" :disabled="!canSave" @click="onSaveCustom">保存到自定义位置</a-button>
    </div>
    <div class="set-tip">
      默认保存到 <code>{{ cfgDir || '（读取中…）' }}</code>，每份配置是一个文件夹，里面除
      <code>config.json</code> 外还会存一份底图、表格和字体，原文件丢了也能从这里找回来；重名时会提示覆盖。
    </div>
    <div class="set-tip" style="padding-top: 4px">
      当前配置：{{ state.configFile || '尚未保存到本机' }}
      <template v-if="!canSave"><br />选好底图后才能保存。</template>
    </div>

    <a-divider style="margin: 12px 0" />

    <div class="set-row">
      <span class="set-label">
        新建
        <div class="set-tip">清空当前界面，从一张底图重新开始</div>
      </span>
      <a-button size="small" @click="onNew">新建空白配置</a-button>
    </div>

    <div class="set-section">历史配置（{{ items.length }} 份）</div>
    <div class="set-tip" v-if="items.length">载入一份继续编辑，或直接关闭本窗口开始新建。</div>
    <a-empty
      v-if="!items.length"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      description="本机还没有保存过配置"
    />
    <div v-else class="cfg-list">
      <div
        v-for="it in items"
        :key="it.path"
        class="cfg-item"
        :class="{ active: it.path === state.configFile }"
      >
        <div class="cfg-main">
          <div class="cfg-name">{{ it.name }}</div>
          <div class="cfg-meta">
            <span>{{ it.boxCount }} 个文本框</span>
            <span v-if="it.imageName">底图 {{ it.imageName }}</span>
            <span v-if="it.tableName">表格 {{ it.tableName }}</span>
            <span v-if="it.savedAt">{{ fmtTime(it.savedAt) }}</span>
          </div>
        </div>
        <a-space size="small">
          <a-button size="small" @click="onLoad(it)">载入</a-button>
          <a-button size="small" :disabled="!canSave" @click="onOverwrite(it)">更新</a-button>
          <a-button size="small" @click="openRename(it)">重命名</a-button>
          <a-popconfirm title="确定删除这份配置？" ok-text="删除" cancel-text="取消" @confirm="onDelete(it)">
            <a-button size="small" danger>删除</a-button>
          </a-popconfirm>
        </a-space>
      </div>
    </div>

    <a-modal
      v-model:open="renameOpen"
      title="重命名配置"
      :width="360"
      ok-text="确定"
      cancel-text="取消"
      @ok="doRename"
    >
      <a-input v-model:value="renameValue" placeholder="新的配置名" @pressEnter="doRename" />
    </a-modal>
  </a-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { Empty, Modal, message } from 'ant-design-vue';
import { applyWorkspaceConfig, resetWorkspace, snapshotConfig, state } from '../core/store';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['update:open']);

const items = ref([]);
const cfgDir = ref('');
const name = ref('');

const renameOpen = ref(false);
const renameValue = ref('');
let renaming = null;

const canSave = computed(() => !!state.imagePath);

function close() {
  emit('update:open', false);
}

/** 默认配置名：底图文件名 + _配置 */
function defaultName() {
  const base = (state.imageName || '').replace(/\.[^.]+$/, '');
  return base ? `${base}_配置` : '未命名配置';
}

async function refresh() {
  try {
    const res = await window.api.config.list();
    cfgDir.value = res.dir || '';
    items.value = res.items || [];
  } catch {
    items.value = [];
  }
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    name.value = state.configName || defaultName();
    refresh();
  },
);

/** 写入配置；同名且未允许覆盖时返回 exists，交给调用方决定 */
async function write({ path = '', dir = '', name: saveName, overwrite = false }) {
  const data = snapshotConfig();
  data.name = saveName;
  return window.api.config.save({ path, dir, name: saveName, data, overwrite });
}

/** 带「同名覆盖」确认的保存 */
async function saveWithConfirm({ path = '', dir = '', name: saveName, overwrite = false }) {
  const res = await write({ path, dir, name: saveName, overwrite });
  if (res && res.ok) return res;
  if (!res || !res.exists) {
    message.error((res && res.message) || '保存失败');
    return null;
  }
  return new Promise((resolve) => {
    Modal.confirm({
      title: '同名配置已存在',
      content: `已有「${saveName}」，是否覆盖？`,
      okText: '覆盖',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const retry = await write({ path: res.path, dir, name: saveName, overwrite: true });
        if (!retry || !retry.ok) message.error((retry && retry.message) || '保存失败');
        resolve(retry && retry.ok ? retry : null);
      },
      onCancel: () => resolve(null),
    });
  });
}

async function onSaveDefault() {
  const saveName = name.value.trim() || defaultName();
  // 名字没变就是更新当前配置，直接覆盖，不再多问一次
  const sameAsCurrent = !!state.configFile && saveName === state.configName;
  const res = await saveWithConfirm({ name: saveName, overwrite: sameAsCurrent });
  if (!res) return;
  name.value = saveName;
  state.configFile = res.path;
  state.configName = saveName;
  message.success(`已保存到 ${res.path}`);
  refresh();
}

async function onSaveCustom() {
  const saveName = name.value.trim() || defaultName();
  const dir = await window.api.pickDir(cfgDir.value);
  if (!dir) return;
  const res = await saveWithConfirm({ dir, name: saveName });
  if (!res) return;
  message.success(`已保存到 ${res.path}`);
}

async function onOverwrite(it) {
  Modal.confirm({
    title: '用当前界面覆盖这份配置？',
    content: `「${it.name}」将被当前的底图、表格与文本框设置覆盖，且无法撤销。`,
    okText: '覆盖',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      const res = await write({ path: it.path, name: it.name, overwrite: true });
      if (!res || !res.ok) {
        message.error((res && res.message) || '更新失败');
        return;
      }
      state.configFile = res.path;
      state.configName = it.name;
      name.value = it.name;
      message.success('配置已更新');
      refresh();
    },
  });
}

async function onLoad(it) {
  const res = await window.api.config.load(it.path);
  if (!res || !res.ok) {
    message.error((res && res.message) || '载入失败');
    return;
  }
  const { warnings } = await applyWorkspaceConfig(res.config, res.path);
  name.value = res.config.name || it.name;
  if (warnings.length) message.warning(warnings.join('；'));
  else message.success(`已载入「${name.value}」`);
  refresh();
  close();
}

function onNew() {
  Modal.confirm({
    title: '新建空白配置？',
    content: '当前界面未保存的改动会丢失。',
    okText: '新建',
    cancelText: '取消',
    onOk: () => {
      resetWorkspace();
      name.value = '';
      emit('update:open', false);
    },
  });
}

function openRename(it) {
  renaming = it;
  renameValue.value = it.name;
  renameOpen.value = true;
}

async function doRename() {
  const newName = renameValue.value.trim();
  if (!renaming) return;
  if (!newName) {
    message.warning('配置名不能为空');
    return;
  }
  const res = await window.api.config.rename({ filePath: renaming.path, name: newName });
  if (!res || !res.ok) {
    message.error((res && res.message) || '重命名失败');
    return;
  }
  if (state.configFile === renaming.path) {
    state.configFile = res.path;
    state.configName = newName;
  }
  if (name.value === renaming.name) name.value = newName;
  renaming = null;
  renameOpen.value = false;
  message.success('已重命名');
  refresh();
}

async function onDelete(it) {
  const res = await window.api.config.remove(it.path);
  if (!res || !res.ok) {
    message.error((res && res.message) || '删除失败');
    return;
  }
  // 删掉的是当前配置，就断开指向，避免下次保存时写回已删除的文件
  if (state.configFile === it.path) {
    state.configFile = '';
    state.configName = '';
  }
  message.success('已删除');
  refresh();
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped>
.cfg-list {
  max-height: 340px;
  overflow: auto;
  margin-top: 8px;
}
.cfg-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  margin-bottom: 8px;
}
.cfg-item.active {
  border-color: #91caff;
  background: #e6f4ff;
}
.cfg-main {
  min-width: 0;
}
.cfg-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cfg-meta {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
[data-theme='dark'] .cfg-item {
  border-color: #2a2a2a;
}
[data-theme='dark'] .cfg-item.active {
  border-color: #1668dc;
  background: #111d2c;
}
</style>
