<template>
  <div class="admin-view site-cards-admin">
    <AdminSection title="页面卡片">
      <template #meta>
        <span class="meta-chip">共 {{ items.length }} 张</span>
        <span class="meta-chip">{{ activePageMeta.hint }}</span>
      </template>
      <template #actions>
        <div class="head-right">
          <span v-if="orderSaving" class="meta-chip is-saving">保存顺序…</span>
          <el-button size="small" :icon="RefreshLeft" :loading="resetting" @click="resetCurrentPage">恢复默认</el-button>
          <el-button size="small" :icon="Refresh" :loading="loading" @click="fetchList">刷新</el-button>
        </div>
      </template>

      <!-- 页面 dock：选择要管理的页面 -->
      <nav ref="dockRef" class="page-dock" :class="{ 'is-wrapped': dockWrapped }">
        <button
          v-for="page in dockPages"
          :key="page.key"
          type="button"
          class="dock-item"
          :class="{ 'is-active': page.key === activePage, 'is-muted': !page.manageable }"
          :title="page.manageable ? page.hint : `${page.label}：内容列表页面，没有可配置卡片`"
          @click="page.manageable && (activePage = page.key)"
        >
          <span class="dock-name">{{ page.label }}</span>
          <span class="dock-count">{{ page.manageable ? countOf(page.key) : '—' }}</span>
        </button>
      </nav>

      <!-- 卡片列表：整行可拖拽，拖动时实时换位 -->
      <ul v-if="currentItems.length" ref="listRef" class="card-list">
        <li
          v-for="(item, index) in currentItems"
          :key="item.id"
          class="card-row"
          :class="{ 'is-dragging': isDragging(item.id), 'is-off': !item.enabledBoolean }"
          @pointerdown="onRowPointerDown(item, $event)"
        >
          <span class="drag-handle" title="按住拖动调整顺序">
            <i></i><i></i><i></i>
          </span>
          <span class="row-index">{{ index + 1 }}</span>
          <div class="row-main">
            <span class="row-title">{{ item.title }}</span>
            <span class="row-key">{{ item.key }}</span>
          </div>
          <el-tag v-if="item.page === 'system'" size="small" effect="plain" class="row-style">
            {{ getStyle(item).span === 12 ? '半宽' : '全宽' }}
          </el-tag>
          <el-switch v-model="item.enabledBoolean" size="small" @change="toggleEnabled(item)" />
          <el-button link type="primary" size="small" @click="editRow(item)">编辑</el-button>
        </li>
      </ul>
      <p v-else class="card-empty">该页面还没有可配置的卡片</p>

      <p class="dock-tip">
        按住卡片任意位置上下拖动即可调整权重，顺序自动保存；拖动中按 Esc 可取消。
      </p>
    </AdminSection>

    <el-dialog v-model="showDialog" title="编辑卡片" width="480px">
      <el-form label-position="top" :model="form">
        <el-form-item label="标题">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="启用">
          <!-- 榜单排行的「启用」由下面两个图表按钮决定：点亮任意一个=启用，全灭=不启用 -->
          <el-switch
            v-model="form.enabledBoolean"
            :disabled="form.key === 'rank-overview'"
          />
        </el-form-item>
        <!-- 榜单排行有「经典图表」和「堆叠用量图」两张卡，前台想显示哪张（或都显示）由这里决定 -->
        <el-form-item v-if="form.key === 'rank-overview'" label="榜单展示">
          <div class="rank-display-field">
            <!-- 点一下点亮、再点熄灭；可以两个都亮（=两张卡都显示） -->
            <div class="chip-row">
              <button
                v-for="option in CHART_OPTIONS"
                :key="option.value"
                type="button"
                class="rank-chip"
                :class="{ 'is-on': rankCharts.includes(option.value) }"
                :aria-pressed="rankCharts.includes(option.value)"
                @click="toggleChart(option.value)"
              >
                <span class="rank-chip-dot" aria-hidden="true"></span>{{ option.label }}
              </button>
            </div>
            <!--
              上下顺序：永远占着这块高度（未满足条件时只是隐藏），
              否则点亮/熄灭按钮会让弹窗跟着忽高忽低。
            -->
            <div class="chip-row" :class="{ 'is-hidden': rankCharts.length !== 2 }">
              <button
                v-for="option in ORDER_OPTIONS"
                :key="option.value"
                type="button"
                class="rank-chip"
                :class="{ 'is-on': formStyle.rankOrder === option.value }"
                :disabled="rankCharts.length !== 2"
                @click="formStyle.rankOrder = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </el-form-item>
        <template v-if="form.page === 'system'">
          <el-form-item label="宽度">
            <el-radio-group v-model="formStyle.span">
              <el-radio-button :value="12">半宽</el-radio-button>
              <el-radio-button :value="24">全宽</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="装饰色">
            <el-select v-model="formStyle.accent">
              <el-option label="黄色" value="bg-yellow" />
              <el-option label="绿色" value="bg-green" />
              <el-option label="蓝色" value="bg-blue" />
              <el-option label="红色" value="bg-red" />
              <el-option label="紫色" value="bg-purple" />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 拖拽时跟随指针的浮动卡片 -->
    <Teleport to="body">
      <div
        v-if="drag?.active && ghost"
        class="card-drag-ghost"
        :style="{ top: `${ghostY}px`, left: `${ghostX}px`, width: `${ghost.width}px` }"
      >
        <span class="drag-handle">
          <i></i><i></i><i></i>
        </span>
        <div class="row-main">
          <span class="row-title">{{ ghost.title }}</span>
          <span class="row-key">{{ ghost.key }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, RefreshLeft } from '@element-plus/icons-vue';
