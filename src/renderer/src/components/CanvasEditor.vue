<template>
  <div class="canvas-wrap">
    <div class="canvas-bar">
      <span class="canvas-bar-label">缩放</span>
      <a-slider
        :value="Math.round(state.zoom * 100)"
        :min="10"
        :max="400"
        :style="{ width: '150px' }"
        @change="(v) => (state.zoom = v / 100)"
      />
      <a-button size="small" @click="fitToWindow">适应窗口</a-button>
      <a-button size="small" @click="state.zoom = 1">100%</a-button>
      <a-divider type="vertical" />
      <span class="canvas-bar-label">预览第</span>
      <a-input-number
        size="small"
        :min="1"
        :max="Math.max(rowCount, 1)"
        :value="state.previewRowIndex + 1"
        :style="{ width: '70px' }"
        @change="(v) => (state.previewRowIndex = Math.max(0, (v || 1) - 1))"
      />
      <span class="canvas-bar-label">条 / 共 {{ rowCount }} 条</span>
      <a-button size="small" :disabled="state.previewRowIndex <= 0" @click="state.previewRowIndex -= 1">上一条</a-button>
      <a-button size="small" :disabled="state.previewRowIndex >= rowCount - 1" @click="state.previewRowIndex += 1">
        下一条
      </a-button>
      <span class="canvas-bar-tip">滚轮缩放 · 在图片上按住拖动可平移</span>
    </div>

    <div ref="scrollRef" class="canvas-scroll" :class="{ panning: !!pan }" @wheel.prevent="onWheel">
      <div v-if="!state.imageUrl" class="center-tip">
        <a-empty description="还没有底图，先选一张要套打的图片">
          <a-button type="primary" @click="onPickImage">选择底图</a-button>
        </a-empty>
      </div>

      <div v-else ref="stageRef" class="canvas-stage" :style="stageStyle" @mousedown="startPan">
        <canvas ref="canvasRef" class="canvas-layer" />
        <div
          v-for="box in state.boxes"
          :key="box.id"
          class="box"
          :class="{ active: box.id === state.selectedId }"
          :style="boxStyle(box)"
          @mousedown.stop="startDrag($event, box)"
        >
          <span class="box-tag">{{ tagOf(box) }}</span>
          <span
            v-for="h in HANDLES"
            :key="h"
            class="handle"
            :class="`h-${h}`"
            @mousedown.stop="startResize($event, box, h)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderScene } from '../core/draw';
import { dataRows, pickImage, previewValues, runtime, state } from '../core/store';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN_SIZE = 0.012;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

const canvasRef = ref(null);
const stageRef = ref(null);
const scrollRef = ref(null);

const rowCount = computed(() => dataRows().length);

const stageStyle = computed(() => ({
  width: `${Math.round(state.imageW * state.zoom)}px`,
  height: `${Math.round(state.imageH * state.zoom)}px`,
}));

function boxStyle(box) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  };
}

function tagOf(box) {
  const value = previewValues()[box.id] || '';
  const short = String(value).length > 14 ? `${String(value).slice(0, 14)}…` : value;
  return `${box.column || '未选列'}${short ? ` ${short}` : ''}`;
}

function render() {
  if (!canvasRef.value || !runtime.imageEl) return;
  renderScene({
    canvas: canvasRef.value,
    image: runtime.imageEl,
    boxes: state.boxes,
    values: previewValues(),
    family: state.fontFamily,
  });
}

function fitToWindow() {
  const el = scrollRef.value;
  if (!el || !state.imageW) return;
  const z = Math.min((el.clientWidth - 48) / state.imageW, (el.clientHeight - 48) / state.imageH, 1);
  state.zoom = clamp(Number(z.toFixed(3)), MIN_ZOOM, MAX_ZOOM);
  centerScroll();
}

/** 缩放后把画面居中，避免大图停在上一次的位置 */
function centerScroll() {
  const el = scrollRef.value;
  if (!el) return;
  nextTick(() => {
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  });
}

/** 滚轮缩放：以鼠标所在位置为中心 */
function onWheel(e) {
  const el = scrollRef.value;
  if (!el || !state.imageW) return;
  const rect = el.getBoundingClientRect();
  const viewX = e.clientX - rect.left;
  const viewY = e.clientY - rect.top;
  const anchorX = viewX + el.scrollLeft;
  const anchorY = viewY + el.scrollTop;
  const next = clamp(Number((state.zoom * Math.exp(-e.deltaY * 0.0015)).toFixed(4)), MIN_ZOOM, MAX_ZOOM);
  if (next === state.zoom) return;
  const ratio = next / state.zoom;
  state.zoom = next;
  nextTick(() => {
    el.scrollLeft = anchorX * ratio - viewX;
    el.scrollTop = anchorY * ratio - viewY;
  });
}

