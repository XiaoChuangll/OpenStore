<template>
  <div v-if="track" class="player-bar" :class="{ 'no-enter-animation': skipEnterAnimation }">
    <!-- 点条身进播放页 -->
    <div
      class="bar-main"
      role="button"
      tabindex="0"
      title="打开播放页"
      @click="openPlayer"
      @keydown.enter.prevent="openPlayer"
    >
      <img class="bar-cover" :src="cover" alt="" />
      <div class="bar-text">
        <span class="bar-name" :title="track.name">{{ track.name }}</span>
        <span class="bar-artist" :title="artist">{{ artist }}</span>
      </div>
    </div>

    <div class="bar-actions">
      <button
        type="button"
        class="bar-btn"
        title="上一首"
        aria-label="上一首"
        :disabled="playlist.length <= 1"
        @click.stop="playerStore.prev()"
      >
        <MediaIcon name="prev" class="bar-icon is-skip" />
      </button>

      <button
        type="button"
        class="bar-btn"
        :title="isPlaying ? '暂停' : '播放'"
        :aria-label="isPlaying ? '暂停' : '播放'"
        @click.stop="playerStore.togglePlay()"
      >
        <MediaIcon :name="isPlaying ? 'pause' : 'play'" class="bar-icon" />
      </button>

      <button
        type="button"
        class="bar-btn"
        title="下一首"
        aria-label="下一首"
        @click.stop="playerStore.next()"
      >
        <MediaIcon name="next" class="bar-icon is-skip" />
      </button>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import MediaIcon from './MediaIcon.vue';
import { morphNavigate } from '../utils/player-morph';

const router = useRouter();
const playerStore = usePlayerStore();

/*
 * 从播放页返回时，这条播放器是重新挂载的，它自己的 bar-in 入场动画从 opacity:0 开始，
 * 而转场的新快照紧接着就会拍 —— 拍到的是还没淡入的样子，退场补间就白做了。
 * 所以转场期间来的这一次挂载直接跳过入场动画。
 */
const skipEnterAnimation =
  typeof document !== 'undefined' && document.documentElement.classList.contains('morph-running');

const DEFAULT_COVER = 'https://p2.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg';

const track = computed(() => playerStore.currentTrack);
const isPlaying = computed(() => playerStore.isPlaying);
const playlist = computed(() => playerStore.playlist || []);

const cover = computed(
  () =>
    track.value?.picUrl ||
    track.value?.al?.picUrl ||
    track.value?.album?.picUrl ||
    DEFAULT_COVER
);

const artist = computed(() => {
  const list = track.value?.ar || track.value?.artists || [];
  const names = list.map((a) => a?.name).filter(Boolean);
  return names.length ? names.join(' / ') : '未知歌手';
});

const openPlayer = () => {
  // 手写的共享元素动画：整条胶囊连圆角一起长成播放页的播放器卡片
  void morphNavigate('toPlayer', () => router.push('/player'));
};
</script>

<style scoped>
/* 站在原来 Dock 的位置：底部居中、同一层高、同样的毛玻璃质感 */
.player-bar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2100;
  /*
   * 胶囊本体参与转场：它会补间成播放页那张播放器卡片。
   * 里面的封面/文字/按钮都各自起了转场名（见下面几条），所以这里的快照只剩"底板"。
   */
  view-transition-name: var(--vt-panel-name);
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(520px, calc(100vw - 32px));
  padding: 8px 10px 8px 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 50px;
  background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  animation: bar-in 0.24s ease-out;
}

/* 转场期间挂载时不用入场动画（补间动画已经在做这件事了） */
.player-bar.no-enter-animation {
  animation: none;
}

@keyframes bar-in {
  from {
    opacity: 0;
    transform: translate(-50%, 10px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.bar-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border-radius: 999px;
  cursor: pointer;
}

.bar-cover {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background-color: var(--el-fill-color);
  /* 与播放页的大唱片共用同一个转场名字：点开播放页时它会补间放大过去 */
  view-transition-name: player-disc;
}

/*
 * 逐个元素做共享元素转场。
 * 注意是给「每个控件」起名，而不是给整条播放条起名：
 * 整条一起补间会把它拉伸成卡片的尺寸，里面的内容会被拽得乱飞，而且毛玻璃底板
 * 抓不到背景模糊、快照只剩一个硬邦邦的矩形。拆开之后各走各的，观感才对。
 */
.bar-actions .bar-btn:nth-child(1) {
  view-transition-name: player-prev;
}

.bar-actions .bar-btn:nth-child(2) {
  view-transition-name: player-play;
}

.bar-actions .bar-btn:nth-child(3) {
  view-transition-name: player-next;
}

.bar-name {
  view-transition-name: player-title;
}

.bar-artist {
  view-transition-name: player-artist;
}

.bar-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.bar-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.bar-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.bar-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.bar-btn:hover {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.bar-btn:disabled {
  color: var(--el-text-color-disabled);
  background: none;
  cursor: not-allowed;
}

.bar-icon {
  /* MediaIcon 内部是 width: 1em，尺寸跟着字号走 */
  font-size: 24px;
}

.bar-icon.is-skip {
  font-size: 22px;
}

@media (max-width: 480px) {
  .player-bar {
    /* 左右各 20px，和音乐页卡片的边距对齐（--el-main 的内边距） */
    left: 20px;
    right: 20px;
    width: auto;
    bottom: 16px;
    transform: none;
    /* 只有左右 50% 位移的入场动画在这里不适用，换成纯纵向 */
    animation-name: bar-in-mobile;
    padding-right: 8px;
  }

  .bar-cover {
    width: 34px;
    height: 34px;
  }

  .bar-actions {
    gap: 0;
  }

  .bar-btn {
    width: 34px;
    height: 34px;
  }
}

@keyframes bar-in-mobile {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
