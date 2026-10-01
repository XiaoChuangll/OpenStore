<template>
  <div class="mini-player-wrap" v-if="playerStore.currentTrack">
    <div
      class="mini-player"
      :class="{ 'is-playing': playerStore.isPlaying }"
      title="点击播放 / 暂停"
      @click="handleClick"
      @dblclick="handleDoubleClick"
    >
      <!-- Progress Ring -->
      <svg class="progress-ring" width="48" height="48" viewBox="0 0 48 48">
        <circle
          class="progress-ring__circle-bg"
          stroke="rgba(255, 255, 255, 0.1)"
          stroke-width="2"
          fill="transparent"
          r="23"
          cx="24"
          cy="24"
        />
        <circle
          class="progress-ring__circle"
          stroke="var(--el-color-primary)"
          stroke-width="2"
          fill="transparent"
          r="23"
          cx="24"
          cy="24"
          :style="{ strokeDashoffset: progressOffset }"
        />
      </svg>

      <div class="cover-wrapper">
        <img
          :src="cover"
          class="cover-img"
          :alt="playerStore.currentTrack?.name || 'Music Cover'"
        />
        <div class="center-hole"></div>
      </div>

      <!-- Hover Overlay for Play/Pause indication -->
      <div class="player-overlay">
        <el-icon :size="20" color="#fff">
          <video-pause v-if="playerStore.isPlaying" />
          <video-play v-else />
        </el-icon>
      </div>
    </div>

    <!-- 展开到完整播放页 -->
    <button
      type="button"
      class="expand-btn"
      title="打开播放页"
      aria-label="打开播放页"
      @click.stop="goPlayer"
    >
      <el-icon :size="14"><CaretTop /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { VideoPlay, VideoPause } from '@element-plus/icons-vue';
import { CaretTop } from '@element-plus/icons-vue';

const router = useRouter();
const playerStore = usePlayerStore();
const defaultCover = 'https://p2.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg'; // Default Vinyl Placeholder

const radius = 23;
const circumference = 2 * Math.PI * radius;

const progressOffset = computed(() => {
  if (!playerStore.duration) return circumference;
  const progress = playerStore.currentTime / playerStore.duration;
  return circumference - (progress * circumference);
});

const handleClick = () => {
  playerStore.togglePlay();
};

const handleDoubleClick = () => {
  router.push('/music');
};

const goPlayer = () => {
  router.push('/player');
};

const cover = computed(
  () =>
    playerStore.currentTrack?.picUrl ||
    playerStore.currentTrack?.al?.picUrl ||
    playerStore.currentTrack?.album?.picUrl ||
    defaultCover
);
</script>

<style scoped>
/* 唱片 + 右下角的「打开播放页」小按钮，整体挂在底部 Dock 左侧 */
.mini-player-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-right: 12px;
}

.expand-btn {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  background-color: var(--el-bg-color-overlay);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  z-index: 3;
  transition: color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.expand-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-1px);
}

.mini-player {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible; /* Allow SVG to be visible if needed, though it is same size */
  flex-shrink: 0; /* Prevent shrinking */
}

.progress-ring {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  transform: rotate(-90deg);
  pointer-events: none;
}

.progress-ring__circle {
  stroke-dasharray: 144.51 144.51;
  transition: stroke-dashoffset 0.1s linear; /* Smooth update */
  stroke-linecap: round;
}

.mini-player:active {
  transform: scale(0.9);
}

.cover-wrapper {
  width: 86%; /* Slightly smaller to fit inside ring */
  height: 86%;
  position: relative;
  border-radius: 50%;
  animation: rotate 10s linear infinite;
  animation-play-state: paused;
  z-index: 2; /* Above progress ring background */
}

.is-playing .cover-wrapper {
  animation-play-state: running;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.center-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: #1a1a1a;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.1);
  z-index: 2;
}

.player-overlay {
  position: absolute;
  width: 86%;
  height: 86%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.4);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 3;
}

.mini-player:hover .player-overlay {
  opacity: 1;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
