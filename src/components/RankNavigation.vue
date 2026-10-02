<template>
  <!--
    自绘页签条（原来用 el-tabs）。
    原因：el-tabs 内部自己存了一份 active 状态，点一下立刻把下划线移过去，
    而下面真正的内容要等路由切换（首次还要等懒加载 chunk + 挂载）才换过来 ——
    中间那段时间就是"页签写着 A、内容还是 B"，看着像内容串页。
    这里高亮完全由 route.path 决定：路由没切过去，下划线就不会先跑。
  -->
  <div class="rank-navigation">
    <div ref="tabsRef" class="rank-tabs" role="tablist">
      <button
        v-for="(tabItem, index) in TABS"
        :key="tabItem.path"
        :ref="(el) => setTabEl(el, index)"
        type="button"
        role="tab"
        class="rank-tab"
        :class="{ 'is-active': tabItem.path === activePath }"
        :aria-selected="tabItem.path === activePath"
        @click="handleChange(tabItem.path)"
      >
        {{ tabItem.label }}
      </button>
      <!-- 一条会滑动的下划线（原来是写死在各页签上的 ::after，切换时是直接跳过去的） -->
      <span
        class="rank-tab-bar"
        :class="{ 'is-ready': barReady }"
        :style="{ width: barWidth + 'px', transform: `translateX(${barLeft}px)` }"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
// RankNavigation component
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const TABS = [
  // 名称与页面标题（router meta）保持一致，改这里记得同步改那四处
  { label: '总榜', path: '/rank/total' },
  { label: '飙升榜', path: '/rank/growth' },
  { label: '下载量', path: '/rank/history' },
  { label: '第三方应用榜', path: '/rank/non-huawei' },
  { label: '分类榜', path: '/rank/category' }
] as const;

const router = useRouter();
const route = useRoute();
const activePath = computed(() => route.path);

/* ---------- 会滑动的下划线 ---------- */
const tabsRef = ref<HTMLElement | null>(null);
const tabEls: Array<HTMLElement | null> = [];
const setTabEl = (el: unknown, index: number) => {
  tabEls[index] = (el as HTMLElement) || null;
};
const barLeft = ref(0);
const barWidth = ref(0);
/** 首次定位先不要动画：否则一进页面它就从左边滑过来，轨迹看着莫名其妙 */
const barReady = ref(false);

const updateBar = () => {
  const wrap = tabsRef.value;
  const index = TABS.findIndex((tabItem) => tabItem.path === activePath.value);
  const el = tabEls[index];
  if (!wrap || !el) return;
  // 窄屏下划线宽一点（页签变窄，70% 会显得太短）
  const ratio = window.innerWidth <= 768 ? 0.84 : 0.7;
  const width = Math.round(el.offsetWidth * ratio);
  barWidth.value = width;
  barLeft.value = Math.round(el.offsetLeft + (el.offsetWidth - width) / 2);
};

watch(activePath, async () => {
  await nextTick();
  updateBar();
});

const handleResize = () => updateBar();

const handleChange = (target: string) => {
  if (!target || target === route.path) return;
  /*
   * 切榜单页签用 replace 而不是 push：
   * 几个榜单页是同一栏目下的平级视图，用 push 每切一次就压一条历史，
   * 「返回」按钮会退回上一个榜单页，而不是用户真正进来的那一页
   * （vue-router 的 push 会把 history.state.back 改成刚离开的榜单页，replace 则保留）。
   */
  router.replace(target);
};

/*
 * 四个榜单页都是路由级懒加载。首次点某个页签时，要等它的 chunk 下载 + 页面挂载，
 * 这段时间里页签已经切了、下面还是旧内容。进任一榜单页时顺手把兄弟页面预取回来，
 * 之后切换就是即时的。
 */
onMounted(() => {
  updateBar();
  window.addEventListener('resize', handleResize);
  // 第一帧之后再打开过渡：进页面时横条已经在正确位置，不需要"滑入"
  requestAnimationFrame(() => requestAnimationFrame(() => { barReady.value = true; }));

  const preload = [
    () => import('../views/TotalRankView.vue'),
    () => import('../views/GrowthRankView.vue'),
    () => import('../views/HistoryRankView.vue'),
    () => import('../views/NonHuaweiRankView.vue'),
    () => import('../views/CategoryRankView.vue')
  ];
  window.setTimeout(() => {
    preload.forEach((load) => { void load().catch(() => {}); });
  }, 400);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.rank-navigation {
  border-bottom: 1px solid var(--el-border-color-light);
}

/* 四等分的页签条：外层那条底边 + 激活项下面一小段主色下划线 */
.rank-tabs {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.rank-tab {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 12px 10px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  position: relative;
  transition: color 0.2s ease;
}

.rank-tab:hover {
  color: var(--el-color-primary);
}

.rank-tab.is-active {
  color: var(--el-color-primary);
  font-weight: 600;
}

/*
 * 滑动下划线：一条独立的元素，靠 transform/width 过渡滑到当前页签下面。
 * （写在每个页签上的 ::after 只能"跳"，没有滑动过程。）
 */
.rank-tab-bar {
  position: absolute;
  left: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background-color: var(--el-color-primary);
  pointer-events: none;
  will-change: transform, width;
}

/* 只有"准备就绪"之后（首次定位完成）才走过渡，切页签时才是从上一个位置滑过去 */
.rank-tab-bar.is-ready {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (max-width: 768px) {
  .rank-tab {
    /* 窄屏四个页签平分，长标签允许折两行，别被截成"应用下载…"看不懂 */
    padding: 0 4px 8px;
    font-size: 12px;
    line-height: 16px;
    white-space: normal;
    text-overflow: clip;
    overflow: visible;
  }
}
</style>
