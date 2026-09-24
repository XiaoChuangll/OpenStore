<template>
  <div class="topic-detail-view">
    <div v-if="loading" class="detail-skeleton">
      <el-skeleton :rows="2" animated />
      <el-skeleton :rows="6" animated />
    </div>

    <el-result
      v-else-if="error"
      icon="error"
      title="获取专题失败"
      :sub-title="error"
    >
      <template #extra>
        <el-button type="primary" @click="fetchDetail">重试</el-button>
        <el-button @click="router.back()">返回</el-button>
      </template>
    </el-result>

    <template v-else-if="topic">
      <!-- 专题头图：没有官方封面图，用该专题下的应用图标做背景（模糊铺底 + 前景一排清晰图标） -->
      <section class="topic-hero">
        <div class="hero-banner">
          <div class="hero-blur" aria-hidden="true">
            <img v-for="(icon, i) in heroBlurIcons" :key="`b${i}`" :src="icon" alt="" />
          </div>
          <div class="hero-veil" aria-hidden="true"></div>

          <!-- 图标过多时分上下两行反向无缝滚动：悬停暂停，悬停单个图标会放大 -->
          <div
            v-if="heroIcons.length"
            class="hero-marquee"
            :class="{ 'is-scroll': heroMarquee }"
            tabindex="0"
            aria-label="该专题包含的应用图标"
          >
            <div
              v-for="(row, rowIndex) in heroRows"
              :key="rowIndex"
              class="hero-row"
              :class="{ 'is-reverse': rowIndex % 2 === 1 }"
            >
              <div class="hero-track" :style="{ '--marquee-copies': heroCopies }">
                <template v-for="copy in heroCopies" :key="copy">
                  <el-image
                    v-for="(icon, i) in row"
                    :key="`${copy}-${i}`"
                    :src="icon"
                    class="hero-icon"
                    fit="cover"
                    :aria-hidden="copy > 1 ? 'true' : null"
                  >
                    <template #error>
                      <span class="hero-icon-fallback">
                        <el-icon><Picture /></el-icon>
                      </span>
                    </template>
                  </el-image>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div class="hero-body">
          <h1 class="hero-title">{{ topic.title }}</h1>
          <p v-if="topic.subtitle" class="hero-subtitle">{{ topic.subtitle }}</p>

          <div class="hero-meta">
            <span class="meta-chip">
              <el-icon><Calendar /></el-icon>
              {{ formatDate(topic.created_at) }}
            </span>
            <span class="meta-chip">
              <el-icon><Collection /></el-icon>
              {{ appCount }} 个应用
            </span>
            <span v-if="submitter" class="meta-chip is-quiet">
              <el-icon><User /></el-icon>
              {{ submitter }}
            </span>
          </div>

          <p v-if="description" class="hero-description">{{ description }}</p>
        </div>
      </section>

      <section class="apps-section">
        <header class="section-head">
          <h2>包含应用</h2>
          <span class="section-count">{{ appCount }}</span>
        </header>

        <div v-if="appCount" class="apps-grid">
          <AppCard
            v-for="app in topic.apps"
            :key="app.app_id"
            :app="app"
            @click="goToApp(app)"
          />
        </div>
        <el-empty v-else description="该专题暂无应用" />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTopicDetail, type FullSubstanceInfo } from '../services/api';
import AppCard from '../components/AppCard.vue';
import { useLayoutStore } from '../stores/layout';
import { Calendar, Collection, Picture, User } from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();

const topic = ref<FullSubstanceInfo | null>(null);
const loading = ref(true);
const error = ref('');

const appCount = computed(() => topic.value?.apps?.length || 0);

/** 头图用的应用图标：模糊铺底这层最多取 8 个（性能） */
const HERO_BLUR_LIMIT = 8;
/** 前景最多取这么多个（专题可能有几十个应用，头图只做展示，完整列表在下方） */
const HERO_MAX_ICONS = 12;
/** 前景超过这个数量就分两行反向滚动，否则静止展示一行 */
const HERO_STATIC_LIMIT = 8;
/** 无缝滚动需要把这一行复制若干份；12 个图标时 3 份已能覆盖最宽布局（≈1200px） */
const HERO_MARQUEE_COPIES = 3;
const heroIconUrls = computed(() =>
  (topic.value?.apps || [])
    .map((a: any) => a?.icon_url)
    .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
);
const heroBlurIcons = computed(() => heroIconUrls.value.slice(0, HERO_BLUR_LIMIT));
const heroIcons = computed(() => heroIconUrls.value.slice(0, HERO_MAX_ICONS));
const heroMarquee = computed(() => heroIcons.value.length > HERO_STATIC_LIMIT);
// 两行都放完整一批图标（保证无缝滚动时不会有空档），第二行整体旋转半批，
// 这样同一时刻两行看到的是不同图标，一行向左、一行向右
const heroRows = computed(() => {
  const icons = heroIcons.value;
  if (!heroMarquee.value) return [icons];
  const half = Math.ceil(icons.length / 2);
  const rotated = [...icons.slice(half), ...icons.slice(0, half)];
  return [icons, rotated];
});
const heroCopies = computed(() => (heroMarquee.value ? HERO_MARQUEE_COPIES : 1));