import { getSiteCards, reorderSiteCards, resetSiteCards, updateSiteCard, type SiteCard } from '../../services/admin';
import AdminSection from '../../components/admin/AdminSection.vue';

type CardRow = SiteCard & { enabledBoolean: boolean };

const PAGES = [
  // label 跟前台的叫法对齐：/ 这一页在前台叫「探索」，里面分「首页」「推荐」两个页签
  { key: 'home', label: '探索页', hint: '探索页第一个页签的板块', manageable: true },
  { key: 'system', label: '推荐页', hint: '探索页第二个页签的卡片', manageable: true },
  { key: 'about', label: '关于', hint: '关于页面的卡片（含页面头部）', manageable: true },
];

// 内容型页面目前没有可配置卡片，放在 dock 里只是为了标明全局范围
const EXTRA_PAGES = [
  { key: 'apps', label: '应用', manageable: false },
  { key: 'topics', label: '专题', manageable: false },
  { key: 'updates', label: '更新', manageable: false },
  { key: 'submit', label: '投稿', manageable: false },
  { key: 'articles', label: '文章', manageable: false },
];

const dockPages = [...PAGES, ...EXTRA_PAGES.map((page) => ({ ...page, hint: '' }))];

const items = ref<CardRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const resetting = ref(false);
const orderSaving = ref(false);
const activePage = ref('home');
const showDialog = ref(false);
const editingId = ref<number | null>(null);
const listRef = ref<HTMLElement | null>(null);
const dockRef = ref<HTMLElement | null>(null);
const dockWrapped = ref(false);
let dockObserver: ResizeObserver | null = null;

const form = ref({ title: '', enabledBoolean: true, page: 'system', key: '' });
const formStyle = ref({
  span: 24,
  accent: 'bg-yellow',
  /** rankVariant === 'both' 时谁在上面：stacked=堆叠用量图在上（默认，沿用原顺序） */
  rankOrder: 'stacked' as 'stacked' | 'classic'
});

/*
 * 榜单排行显示哪几张卡：用两个"点亮"按钮选（[] / [classic] / [stacked] / [classic, stacked]）。
 * 存进库时再折算成原来的 rankVariant 字段，前台和接口都不用改。
 */
const rankCharts = ref<Array<'classic' | 'stacked'>>(['classic']);

const CHART_OPTIONS = [
  { value: 'classic' as const, label: '经典图表' },
  { value: 'stacked' as const, label: '堆叠用量图' }
];
const ORDER_OPTIONS = [
  { value: 'stacked' as const, label: '堆叠用量图在上' },
  { value: 'classic' as const, label: '经典图表在上' }
];

/** 点一下点亮、再点熄灭（两个可以同时亮） */
const toggleChart = (value: 'classic' | 'stacked') => {
  const index = rankCharts.value.indexOf(value);
  if (index >= 0) rankCharts.value.splice(index, 1);
  else rankCharts.value.push(value);
};

// 点亮任意一个 → 自动启用；全灭 → 自动不启用
watch(rankCharts, (list) => {
  if (form.value.key === 'rank-overview') form.value.enabledBoolean = list.length > 0;
}, { deep: true });

const activePageMeta = computed(() => PAGES.find((page) => page.key === activePage.value) ?? PAGES[0]);

const countOf = (page: string) => items.value.filter((item) => item.page === page).length;