/* ------------------------------- 拖动平移 ------------------------------- */
const pan = ref(null);

/** 在图片上按住拖动（不按文本框）就是平移画布 */
function startPan(e) {
  state.selectedId = '';
  if (e.button !== 0) return;
  const el = scrollRef.value;
  if (!el) return;
  pan.value = { startX: e.clientX, startY: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  window.addEventListener('mousemove', onPanMove);
  window.addEventListener('mouseup', endPan);
}

function onPanMove(e) {
  const p = pan.value;
  const el = scrollRef.value;
  if (!p || !el) return;
  el.scrollLeft = p.left - (e.clientX - p.startX);
  el.scrollTop = p.top - (e.clientY - p.startY);
}

function endPan() {
  pan.value = null;
  window.removeEventListener('mousemove', onPanMove);
  window.removeEventListener('mouseup', endPan);
}

async function onPickImage() {
  const res = await pickImage();
  if (res?.ok) {
    await nextTick();
    fitToWindow();
    render();
  }
}

/* ------------------------------ 拖拽 / 缩放 ------------------------------ */
const drag = ref(null);

function stageRect() {
  return stageRef.value?.getBoundingClientRect() || { width: 1, height: 1 };
}

function startDrag(e, box) {
  state.selectedId = box.id;
  drag.value = { mode: 'move', box, rect: stageRect(), startX: e.clientX, startY: e.clientY, orig: { ...box } };
  bindWindow();
}

function startResize(e, box, handle) {
  state.selectedId = box.id;
  drag.value = { mode: 'resize', handle, box, rect: stageRect(), startX: e.clientX, startY: e.clientY, orig: { ...box } };
  bindWindow();
}

function onMove(e) {
  const d = drag.value;
  if (!d) return;
  const dx = (e.clientX - d.startX) / d.rect.width;
  const dy = (e.clientY - d.startY) / d.rect.height;
  const o = d.orig;

  if (d.mode === 'move') {
    d.box.x = clamp(o.x + dx, 0, 1 - o.w);
    d.box.y = clamp(o.y + dy, 0, 1 - o.h);
    return;
  }

  const h = d.handle;
  let { x, y, w, h: hh } = o;
  if (h.includes('e')) w = Math.max(MIN_SIZE, o.w + dx);
  if (h.includes('s')) hh = Math.max(MIN_SIZE, o.h + dy);
  if (h.includes('w')) {
    x = clamp(Math.min(o.x + dx, o.x + o.w - MIN_SIZE), 0, 1);
    w = o.x + o.w - x;
  }
  if (h.includes('n')) {
    y = clamp(Math.min(o.y + dy, o.y + o.h - MIN_SIZE), 0, 1);
    hh = o.y + o.h - y;
  }
  d.box.x = x;
  d.box.y = y;
  d.box.w = Math.min(w, 1 - x);
  d.box.h = Math.min(hh, 1 - y);
}

function endDrag() {
  drag.value = null;
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', endDrag);
}

function bindWindow() {
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', endDrag);
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/* --------------------------------- 快捷键 -------------------------------- */
function onKeyDown(e) {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
  const box = state.boxes.find((b) => b.id === state.selectedId);
  if (!box) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    state.selectedId = '';
    const i = state.boxes.indexOf(box);
    state.boxes.splice(i, 1);
    return;
  }
  const step = (e.shiftKey ? 10 : 1) / (stageRef.value?.clientWidth || 1000);
  const stepY = (e.shiftKey ? 10 : 1) / (stageRef.value?.clientHeight || 1000);
  const map = {
    ArrowLeft: () => (box.x = clamp(box.x - step, 0, 1 - box.w)),
    ArrowRight: () => (box.x = clamp(box.x + step, 0, 1 - box.w)),
    ArrowUp: () => (box.y = clamp(box.y - stepY, 0, 1 - box.h)),
    ArrowDown: () => (box.y = clamp(box.y + stepY, 0, 1 - box.h)),
  };
  if (map[e.key]) {
    e.preventDefault();
    map[e.key]();
  }
}

let stopWatch = null;

onMounted(() => {
  stopWatch = watch(
    [
      () => state.boxes,
      () => state.previewRowIndex,
      () => state.imageUrl,
      () => state.fontFamily,
      () => state.rows,
      () => state.skipRows,
      () => state.firstRowAsHeader,
    ],
    () => nextTick(render),
    { deep: true },
  );
  window.addEventListener('keydown', onKeyDown);
  if (state.imageUrl) {
    fitToWindow();
    render();
  }
});

onBeforeUnmount(() => {
  stopWatch?.();
  window.removeEventListener('keydown', onKeyDown);
  endDrag();
  endPan();
});

defineExpose({ render, fitToWindow });
</script>