/**
 * 上游的 comment 字段经常是投稿元数据（例如 {"platform":"shenbot-0.9.1","user":"shenjack"}），
 * 而且 axios 已经把它解析成对象了，直接渲染会变成 [object Object]。
 * 这里统一拆开：真正的评论当作正文，投稿元数据只作为一行小字。
 */
const parseComment = (raw: unknown) => {
  const fromObject = (obj: Record<string, unknown>) => {
    const comment = typeof obj.comment === 'string' ? obj.comment : '';
    const text = typeof obj.text === 'string' ? obj.text : '';
    const user = typeof obj.user === 'string' ? obj.user : '';
    const platform = typeof obj.platform === 'string' ? obj.platform : '';
    return {
      description: (comment || text).trim(),
      submitter: [user, platform].filter(Boolean).join(' · ')
    };
  };

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return fromObject(raw as Record<string, unknown>);
  }

  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { description: '', submitter: '' };

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return fromObject(parsed as Record<string, unknown>);
      }
    } catch {
      // 不是合法 JSON，按普通文本处理
    }
  }

  return { description: text, submitter: '' };
};

const parsedComment = computed(() => parseComment(topic.value?.comment));
const description = computed(() => parsedComment.value.description);
const submitter = computed(() => parsedComment.value.submitter);

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const fetchDetail = async () => {
  const id = route.params.id as string;
  if (!id) return;

  loading.value = true;
  error.value = '';

  try {
    const data = await getTopicDetail(id);
    if (!data) throw new Error('专题数据为空');
    topic.value = data;

    const title = data.title || '专题详情';
    // 顶栏不显示标题（正文里有），只保留返回按钮；浏览器标签标题照旧
    layoutStore.setPageInfo('', true, () => router.back());
    document.title = `OpenStore | ${title}`;

    const metaDescription = (data.subtitle || parsedComment.value.description) || '';
    if (metaDescription) {
      let el = document.querySelector('meta[name="description"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', 'description');
        document.head.appendChild(el);
      }
      try {
        el.setAttribute('content', metaDescription.slice(0, 160));
      } catch (e) {
        console.warn('Failed to set description', e);
      }
    }
  } catch (err: any) {
    console.error(err);
    error.value = '无法加载专题详情，请稍后再试';
  } finally {
    loading.value = false;
  }
};

const goToApp = (app: any) => {
  if (app.app_id) {
    router.push({
      path: `/apps/${app.app_id}`,
      query: { title: app.name }
    });
  }
};

onMounted(() => {
  fetchDetail();
});
</script>

<style scoped>
.topic-detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 20px 80px;
}

.detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ---------- 头图 ---------- */

.topic-hero {
  overflow: hidden;
  margin-bottom: 26px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  background: var(--el-bg-color);
}

.hero-banner {
  position: relative;
  /* 给两行图标 + 悬停放大留出上下余量，避免放大时被裁掉 */
  height: 160px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}

/* 底层：把该专题的应用图标放大、模糊，铺成一片由真实内容产生的底色 */
.hero-blur {
  position: absolute;
  inset: -30%;
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  gap: 22px;
  filter: blur(26px) saturate(1.25);
  transform: scale(1.15);
  opacity: 0.85;
}

.hero-blur img {
  /* 拉伸填满整条头图：只有一个应用时也不会缩成中间一坨光斑 */
  flex: 1 1 140px;
  min-width: 120px;
  height: 118px;
  border-radius: 26px;
  object-fit: cover;
}

/* 上层：压一层渐隐，向下过渡到卡片底色，同时保证前景图标可读 */
.hero-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(15, 23, 42, 0.08) 58%,
    var(--el-bg-color) 100%
  );
}

/* 注意：scoped 里写 `:global(html.dark) .x` 会被编译器丢掉后代选择器，
   结果样式落到 <html> 上。这里用普通后代选择器，编译成 html.dark .x[data-v-…] 才对 */
html.dark .hero-veil {
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.1) 0%,
    rgba(0, 0, 0, 0.24) 58%,
    var(--el-bg-color) 100%
  );
}

