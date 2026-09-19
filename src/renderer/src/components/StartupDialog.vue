<template>
  <a-modal
    :open="open"
    title="开始使用"
    :width="620"
    :footer="null"
    :closable="dismissible"
    :maskClosable="dismissible"
    :keyboard="dismissible"
    @cancel="close"
  >
    <div class="st-new">
      <a-input
        v-model:value="newName"
        size="large"
        placeholder="新配置名称（留空自动命名）"
        allow-clear
        @pressEnter="onNew"
      />
      <a-button type="primary" size="large" block style="margin-top: 10px" @click="onNew">新建配置</a-button>
      <div class="set-tip">清空工作区，从一张底图重新开始</div>
    </div>

    <a-divider style="margin: 16px 0 4px" />

    <div class="set-section">历史配置（{{ items.length }} 份）</div>
    <a-empty
      v-if="!items.length"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      description="还没有历史配置，点上面「新建空白配置」开始"
    />
    <div v-else class="st-list">
      <div v-for="it in items" :key="it.path" class="st-item" @click="onLoad(it)">
        <div class="st-main">
          <div class="st-name">{{ it.name }}</div>
          <div class="st-meta">
            <span>{{ it.boxCount }} 个文本框</span>
            <span v-if="it.imageName">底图 {{ it.imageName }}</span>
            <span v-if="it.tableName">表格 {{ it.tableName }}</span>
            <span v-if="it.savedAt">{{ fmtTime(it.savedAt) }}</span>
          </div>
        </div>
        <span class="st-open">载入 ›</span>
      </div>
    </div>

    <div class="st-foot">
      <a @click="onManage">配置管理</a>
      <span class="set-tip">{{ cfgDir || '（读取中…）' }}</span>
      <a-button v-if="dismissible" size="small" @click="close">关闭</a-button>
    </div>
  </a-modal>
</template>

<script setup>
import { ref, watch } from 'vue';
import { Empty, Modal, message } from 'ant-design-vue';
import { applyWorkspaceConfig, resetWorkspace, state } from '../core/store';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 是否允许直接关闭：启动时必须先选，手动打开时可以关掉 */
  dismissible: { type: Boolean, default: false },
});
const emit = defineEmits(['update:open', 'manage']);

const items = ref([]);
const cfgDir = ref('');
const newName = ref('');

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
    if (v) {
      newName.value = '';
      refresh();
    }
  },
);

/** 用户没填名字时的默认名 */
function autoName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `新配置_${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 界面上已有内容时，先确认再覆盖 */
function confirmDiscard(title, content, okText) {
  if (!state.imagePath) return Promise.resolve(true);
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      okText,
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

async function onNew() {
  if (!(await confirmDiscard('新建配置？', '当前界面未保存的改动会被清空。', '新建'))) return;
  resetWorkspace();
  // 先定好名字，之后中途保存或退出保存都用它
  state.configName = newName.value.trim() || autoName();
  emit('update:open', false);
}

async function onLoad(it) {
  if (!(await confirmDiscard(`载入「${it.name}」？`, '当前界面未保存的改动会被覆盖。', '载入'))) return;
  const res = await window.api.config.load(it.path);
  if (!res || !res.ok) {
    message.error((res && res.message) || '载入失败');
    return;
  }
  const { warnings } = await applyWorkspaceConfig(res.config, res.path);
  if (warnings.length) message.warning(warnings.join('；'));
  else message.success(`已载入「${res.config.name || it.name}」`);
  emit('update:open', false);
}

function onManage() {
  emit('update:open', false);
  emit('manage');
}

function close() {
  emit('update:open', false);
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped>
.st-new {
  text-align: center;
}
.st-new .set-tip {
  margin-top: 6px;
}
.st-list {
  max-height: 300px;
  overflow: auto;
}
.st-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.st-item:hover {
  border-color: #91caff;
  background: #e6f4ff;
}
.st-main {
  min-width: 0;
}
.st-name {
  font-size: 13px;
}
.st-meta {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.st-open {
  flex: none;
  font-size: 12px;
  color: #1677ff;
}
.st-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}
.st-foot .set-tip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
}
[data-theme='dark'] .st-item {
  border-color: #2a2a2a;
}
[data-theme='dark'] .st-item:hover {
  border-color: #1668dc;
  background: #111d2c;
}
[data-theme='dark'] .st-foot {
  border-top-color: #2a2a2a;
}
</style>