const currentItems = computed(() =>
  items.value
    .filter((item) => item.page === activePage.value)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
);

const fetchList = async () => {
  loading.value = true;
  try {
    const data = await getSiteCards();
    items.value = data.map((item) => ({ ...item, enabledBoolean: item.enabled === 1 }));
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
};

/*
 * dock 一旦换行（多行）就换成矩形外观：胶囊形在换行后两头会显得很怪。
 * 判断依据是真实渲染结果，所以窗口缩放、侧边栏折叠、卡片数量变化都能跟上。
 */
const measureDock = () => {
  const items = [...(dockRef.value?.querySelectorAll<HTMLElement>('.dock-item') ?? [])];
  if (!items.length) {
    dockWrapped.value = false;
    return;
  }
  const firstTop = items[0].getBoundingClientRect().top;
  dockWrapped.value = items.some((item) => Math.abs(item.getBoundingClientRect().top - firstTop) > 2);
};

onMounted(async () => {
  await fetchList();
  await nextTick();
  measureDock();

  window.addEventListener('resize', measureDock);
  if (dockRef.value && typeof ResizeObserver !== 'undefined') {
    dockObserver = new ResizeObserver(measureDock);
    dockObserver.observe(dockRef.value);
  }
});

watch(activePage, async () => {
  await nextTick();
  measureDock();
});

const getStyle = (row: SiteCard) => {
  try {
    return JSON.parse(row.style || '{}');
  } catch {
    return {};
  }
};

const toggleEnabled = async (row: CardRow) => {
  try {
    await updateSiteCard(row.id, { enabled: row.enabledBoolean ? 1 : 0 });
  } catch (e: any) {
    row.enabledBoolean = !row.enabledBoolean;
    ElMessage.error(e?.message || '更新失败');
  }
};

const editRow = (row: CardRow) => {
  editingId.value = row.id;
  const style = getStyle(row);
  form.value = {
    title: row.title,
    enabledBoolean: row.enabledBoolean,
    page: row.page,
    key: row.key,
  };
  formStyle.value = {
    span: style.span === 12 ? 12 : 24,
    accent: typeof style.accent === 'string' && style.accent ? style.accent : 'bg-yellow',
    rankOrder: style.rankOrder === 'classic' ? 'classic' : 'stacked',
  };
  /*
   * 把存的 rankVariant 还原成两个按钮的点亮状态。
   * 卡片本身被停用（enabled=0）时两个都不点亮 —— 和"全灭就是不启用"保持一致。
   */
  const variant = style.rankVariant === 'stacked' || style.rankVariant === 'both' ? style.rankVariant : 'classic';
  rankCharts.value = !row.enabledBoolean
    ? []
    : variant === 'both'
      ? ['classic', 'stacked']
      : variant === 'stacked'
        ? ['stacked']
        : ['classic'];
  showDialog.value = true;
};

const save = async () => {
  if (!editingId.value) return;
  saving.value = true;
  try {
    // 两个按钮的点亮状态折算回原来的 rankVariant，前台和接口都不用动
    const rankVariant: 'classic' | 'stacked' | 'both' =
      rankCharts.value.length === 2
        ? 'both'
        : rankCharts.value.includes('stacked')
          ? 'stacked'
          : 'classic';
    // 榜单卡片才写 rankVariant / rankOrder，其它卡片保持原来的 style 结构
    const stylePayload =
      form.value.key === 'rank-overview'
        ? {
            span: formStyle.value.span,
            accent: formStyle.value.accent,
            rankVariant,
            // 只有两张都显示时顺序才有意义，其余情况存默认值
            rankOrder: rankVariant === 'both' ? formStyle.value.rankOrder : 'stacked'
          }
        : { span: formStyle.value.span, accent: formStyle.value.accent };
    await updateSiteCard(editingId.value, {
      title: form.value.title,
      enabled: form.value.enabledBoolean ? 1 : 0,
      style: JSON.stringify(stylePayload),
    });
    ElMessage.success('保存成功');
    showDialog.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const resetCurrentPage = async () => {
  const page = activePageMeta.value;
  try {
    await ElMessageBox.confirm(
      `把「${page.label}」的卡片恢复成默认顺序、标题和显隐？该页面多余的卡片会被清掉。`,
      '恢复默认',
      { confirmButtonText: '恢复默认', cancelButtonText: '取消', type: 'warning' }
    );
  } catch {
    return;
  }

  resetting.value = true;
  try {
    const data = await resetSiteCards(activePage.value);
    items.value = data.map((item) => ({ ...item, enabledBoolean: item.enabled === 1 }));
    ElMessage.success(`「${page.label}」已恢复默认`);
  } catch (e: any) {
    ElMessage.error(e?.message || '恢复失败');
  } finally {
    resetting.value = false;
  }
};

// 拖拽排序：指针事件实现，鼠标 / 触屏 / 手写笔都能用；
// 拖动过程中列表实时换位，另有一个跟随指针的浮动卡片。
const drag = ref<null | {
  id: number;
  startY: number;
  offsetY: number;
  step: number;
  active: boolean;
  originalIds: number[];
}>(null);
const ghost = ref<null | { title: string; key: string; width: number }>(null);
const ghostX = ref(0);
const ghostY = ref(0);

let lastPointerY = 0;
let scrollDir = 0;
let rafId: number | null = null;

const isDragging = (id: number) => drag.value?.active === true && drag.value.id === id;

const moveLocal = (from: number, to: number) => {
  const list = [...currentItems.value];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  list.forEach((item, order) => {
    item.sort_order = order + 1;
  });
};

const restoreOrder = (ids: number[]) => {
  const map = new Map(items.value.map((item) => [item.id, item]));
  ids.forEach((id, index) => {
    const row = map.get(id);
    if (row) row.sort_order = index + 1;
  });
};

const updateDropTarget = (clientY: number) => {
  const state = drag.value;
  const listEl = listRef.value;
  if (!state || !listEl) return;

  const count = currentItems.value.length;
  if (!count) return;

  // 用「指针落点」直接换算目标下标：拖动中列表会实时重排，
  // 实时读行矩形会读到重排前的旧位置，快速拖动时顺序就会乱。
  const listTop = listEl.getBoundingClientRect().top;
  const raw = (clientY - state.offsetY - listTop) / state.step;
  const target = Math.min(Math.max(Math.round(raw), 0), count - 1);

  const from = currentItems.value.findIndex((item) => item.id === state.id);
  if (from !== -1 && target !== from) moveLocal(from, target);
};

const scrollLoop = () => {
  const state = drag.value;
  if (!state?.active || !scrollDir) {
    rafId = null;
    return;
  }
  const before = window.scrollY;
  window.scrollBy(0, scrollDir * 14);
  if (window.scrollY !== before) updateDropTarget(lastPointerY);
  rafId = requestAnimationFrame(scrollLoop);
};

const stopListening = () => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  window.removeEventListener('keydown', onKeyDown);
  document.body.classList.remove('is-card-dragging');
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  scrollDir = 0;
};

const persistOrder = async (ids: number[]) => {
  orderSaving.value = true;
  try {
    await reorderSiteCards(ids);
  } catch (e: any) {
    ElMessage.error(e?.message || '顺序保存失败');
    await fetchList();
  } finally {
    orderSaving.value = false;
  }
};

const finishDrag = async (cancelled: boolean) => {
  const state = drag.value;
  stopListening();
  drag.value = null;
  ghost.value = null;

  if (!state || !state.active) return;

  if (cancelled) {
    restoreOrder(state.originalIds);
    return;
  }

  const ids = currentItems.value.map((item) => item.id);
  if (ids.join(',') === state.originalIds.join(',')) return;
  await persistOrder(ids);
};

const onPointerUp = () => {
  finishDrag(false);
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') finishDrag(true);
};

const onPointerMove = (event: PointerEvent) => {
  const state = drag.value;
  if (!state) return;

  lastPointerY = event.clientY;

  if (!state.active) {
    if (Math.abs(event.clientY - state.startY) < 4) return;
    state.active = true;
    document.body.classList.add('is-card-dragging');
  }

  ghostY.value = event.clientY - state.offsetY;
  updateDropTarget(event.clientY);

  const edge = 70;
  scrollDir = event.clientY < edge ? -1 : event.clientY > window.innerHeight - edge ? 1 : 0;
  if (scrollDir && rafId === null) rafId = requestAnimationFrame(scrollLoop);
};

const onRowPointerDown = (row: CardRow, event: PointerEvent) => {
  if (event.button !== 0) return;

  // 行内的开关、按钮等交互控件不参与拖拽
  const target = event.target as HTMLElement | null;
  if (target?.closest('.el-switch, .el-button, input, textarea, .el-select')) return;

  const rowEl = event.currentTarget as HTMLElement;
  const rect = rowEl.getBoundingClientRect();
  const rows = listRef.value?.querySelectorAll<HTMLElement>('.card-row') ?? [];
  const secondRect = rows[1]?.getBoundingClientRect();
  // 行高 + 间距：列表里每行等高，用它换算目标位置
  const step = secondRect ? secondRect.top - rect.top : rect.height + 8;
  event.preventDefault();

  drag.value = {
    id: row.id,
    startY: event.clientY,
    offsetY: event.clientY - rect.top,
    step: step > 0 ? step : rect.height + 8,
    active: false,
    originalIds: currentItems.value.map((item) => item.id),
  };
  ghost.value = { title: row.title, key: row.key, width: rect.width };
  ghostX.value = rect.left;
  ghostY.value = rect.top;
  lastPointerY = event.clientY;

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
};

onBeforeUnmount(() => {
  stopListening();
  window.removeEventListener('resize', measureDock);
  dockObserver?.disconnect();
  dockObserver = null;
});
</script>

<style scoped>
.meta-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-chip.is-saving {
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 页面 dock */
.page-dock {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 装不下就换行；子项不许被压缩，否则窄屏会把最后几项挤没 */
  flex-wrap: wrap;
  padding: 4px;
  margin-bottom: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background-color: var(--el-fill-color-lighter);
  width: fit-content;
  max-width: 100%;
}

/* 换行成多行时改成矩形圆角 */
.page-dock.is-wrapped {
  border-radius: 12px;
}

.dock-item {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background-color: transparent;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.dock-item:hover {
  color: var(--el-text-color-primary);
}

.dock-item.is-active {
  background-color: var(--el-bg-color-overlay);
  color: var(--el-color-primary);
  box-shadow: var(--el-box-shadow-lighter);
  font-weight: 600;
}

.dock-item.is-muted {
  color: var(--el-text-color-placeholder);
  cursor: default;
}

.dock-count {
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--el-fill-color);
  font-size: 11px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.dock-item.is-active .dock-count {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

/* 卡片列表 */
.card-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-bg-color);
  cursor: grab;
  touch-action: none;
  transition: border-color 0.16s ease, background-color 0.16s ease, opacity 0.16s ease;
}

.card-row:hover {
  border-color: var(--el-border-color);
}

.card-row:active {
  cursor: grabbing;
}

.card-row.is-off {
  opacity: 0.55;
}

/* 拖动中的那一行留在原位当占位，视觉上由浮动卡片跟随指针 */
.card-row.is-dragging {
  opacity: 0.32;
  border-style: dashed;
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.drag-handle {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
}

.drag-handle i {
  display: block;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background-color: var(--el-text-color-placeholder);
}

.row-index {
  flex: 0 0 auto;
  width: 18px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.row-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-key {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-style {
  flex: 0 0 auto;
}

.card-empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.dock-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 拖拽时跟随指针的浮动卡片 */
.card-drag-ghost {
  position: fixed;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-color-primary);
  border-radius: 10px;
  background-color: var(--el-bg-color-overlay);
  box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  opacity: 0.95;
}

/*
 * 榜单展示：两组按钮各占一行（以前 div 会跟按钮挤在同一行，看着很乱）。
 * 下面那行永远占位，只是不满足条件时藏起来 —— 点按钮不会改变弹窗高度。
 *
 * 按钮用自绘的 chip，而不是 el-checkbox-button / el-radio-button：
 * 后两者在这套深色主题里选中态渲染不一致（有时看不出哪几个亮了），
 * 自己画能保证"点亮 = 主色描边 + 主色淡背景 + 字变主色"，一眼能认。
 */
.rank-display-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
}

.chip-row.is-hidden {
  visibility: hidden;
}

.rank-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background-color: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.rank-chip:hover:not(:disabled) {
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}

/* 点亮态：主色描边 + 主色淡背景 + 主色字，深色主题下也一眼可辨 */
.rank-chip.is-on {
  border-color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  color: var(--el-color-primary);
  font-weight: 600;
}

.rank-chip:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 小圆点：亮起时填主色并微微放大，额外一层"我选上了"的视觉提示 */
.rank-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-border-color-darker);
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.rank-chip.is-on .rank-chip-dot {
  background-color: var(--el-color-primary);
  transform: scale(1.3);
}

@media (max-width: 640px) {
  .section-card {
    padding: 14px 12px;
  }

  /* 标题行不换行：窄屏只留「共 N 张」，提示语先隐藏 */
  .section-left .meta-chip + .meta-chip {
    display: none;
  }

  .row-key {
    display: none;
  }
}

/* 更窄时连数量也收起来，保证标题行始终单行且不出现省略号 */
@media (max-width: 430px) {
  .section-left .meta-chip {
    display: none;
  }
}
</style>