/* 前景：图标区。图标少时静止一行（可手动横滑），图标多时分两行反向无缝滚动 */
.hero-marquee {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  /* 上下留出内边距，让图标的阴影落在遮罩作用范围内，不会被裁成一条直线 */
  padding: 14px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%);
}

.hero-marquee:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.hero-row {
  display: flex;
  align-items: center;
  /* 静止模式这一行是可横滑的容器（会裁切），所以留出 14px 余量给阴影 */
  min-height: 76px;
  overflow: hidden;
}

/* 滚动模式：行本身不裁切，阴影完整渲染；横向溢出交给 marquee 裁切 + 两端渐隐 */
.hero-marquee.is-scroll .hero-row {
  min-height: 0;
  overflow: visible;
}

/* 静止模式：一行图标可以手动横向滑动 */
.hero-marquee:not(.is-scroll) .hero-row {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* 图标少的时候居中摆放，不要全挤在左边留一大片空白；
   一行放不下时 auto 边距会退化成 0，仍然从左边开始、可以完整横滑 */
.hero-marquee:not(.is-scroll) .hero-track {
  margin: 0 auto;
  padding-right: 0;
}

.hero-marquee:not(.is-scroll) .hero-row::-webkit-scrollbar {
  display: none;
}

.hero-track {
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  --marquee-copies: 3;
  /* 末尾再补一个 gap，让 25% 正好等于「一批图标 + 一个间距」，循环无缝 */
  padding-right: 10px;
}

/* 只有滚动模式才做动画 */
.hero-marquee.is-scroll .hero-track {
  animation: hero-marquee-scroll 26s linear infinite;
  will-change: transform;
}

.hero-row.is-reverse .hero-track {
  animation-direction: reverse;
}

/* 悬停 / 键盘聚焦时暂停，方便看清和点击 */
.hero-marquee:hover .hero-track,
.hero-marquee:focus-within .hero-track {
  animation-play-state: paused;
}

@keyframes hero-marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    /* 复制了几份就位移几份，保证循环点严丝合缝 */
    transform: translateX(calc(-100% / var(--marquee-copies, 3)));
  }
}

.hero-icon {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 12px;
  background: var(--el-bg-color);
  /* 中性软阴影：不再用深蓝 + 负扩展，避免在彩色模糊底上糊出一圈脏边 */
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease;
  position: relative;
}

html.dark .hero-icon {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.42);
}

/* 悬停某个图标时放大它（层级抬高，避免被相邻图标盖住） */
.hero-icon:hover {
  transform: scale(1.18);
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.26);
  z-index: 3;
}

html.dark .hero-icon:hover {
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.52);
}

/* 用户声明减少动效时，停掉自动滚动，只保留手动横滑 */
@media (prefers-reduced-motion: reduce) {
  .hero-marquee.is-scroll .hero-track {
    animation: none;
  }

  .hero-marquee.is-scroll .hero-row {
    overflow-x: auto;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .hero-marquee.is-scroll .hero-row::-webkit-scrollbar {
    display: none;
  }

  .hero-icon:hover {
    transform: none;
  }
}

.hero-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  font-size: 18px;
}

.hero-body {
  padding: 18px 22px 22px;
}

.hero-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--el-text-color-primary);
}

.hero-subtitle {
  margin: 0 0 14px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 11px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.meta-chip.is-quiet {
  background: transparent;
  border-style: dashed;
  color: var(--el-text-color-placeholder);
}

.hero-description {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-left: 3px solid color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  border-radius: 0 10px 10px 0;
  background: var(--el-fill-color-light);
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

/* ---------- 应用列表 ---------- */

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  padding: 1px 10px;
  border-radius: 999px;
  background: var(--el-fill-color);
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.apps-grid {
  display: grid;
  /* 与「应用」页保持一致的列规则：最小 280px，宽度不够自动减列 */
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  column-gap: 20px;
  row-gap: 16px;
}

@media (max-width: 640px) {
  .topic-detail-view {
    padding: 16px 14px 80px;
  }

  .hero-banner {
    height: 136px;
  }

  .hero-blur img {
    width: 88px;
    height: 88px;
  }

  .hero-marquee {
    gap: 8px;
    bottom: 10px;
    padding: 12px 0;
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
  }

  .hero-row {
    min-height: 68px;
  }

  .hero-track {
    gap: 8px;
    padding-right: 8px;
  }

  .hero-icon {
    width: 40px;
    height: 40px;
    border-radius: 11px;
  }

  .hero-body {
    padding: 16px;
  }

  .hero-title {
    font-size: 20px;
  }
}
</style>
