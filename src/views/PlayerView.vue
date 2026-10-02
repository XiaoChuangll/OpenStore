<template>
  <div class="player-view" :style="accentVars">
    <!-- 环境底色：把封面放大模糊铺满，再压一层主题色蒙层，颜色跟着歌曲走 -->
    <div
      v-if="track"
      class="ambient"
      :style="{ backgroundImage: `url(${cover})` }"
      aria-hidden="true"
    ></div>

    <!-- 流光：几团主题色的光斑缓慢漂移，压在环境底色之上、内容之下 -->
    <div class="aurora" aria-hidden="true">
      <span class="aurora-blob aurora-blob--a"></span>
      <span class="aurora-blob aurora-blob--b"></span>
      <span class="aurora-blob aurora-blob--c"></span>
    </div>

    <template v-if="track">
      <div class="player-layout" :class="{ 'has-queue': showQueue, 'no-enter-animation': skipEnterAnimation }">
      <div ref="playerMain" class="player-main">
      <!-- 唱片 + 歌曲信息 -->
      <section class="stage">
        <div class="disc" :class="{ 'is-spinning': isPlaying }">
          <img :src="cover" class="disc-art" alt="" />
          <span class="disc-hole"></span>
        </div>

        <div class="track-meta">
          <h1 class="track-name" :title="track.name">{{ track.name }}</h1>
          <p class="track-sub">
            <span class="track-artist">{{ artistText }}</span>
            <span v-if="albumText" class="track-album"> · {{ albumText }}</span>
          </p>
          <div class="track-tags">
            <!-- 点这枚标签才展开播放列表 -->
            <button
              type="button"
              class="tag"
              :class="{ 'is-open': showQueue }"
              :title="showQueue ? '收起播放列表' : '展开播放列表'"
              @click="toggleQueue"
            >
              <el-icon :size="13"><Headset v-if="isFm" /><Files v-else /></el-icon>
              {{ isFm ? '私人 FM' : '播放列表' }}
              <!-- 箭头指向列表展开的方向：宽屏在右侧，窄屏在下方 -->
              <el-icon :size="12" class="tag-caret">
                <ArrowRight v-if="isWideViewport" />
                <ArrowDown v-else />
              </el-icon>
            </button>
            <span v-if="loading" class="tag tag-loading">
              <el-icon :size="13" class="is-loading"><Loading /></el-icon>
              加载中
            </span>
          </div>
        </div>

        <!-- 歌词：上一行 / 当前行 / 下一行 -->
        <div class="lyric-window">
          <p v-if="lyricsLoading" class="lyric-row is-muted">歌词加载中…</p>
          <p v-else-if="!lyrics.length" class="lyric-row is-muted">暂无歌词</p>
          <div v-else class="lyric-track" :style="lyricTrackStyle">
            <p
              v-for="(line, i) in lyrics"
              :key="`${i}-${line.time}`"
              class="lyric-row"
              :class="{ 'is-current': i === activeLine }"
              :title="line.text"
              @click="playerStore.seek(line.time)"
            >
              {{ line.text }}
            </p>
          </div>
        </div>
      </section>

      <!-- 播放控制 -->
      <section class="controls">
        <div class="progress-row">
          <span class="time">{{ formatTime(displayTime) }}</span>
          <el-slider
            v-model="progress"
            class="progress"
            :min="0"
            :max="Math.max(duration, 1)"
            :step="1"
            :show-tooltip="false"
            :disabled="!duration"
            @input="onSeekInput"
            @change="onSeekCommit"
          />
          <span class="time">{{ formatTime(duration) }}</span>
        </div>

        <div class="transport">
          <button
            type="button"
            class="skip-btn"
            title="上一首"
            aria-label="上一首"
            :disabled="playlist.length <= 1"
            @click="playerStore.prev()"
          >
            <MediaIcon name="prev" class="skip-icon" />
          </button>

          <button
            type="button"
            class="play-btn"
            :title="isPlaying ? '暂停' : '播放'"
            :aria-label="isPlaying ? '暂停' : '播放'"
            @click="playerStore.togglePlay()"
          >
            <MediaIcon :name="isPlaying ? 'pause' : 'play'" class="play-icon" />
          </button>

          <button
            type="button"
            class="skip-btn"
            title="下一首"
            aria-label="下一首"
            @click="playerStore.next()"
          >
            <MediaIcon name="next" class="skip-icon" />
          </button>
        </div>

        <div class="extra-bar">
          <!-- 色盘：点开就是主题色选择，选中的颜色立刻生效 -->
          <button
            type="button"
            class="palette-btn"
            :class="{ 'is-open': showPalette }"
            :title="showPalette ? '收起色盘' : '主题色'"
            aria-label="主题色"
            @click="togglePalette"
          >
            <svg class="palette-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M11.83 21.89Q12.82 21.89 13.44 21.38Q14.06 20.88 14.23 20.16Q14.4 19.44 14.14 18.86Q13.94 18.36 13.66 18.05Q13.42 17.69 13.49 17.4Q13.56 17.11 13.88 16.96Q14.21 16.8 14.74 16.82Q16.51 16.94 18 16.45Q19.49 15.96 20.48 14.86Q21.48 13.75 21.79 12.07Q22.08 10.49 21.62 8.86Q21.17 7.22 20.35 6.17Q18.24 3.48 15.5 2.62Q12.77 1.75 10.24 2.27Q7.7 2.78 6.12 4.03Q4.42 5.35 3.26 7.33Q2.11 9.31 2.11 12.6Q2.11 14.57 3.35 16.75Q4.58 18.94 6.82 20.41Q9.05 21.89 11.83 21.89ZM7.03 5.23Q8.4 4.18 10.54 3.73Q12.67 3.29 15 4.02Q17.33 4.75 19.18 7.08Q19.8 7.9 20.16 9.24Q20.52 10.58 20.3 11.81Q19.94 13.75 18.49 14.62Q17.04 15.48 14.81 15.31Q13.46 15.24 12.74 15.86Q12.02 16.49 11.96 17.39Q11.9 18.29 12.46 18.94Q12.62 19.13 12.77 19.46Q12.82 19.56 12.78 19.79Q12.74 20.02 12.52 20.21Q12.29 20.4 11.83 20.4Q9.48 20.4 7.6 19.16Q5.71 17.93 4.66 16.09Q3.6 14.26 3.6 12.6Q3.6 9.77 4.58 8.06Q5.57 6.36 7.03 5.23Z"
              />
              <path
                d="M7.32 8.66Q6.77 8.66 6.37 9.05Q5.98 9.43 5.98 9.98Q5.98 10.54 6.37 10.93Q6.77 11.33 7.32 11.33Q7.87 11.33 8.27 10.93Q8.66 10.54 8.66 9.98Q8.66 9.43 8.27 9.05Q7.87 8.66 7.32 8.66ZM9.98 5.3Q9.43 5.3 9.05 5.7Q8.66 6.1 8.66 6.65Q8.66 7.2 9.05 7.6Q9.43 7.99 9.98 7.99Q10.54 7.99 10.93 7.6Q11.33 7.2 11.33 6.65Q11.33 6.1 10.93 5.7Q10.54 5.3 9.98 5.3ZM14.26 5.3Q13.7 5.3 13.31 5.7Q12.91 6.1 12.91 6.65Q12.91 7.2 13.31 7.6Q13.7 7.99 14.26 7.99Q14.81 7.99 15.19 7.6Q15.58 7.2 15.58 6.65Q15.58 6.1 15.19 5.7Q14.81 5.3 14.26 5.3ZM16.92 8.66Q16.37 8.66 15.97 9.05Q15.58 9.43 15.58 9.98Q15.58 10.54 15.97 10.93Q16.37 11.33 16.92 11.33Q17.47 11.33 17.87 10.93Q18.26 10.54 18.26 9.98Q18.26 9.43 17.87 9.05Q17.47 8.66 16.92 8.66Z"
              />
            </svg>
          </button>

          <button
            type="button"
            class="pill"
            :class="{ 'is-on': isFm }"
            :title="isFm ? '退出私人 FM，回到上一个播放列表' : '切到私人 FM'"
            @click="toggleFm"
          >
            <el-icon :size="14"><Headset /></el-icon>
            私人 FM
          </button>

          <!-- 收藏：点亮就是收进「喜欢的音乐」 -->
          <button
            type="button"
            class="icon-btn fav-btn"
            :class="{ 'is-on': playerStore.trackLiked, 'is-busy': playerStore.likePending }"
            :title="playerStore.trackLiked ? '取消收藏' : '收藏到喜欢的音乐'"
            :aria-label="playerStore.trackLiked ? '取消收藏' : '收藏'"
            :aria-pressed="playerStore.trackLiked === true"
            @click="playerStore.toggleLike()"
          >
            <svg class="icon-btn-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                v-if="playerStore.trackLiked"
                d="M16.27 2.23Q15.1 2.23 14 2.65Q12.91 3.07 12 3.84Q11.09 3.07 10 2.65Q8.9 2.23 7.73 2.23Q5.88 2.23 4.34 3.17Q2.81 4.1 1.91 5.69Q1.01 7.27 1.01 9.12Q1.01 10.75 2.15 12.8Q3.29 14.86 5.11 16.85Q7.01 18.94 8.98 20.35Q10.94 21.77 11.98 21.77Q13.15 21.77 15.06 20.44Q16.97 19.1 18.82 17.09Q20.66 15.05 21.83 12.92Q22.99 10.8 22.99 9.12Q22.99 7.27 22.09 5.69Q21.19 4.1 19.66 3.17Q18.12 2.23 16.27 2.23Z"
                fill="currentColor"
              />
              <path
                v-else
                d="M2.52 9.34Q2.52 7.56 3.16 6.29Q3.79 5.02 4.96 4.37Q6.12 3.72 7.73 3.72Q8.78 3.72 9.76 4.15Q10.73 4.58 11.47 5.38Q11.66 5.62 12 5.62Q12.36 5.62 12.55 5.38Q13.3 4.58 14.27 4.15Q15.24 3.72 16.27 3.72Q18.07 3.72 19.25 4.52Q20.42 5.33 20.95 6.6Q21.48 7.87 21.48 9.34Q21.48 11.16 19.44 13.92Q18.31 15.43 16.79 16.92Q15.26 18.41 13.92 19.36Q12.58 20.3 12 20.3Q11.42 20.3 10.15 19.38Q8.88 18.46 7.37 16.97Q5.86 15.48 4.63 13.92Q3.67 12.72 3.1 11.48Q2.52 10.25 2.52 9.34ZM16.27 2.23Q15.1 2.23 14 2.65Q12.91 3.07 12 3.84Q11.09 3.07 10 2.65Q8.9 2.23 7.73 2.23Q5.78 2.23 4.25 3.17Q2.71 4.1 1.86 5.68Q1.01 7.25 1.01 9.12Q1.01 10.78 2.17 12.85Q3.34 14.93 5.21 16.9Q7.2 18.98 9.08 20.38Q10.97 21.77 11.98 21.77Q13.1 21.77 14.92 20.41Q16.73 19.06 18.77 16.9Q20.62 14.98 21.8 12.89Q22.99 10.8 22.99 9.12Q22.99 7.25 22.13 5.68Q21.26 4.1 19.73 3.17Q18.19 2.23 16.27 2.23Z"
                fill="currentColor"
              />
            </svg>
          </button>

          <!-- 不感兴趣：私人 FM 丢垃圾桶，其它场景用日推的「不感兴趣」 -->
          <button
            type="button"
            class="icon-btn dislike-btn"
            title="不感兴趣"
            aria-label="不感兴趣"
            @click="playerStore.dislikeTrack()"
          >
            <svg class="icon-btn-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <g mask="url(#player-heart-off-mask)">
                <path
                  d="M2.52 9.34Q2.52 7.56 3.16 6.29Q3.79 5.02 4.96 4.37Q6.12 3.72 7.73 3.72Q8.78 3.72 9.76 4.15Q10.73 4.58 11.47 5.38Q11.66 5.62 12 5.62Q12.36 5.62 12.55 5.38Q13.3 4.58 14.27 4.15Q15.24 3.72 16.27 3.72Q18.07 3.72 19.25 4.52Q20.42 5.33 20.95 6.6Q21.48 7.87 21.48 9.34Q21.48 11.16 19.44 13.92Q18.31 15.43 16.79 16.92Q15.26 18.41 13.92 19.36Q12.58 20.3 12 20.3Q11.42 20.3 10.15 19.38Q8.88 18.46 7.37 16.97Q5.86 15.48 4.63 13.92Q3.67 12.72 3.1 11.48Q2.52 10.25 2.52 9.34ZM16.27 2.23Q15.1 2.23 14 2.65Q12.91 3.07 12 3.84Q11.09 3.07 10 2.65Q8.9 2.23 7.73 2.23Q5.78 2.23 4.25 3.17Q2.71 4.1 1.86 5.68Q1.01 7.25 1.01 9.12Q1.01 10.78 2.17 12.85Q3.34 14.93 5.21 16.9Q7.2 18.98 9.08 20.38Q10.97 21.77 11.98 21.77Q13.1 21.77 14.92 20.41Q16.73 19.06 18.77 16.9Q20.62 14.98 21.8 12.89Q22.99 10.8 22.99 9.12Q22.99 7.25 22.13 5.68Q21.26 4.1 19.73 3.17Q18.19 2.23 16.27 2.23Z"
                  fill="currentColor"
                />
              </g>
              <defs>
                <mask id="player-heart-off-mask">
                  <rect width="24" height="24" fill="#ffffff" />
                  <path
                    d="M3.5 0.84Q3.24 0.55 2.87 0.4Q2.5 0.24 2.09 0.24Q1.66 0.24 1.27 0.4Q0.89 0.55 0.6 0.84Q0.02 1.42 0.02 2.33Q0.02 2.74 0.17 3.1Q0.31 3.46 0.6 3.72L19.01 22.15Q19.3 22.44 19.69 22.61Q20.09 22.78 20.47 22.78Q20.88 22.78 21.26 22.61Q21.65 22.44 21.89 22.15Q22.2 21.89 22.37 21.5Q22.54 21.12 22.54 20.71Q22.54 20.33 22.38 19.93Q22.22 19.54 21.91 19.25L3.5 0.84Z"
                    fill="#000000"
                  />
                  <path
                    d="M21 21.24Q21.22 21 21.22 20.69Q21.22 20.38 21 20.16L2.57 1.75Q2.35 1.54 2.04 1.54Q1.73 1.54 1.51 1.75Q1.3 1.97 1.3 2.28Q1.3 2.59 1.51 2.81L19.92 21.24Q20.14 21.43 20.46 21.43Q20.78 21.43 21 21.24Z"
                    fill="#000000"
                  />
                </mask>
              </defs>
            </svg>
          </button>

          <div class="volume">
            <button
              type="button"
              class="volume-btn"
              :class="{ 'is-muted': volumeValue <= 0 }"
              :title="volumeValue > 0 ? '静音' : '恢复音量'"
              aria-label="静音切换"
              @click="toggleMute"
            >
              <!-- 音量图标：静音时整体压暗 -->
              <svg class="volume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M12 1.08Q9.14 1.08 6.71 2.5Q4.27 3.91 2.86 6.34Q1.44 8.76 1.44 11.62L1.44 19.42Q1.44 20.38 1.92 21.18Q2.4 21.98 3.2 22.45Q4.01 22.92 4.97 22.92Q5.93 22.92 6.73 22.45Q7.54 21.98 8.02 21.18Q8.5 20.38 8.5 19.42L8.5 16.44Q8.5 15.48 8.02 14.68Q7.54 13.87 6.73 13.39Q5.93 12.91 4.97 12.91Q3.86 12.91 2.95 13.56L2.95 11.62Q2.95 9.17 4.18 7.09Q5.4 5.02 7.48 3.79Q9.55 2.57 12 2.57Q14.45 2.57 16.52 3.79Q18.6 5.02 19.82 7.09Q21.05 9.17 21.05 11.62L21.05 13.56Q20.14 12.91 19.03 12.91Q18.07 12.91 17.27 13.39Q16.46 13.87 15.98 14.68Q15.5 15.48 15.5 16.44L15.5 19.42Q15.5 20.38 15.98 21.18Q16.46 21.98 17.27 22.45Q18.07 22.92 19.03 22.92Q19.99 22.92 20.8 22.45Q21.6 21.98 22.08 21.18Q22.56 20.38 22.56 19.42L22.56 11.62Q22.56 8.76 21.13 6.34Q19.7 3.91 17.28 2.5Q14.86 1.08 12 1.08Z"
                />
              </svg>
            </button>
            <el-slider
              v-model="volumeValue"
              class="volume-slider"
              :min="0"
              :max="1"
              :step="0.01"
              :show-tooltip="false"
              @input="onVolumeInput"
            />
          </div>
        </div>

        <!-- 色盘：高度做动画，展开/收起时卡片是「长出来」而不是硬跳一下 -->
        <div
          ref="palettePanel"
          class="palette-panel"
          :class="{ 'is-open': showPalette }"
          :style="{ maxHeight: paletteMaxHeight }"
          :aria-hidden="!showPalette"
        >
          <button
            v-for="c in ACCENTS"
            :key="c.value"
            type="button"
            class="swatch"
            :class="{ 'is-active': accent === c.value }"
            :style="{ backgroundColor: c.value }"
            :title="c.label"
            :aria-label="c.label"
            @click="pickAccent(c.value)"
          />

          <!-- 跟着封面走：换歌就自动换成和封面匹配的颜色 -->
          <button
            type="button"
            class="swatch swatch-cover"
            :class="{ 'is-active': followCover }"
            :style="coverAccent ? { backgroundColor: coverAccent } : undefined"
            :title="followCover ? '停止跟随封面配色' : '跟随封面配色'"
            aria-label="跟随封面配色"
            @click="toggleFollowCover"
          />

          <!-- 默认：交还给全站主题色 -->
          <button
            type="button"
            class="swatch swatch-default"
            :class="{ 'is-active': !accent }"
            :style="{ backgroundColor: defaultAccent }"
            aria-label="默认（跟随全站主题）"
            title="默认（跟随全站主题）"
            @click="pickAccent('')"
          />

          <!-- 自定义：挑任意颜色，选完立刻生效（没选过时是个彩圈） -->
          <el-color-picker
            v-model="pickerValue"
            class="swatch-picker"
            :class="{ 'is-empty': !customAccent, 'is-active': isCustomAccent }"
            size="small"
            :predefine="ACCENT_VALUES"
          />
        </div>
      </section>
      </div>

      <!-- 右栏：播放队列 -->
      <aside
        v-show="showQueue || isWideViewport"
        ref="queuePanel"
        class="side-panel queue-panel"
        :style="queuePanelStyle"
      >
        <header class="panel-head">
          <h2 class="panel-title">播放队列</h2>
          <span class="panel-count">{{ playlist.length }} 首</span>
        </header>

        <ul v-if="playlist.length" class="queue-list">
          <li
            v-for="(item, index) in playlist"
            :key="`${item.id}-${index}`"
            class="queue-row"
            :class="{ 'is-active': isCurrent(item, index) }"
            @click="playAt(item)"
          >
            <span class="q-index">
              <el-icon v-if="isCurrent(item, index) && isPlaying" :size="14" class="is-playing-icon">
                <VideoPlay />
              </el-icon>
              <template v-else>{{ String(index + 1).padStart(2, '0') }}</template>
            </span>
            <span class="q-name" :title="item.name">{{ item.name }}</span>
            <span class="q-artist" :title="artistOf(item)">{{ artistOf(item) }}</span>
            <span class="q-duration">{{ formatTime(durationOf(item)) }}</span>
          </li>
        </ul>
        <p v-else class="panel-hint">播放队列是空的</p>
      </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { proxyRequest } from '../services/api';
import {
  VideoPlay,
  Headset,
  Files,
  Loading,
  ArrowDown,
  ArrowRight,
} from '@element-plus/icons-vue';
import { usePlayerStore, type Track } from '../stores/player';
import MediaIcon from '../components/MediaIcon.vue';
import { useThemeStore } from '../stores/theme';
import { buildColorVars } from '../utils/theme-color';
import { extractCoverAccent } from '../utils/cover-color';
import { setPageShareMeta, clearPageShareMeta } from '../utils/page-share';

const router = useRouter();
const route = useRoute();
const playerStore = usePlayerStore();

const DEFAULT_COVER = 'https://p2.music.126.net/6y-UleORITEDbvrOLV0Q8A==/5639395138885805.jpg';

const track = computed(() => playerStore.currentTrack);

/*
 * 从迷你播放器「展开」过来时跳过入场动画：
 * .player-layout 的入场动画带 translateY(10px)，会让补间动画量到的位置差 10px，
 * 收尾时再平移回来就是"啪"地对齐一下（手写补间用 morph-running 标记这次导航）。
 */
const skipEnterAnimation = ref(
  typeof document !== 'undefined' && document.documentElement.classList.contains('morph-running')
);
const isPlaying = computed(() => playerStore.isPlaying);
const isFm = computed(() => playerStore.playMode === 'fm');
const duration = computed(() => playerStore.duration || 0);
const playlist = computed(() => playerStore.playlist || []);
const loading = computed(() => playerStore.loading);

const cover = computed(() => {
  const t = track.value;
  return t?.picUrl || t?.al?.picUrl || t?.album?.picUrl || DEFAULT_COVER;
});

const artistText = computed(() => {
  const t = track.value;
  if (!t) return '';
  const list = t.ar || t.artists || [];
  const names = list.map((a) => a?.name).filter(Boolean);
  return names.length ? names.join(' / ') : '未知歌手';
});

const albumText = computed(() => track.value?.al?.name || track.value?.album?.name || '');

const artistOf = (t: Track) => {
  const list = t.ar || t.artists || [];
  const names = list.map((a) => a?.name).filter(Boolean);
  return names.length ? names.join(' / ') : '未知歌手';
};

const durationOf = (t: Track) => {
  const raw = t.dt || t.duration || 0;
  return raw > 1000 ? raw / 1000 : raw;
};

const formatTime = (sec: number) => {
  if (!sec || !isFinite(sec)) return '00:00';
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/* ---------- 进度：拖动时不跟播放器抢值 ---------- */
const progress = ref(0);
const seeking = ref(false);

watch(
  () => playerStore.currentTime,
  (t) => {
    if (!seeking.value) progress.value = t;
  },
  { immediate: true }
);

const displayTime = computed(() => (seeking.value ? progress.value : playerStore.currentTime));

const onSeekInput = (val: number | number[]) => {
  seeking.value = true;
  progress.value = Number(Array.isArray(val) ? val[0] : val);
};

const onSeekCommit = (val: number | number[]) => {
  playerStore.seek(Number(Array.isArray(val) ? val[0] : val));
  seeking.value = false;
};

/* ---------- 音量 ---------- */
const volumeValue = ref(playerStore.volume);
const lastVolume = ref(playerStore.volume || 0.5);

const onVolumeInput = (val: number | number[]) => {
  const v = Number(Array.isArray(val) ? val[0] : val);
  playerStore.setVolume(v);
  if (v > 0) lastVolume.value = v;
};

const toggleMute = () => {
  if (volumeValue.value > 0) {
    playerStore.setVolume(0);
    volumeValue.value = 0;
  } else {
    const restore = lastVolume.value || 0.5;
    playerStore.setVolume(restore);
    volumeValue.value = restore;
  }
};

/* ---------- 队列 ---------- */
const isCurrent = (item: Track, index: number) => {
  if (track.value && item.id === track.value.id) return true;
  return index === playerStore.currentIndex;
};

const playAt = (item: Track) => {
  if (isCurrent(item, playerStore.playlist.findIndex((t) => t.id === item.id))) {
    playerStore.togglePlay();
    return;
  }
  playerStore.playTrack(item);
};

const toggleFm = () => {
  // 再点一次就是退出 FM，回到进 FM 之前的那张歌单
  if (isFm.value) {
    playerStore.exitFm();
    return;
  }
  playerStore.playFm();
};

/* ---------- 播放列表：默认收起，点标签才展开 ---------- */
const showQueue = ref(false);
const queuePanel = ref<HTMLElement | null>(null);
const playerMain = ref<HTMLElement | null>(null);

/*
 * 桌面端播放队列的高度上限 = 播放器那一栏的高度，
 * 这样它不会比旁边的卡片长出一截（内容多就在自己内部滚）。
 */
const mainHeight = ref(0);
let mainObserver: ResizeObserver | null = null;

/*
 * 手机上的队列最多露 8 行，剩下的在里面滚。
 * 行高会随字号变，所以量一次真实行高再换算成上限，而不是写死像素。
 */
const queueRowsMax = ref('');
const QUEUE_VISIBLE_ROWS = 8;
const QUEUE_ROW_GAP = 2; // 和 .queue-list 的 gap 对齐

const measureQueueRows = () => {
  const row = queuePanel.value?.querySelector('.queue-row') as HTMLElement | null;
  const height = row?.offsetHeight || 0;
  queueRowsMax.value = height
    ? `${height * QUEUE_VISIBLE_ROWS + QUEUE_ROW_GAP * (QUEUE_VISIBLE_ROWS - 1)}px`
    : '';
};

const queuePanelStyle = computed(() => {
  const style: Record<string, string> = {};
  // 桌面端：队列高度跟播放器那一栏对齐
  if (isWideViewport.value && mainHeight.value) style.maxHeight = `${mainHeight.value}px`;
  if (queueRowsMax.value) style['--queue-rows'] = queueRowsMax.value;
  return style;
});

// 队列内容 / 展开状态一变就重新量一次行高
watch([playlist, showQueue], async () => {
  await nextTick();
  measureQueueRows();
});

/*
 * 切歌后把队列滚到当前这首：当前歌在下面（或上面）看不见时，
 * 点上一首 / 下一首之后列表会跟着滑过去，而不是停着不动。
 * 现在两端都是「列表自己滚」，面板只有标题固定住。
 */
const QUEUE_ROW_PADDING = 8;
const scrollQueueToCurrent = () => {
  const panel = queuePanel.value;
  if (!panel) return;

  const row = panel.querySelector('.queue-row.is-active') as HTMLElement | null;
  if (!row) return;

  const list = panel.querySelector('.queue-list') as HTMLElement | null;
  const scroller =
    list && list.scrollHeight > list.clientHeight + 1
      ? list
      : panel.scrollHeight > panel.clientHeight + 1
        ? panel
        : null;
  if (!scroller) return;

  const rowRect = row.getBoundingClientRect();
  const boxRect = scroller.getBoundingClientRect();
  if (rowRect.top < boxRect.top + QUEUE_ROW_PADDING) {
    scroller.scrollTo({
      top: scroller.scrollTop + (rowRect.top - boxRect.top) - QUEUE_ROW_PADDING,
      behavior: 'smooth',
    });
  } else if (rowRect.bottom > boxRect.bottom - QUEUE_ROW_PADDING) {
    scroller.scrollTo({
      top: scroller.scrollTop + (rowRect.bottom - boxRect.bottom) + QUEUE_ROW_PADDING,
      behavior: 'smooth',
    });
  }
};

watch(
  () => track.value?.id,
  async () => {
    await nextTick();
    scrollQueueToCurrent();
  }
);

/** 宽屏下播放列表常驻 DOM（只是收成 0 宽），这样展开时才谈得上「滑出来」 */
const isWideViewport = ref(true);
const syncWideViewport = () => {
  isWideViewport.value = window.innerWidth >= 1080;
  nextTick(measureQueueRows);
};

onMounted(() => {
  syncWideViewport();
  window.addEventListener('resize', syncWideViewport);
  // 色盘换行高度会变（窄屏可能排两行），窗口尺寸变化后重新量一次
  window.addEventListener('resize', measurePalette);

  /*
   * 刷新 / 直接打开带 ?track= 的地址时，把这首歌还原出来（不自动播放）。
   * 既没在播、地址上也带不出歌可还原（比如还原失败）就直接回音乐页 ——
   * 播放页本身没有什么可看的，不再留一个空状态提示。
   */
  if (!playerStore.currentTrack) {
    const restore = route.query.track
      ? playerStore.restoreTrackById(route.query.track)
      : playerStore.restoreLastSession();
    restore.then((restored) => {
      if (!restored && !playerStore.currentTrack) router.replace('/music');
    });
  }

  // 跟着播放器那一栏的高度走：歌词/内容变长变短都会重新量一次
  if (typeof ResizeObserver !== 'undefined') {
    mainObserver = new ResizeObserver(() => {
      mainHeight.value = playerMain.value?.offsetHeight || 0;
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', syncWideViewport);
  window.removeEventListener('resize', measurePalette);
  mainObserver?.disconnect();
  mainObserver = null;
  // 离开播放页就撤掉「这首歌」的分享卡片，免得串到别的页面
  clearPageShareMeta();
});

// 播放器那一栏是 v-else 里的，track 出现后才有 DOM，所以监听 ref 变化
watch(
  playerMain,
  (el) => {
    mainObserver?.disconnect();
    if (el) {
      mainObserver?.observe(el);
      mainHeight.value = el.offsetHeight || 0;
    }
  },
  { immediate: true }
);

const toggleQueue = async () => {
  showQueue.value = !showQueue.value;
  if (!showQueue.value) return;
  // 窄屏下列表在很下面，展开后顺手带过去
  await nextTick();
  if (!isWideViewport.value) {
    queuePanel.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

/* ---------- 色盘：改的是本页的主色，选完立刻生效并记住 ---------- */
const ACCENTS: Array<{ value: string; label: string }> = [
  { value: '#3b82f6', label: '晴蓝' },
  { value: '#4f46e5', label: '靛蓝' },
  { value: '#0ea5e9', label: '天青' },
  { value: '#14b8a6', label: '青碧' },
  { value: '#22c55e', label: '翠绿' },
  { value: '#84cc16', label: '青柠' },
  { value: '#f59e0b', label: '琥珀' },
  { value: '#f97316', label: '落日' },
  { value: '#ef4444', label: '赤红' },
  { value: '#ec4899', label: '桃粉' },
  { value: '#8b5cf6', label: '紫罗兰' },
];
const ACCENT_VALUES = ACCENTS.map((c) => c.value);

const accent = ref(localStorage.getItem('player_accent') || '');
/** 跟着封面走：换歌就自动切成和封面匹配的颜色 */
const followCover = ref(localStorage.getItem('player_follow_cover') === '1');
/** 当前封面里取出来的颜色 */
const coverAccent = ref('');
/** 自定义取色器里挑的颜色（只在「自定义」里显示，不和预设混在一起） */
const customAccent = ref('');
const showPalette = ref(false);
const palettePanel = ref<HTMLElement | null>(null);
/** 展开时把 max-height 设成内容真实高度，卡片高度才会平滑地长出来 */
const paletteMaxHeight = ref('0px');

const themeStore = useThemeStore();

/** 站点自己的主题色：清掉本页主色之后看到的就是它 */
const defaultAccent = computed(
  () => themeStore.customTheme?.theme_primary_color || (themeStore.isDark ? '#6ea8fe' : '#2563eb')
);

/** 自定义那颗高亮：当前主色就是从取色器里挑的 */
const isCustomAccent = computed(() => !!customAccent.value && accent.value === customAccent.value);

/** 按当前明暗主题算出主色的整套梯度，直接挂到本页的 CSS 变量上 */
const accentVars = computed(() => {
  if (!accent.value) return undefined;
  return buildColorVars('primary', accent.value, themeStore.isDark);
});

const measurePalette = () => {
  const el = palettePanel.value;
  if (!el) return;
  paletteMaxHeight.value = showPalette.value ? `${el.scrollHeight}px` : '0px';
};

const togglePalette = async () => {
  showPalette.value = !showPalette.value;
  await nextTick();
  measurePalette();
};

const applyAccent = (value: string, remember = true) => {
  accent.value = value;
  if (!remember) return;
  if (value) localStorage.setItem('player_accent', value);
  else localStorage.removeItem('player_accent');
};

/** 手选颜色（预设 / 自定义）就不再跟封面走了 */
const pickAccent = (value: string, fromPicker = false) => {
  followCover.value = false;
  localStorage.removeItem('player_follow_cover');
  customAccent.value = fromPicker ? value : '';
  applyAccent(value);
};

const pickerValue = computed({
  get: () => customAccent.value || null,
  set: (value: string | null) => pickAccent(value || '', true),
});

/** 取当前封面主色；跟着封面走时顺手把主色换过去 */
const refreshCoverAccent = async () => {
  const url = cover.value;
  const color = await extractCoverAccent(url, themeStore.isDark);
  // 取色是异步的，回来时如果已经换歌了就不要了
  if (url !== cover.value) return;
  coverAccent.value = color;
  if (followCover.value && color) applyAccent(color);
};

const toggleFollowCover = async () => {
  // 再点一次 = 退出跟随，回到站点默认色
  if (followCover.value) {
    followCover.value = false;
    localStorage.removeItem('player_follow_cover');
    applyAccent('');
    return;
  }

  followCover.value = true;
  localStorage.setItem('player_follow_cover', '1');
  if (!coverAccent.value) await refreshCoverAccent();
  if (coverAccent.value) applyAccent(coverAccent.value);
};

// 换歌重新取色；明暗主题变了，取色的亮度区间也变，一起重算
watch(cover, refreshCoverAccent, { immediate: true });
watch(() => themeStore.isDark, refreshCoverAccent);

const syncPlayerShareMeta = async () => {
  const current = track.value;
  if (!current) {
    clearPageShareMeta();
    document.title = 'OpenStore | 正在播放';
    return;
  }

  /*
   * 先把地址上的 track 同步好再注册分享信息：
   * 分享信息带着「注册时的地址」做校验，先注册再改地址会被判定成过期。
   * 地址上带住歌曲 id，服务端渲染分享卡片时才知道该拿哪首歌。
   */
  if (String(route.query.track || '') !== String(current.id)) {
    await router.replace({ path: '/player', query: { track: String(current.id) } });
  }

  setPageShareMeta({
    title: current.name,
    // 副标题：歌手 · 专辑
    description: [artistText.value, albumText.value].filter(Boolean).join(' · '),
    image: cover.value,
  });
  /*
   * 标签页标题统一成纯歌名（和音乐页那边的行为一致）。
   * 上面注册分享信息会触发 App 里的 applyPageMeta，把标题写成「站点名 | 歌名」，
   * 所以要等那次刷新之后再覆盖。
   */
  await nextTick();
  document.title = current.name;
};

watch(() => track.value?.id, syncPlayerShareMeta, { immediate: true });
/*
 * 这个页面在 keep-alive 白名单里：第二次进来只是「重新激活」，
 * 歌曲没变就不会触发上面的 watch，标题和分享卡片会退回默认值，所以激活时再同步一次。
 */
onActivated(syncPlayerShareMeta);

/* ---------- 歌词 ---------- */
interface LyricLine {
  time: number;
  text: string;
}

const lyrics = ref<LyricLine[]>([]);
const lyricsLoading = ref(false);

/** 解析 LRC：支持一行多个时间标签，[mm:ss.xx] / [mm:ss:xx] 都认 */
const parseLrc = (raw: string): LyricLine[] => {
  const lines: LyricLine[] = [];
  raw.split('\n').forEach((line) => {
    const tags = line.match(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g);
    if (!tags) return;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) return;
    tags.forEach((tag) => {
      const m = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(tag);
      if (!m) return;
      const frac = m[3] ? Number(m[3]) / (m[3].length === 3 ? 1000 : 100) : 0;
      lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    });
  });
  return lines.sort((a, b) => a.time - b.time);
};

const fetchLyrics = async () => {
  lyrics.value = [];
  const id = track.value?.id;
  const base = (playerStore.apiUrl || '').trim().replace(/\/$/, '');
  if (!id || !base) return;

  lyricsLoading.value = true;
  try {
    const res = await proxyRequest(`${base}/lyric?id=${id}`, 'GET', {}, {});
    const raw = res?.data?.lrc?.lyric || res?.data?.lyric || res?.lrc?.lyric || '';
    lyrics.value = typeof raw === 'string' ? parseLrc(raw) : [];
  } catch (e) {
    console.warn('[Player] 获取歌词失败', e);
    lyrics.value = [];
  } finally {
    lyricsLoading.value = false;
  }
};

watch(() => track.value?.id, fetchLyrics, { immediate: true });

/** 当前唱到哪一句 */
const activeLyricIndex = computed(() => {
  const now = playerStore.currentTime;
  let index = -1;
  for (let i = 0; i < lyrics.value.length; i += 1) {
    if (lyrics.value[i].time <= now + 0.2) index = i;
    else break;
  }
  return index;
});

/** 行高与 CSS 里的 --lyric-line-height 保持一致 */
const LYRIC_LINE_HEIGHT = 30;

const activeLine = computed(() => (activeLyricIndex.value >= 0 ? activeLyricIndex.value : 0));

/*
 * 整条歌词都渲染在一根轨道上，靠 translateY 让当前句停在中间那行：
 * 上面一行是上一句，下面一行是下一句，换句时轨道平滑往上滑。
 */
const lyricTrackStyle = computed(() => ({
  transform: `translateY(${(1 - activeLine.value) * LYRIC_LINE_HEIGHT}px)`,
}));
</script>

<style scoped>
.player-view {
  /* 细一点的进度/音量轨道 + 小滑块，比 Element Plus 默认的更秀气 */
  --el-slider-height: 4px;
  --el-slider-button-size: 14px;
  position: relative;
  max-width: 640px;
  margin: 0 auto;
  padding: 8px 20px 32px;
  /*
   * 入场动画放在 .player-layout 上而不是这里：
   * 动画关键帧带 transform，而「带 transform 的祖先」会成为 position: fixed 后代的包含块。
   * 放在这一层，动画那 0.4 秒里 .ambient / .aurora 会被按这个 640px 容器定位，
   * 表现为进页面瞬间背景被框成一块（亮色流光会让它特别明显）。
   * .player-layout 是那两个背景图层的兄弟节点，动画挂它身上不影响它们。
   */
}

/*
 * 环境背景：固定铺满视口，封面放大 + 重模糊，再用主题色蒙层压暗，
 * 保证上面的文字和卡片始终清晰。颜色跟着当前歌曲的封面走。
 */
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-size: cover;
  background-position: center;
  filter: blur(64px) saturate(1.6) brightness(1.05);
  transform: scale(1.35);
  opacity: 0.5;
  transition: opacity 0.4s ease;
}

.ambient::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--el-bg-color) 62%, transparent) 0%,
    color-mix(in srgb, var(--el-bg-color) 80%, transparent) 55%,
    var(--el-bg-color) 100%
  );
}

html.dark .ambient {
  filter: blur(64px) saturate(1.5) brightness(0.5);
  opacity: 0.9;
}

/*
 * 流光背景：三团主题色的光斑在视口里缓慢漂移 + 轻微缩放，形成流动的光感。
 * 位置夹在「环境底色」之上、内容之下（内容在 .player-layout 里是 z-index: 1）。
 * 颜色只取主题色和它的浅色梯度，所以换配色时流光会跟着变。
 */
.aurora {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.aurora-blob {
  position: absolute;
  width: 52vmax;
  height: 52vmax;
  border-radius: 50%;
  filter: blur(64px);
  opacity: 0.42;
  will-change: transform;
}

.aurora-blob--a {
  top: -18vmax;
  left: -14vmax;
  background: radial-gradient(circle at 50% 50%, var(--el-color-primary) 0%, transparent 68%);
  animation: auroraDriftA 18s ease-in-out infinite;
}

.aurora-blob--b {
  top: 6vmax;
  right: -20vmax;
  /* dark-2 在深色模式下是往白混的，比 primary 更亮，用来提一点层次 */
  background: radial-gradient(circle at 50% 50%, var(--el-color-primary-dark-2) 0%, transparent 70%);
  animation: auroraDriftB 24s ease-in-out infinite;
}

.aurora-blob--c {
  bottom: -24vmax;
  left: 10vmax;
  background: radial-gradient(circle at 50% 50%, var(--el-color-primary-light-5) 0%, transparent 72%);
  animation: auroraDriftC 30s ease-in-out infinite;
}

html.dark .aurora-blob {
  opacity: 0.62;
}

@keyframes auroraDriftA {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(10vmax, 8vmax, 0) scale(1.12);
  }
}

@keyframes auroraDriftB {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.06);
  }
  50% {
    transform: translate3d(-12vmax, 10vmax, 0) scale(1);
  }
}

@keyframes auroraDriftC {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(8vmax, -10vmax, 0) scale(1.14);
  }
}

/* 尊重「减少动态效果」的系统设置：保留渐变光斑，但不漂移 */
@media (prefers-reduced-motion: reduce) {
  .aurora-blob {
    animation: none;
  }
}

/* 内容压在环境背景之上 */
.player-layout {
  position: relative;
  z-index: 1;
}

@media (max-width: 768px) {
  /* 手机上少给点模糊半径，省点 GPU */
  .ambient {
    filter: blur(44px) saturate(1.5) brightness(1.05);
  }

  html.dark .ambient {
    filter: blur(44px) saturate(1.4) brightness(0.5);
  }
 }

/*
 * 窄屏：播放器 → 队列，纵向排列；
 * 桌面宽屏：播放器在左（歌词就在歌曲信息下面），队列作为右侧栏。
 */
.player-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'main'
    'queue';
  gap: 16px;
  /* 入场淡入 + 轻微上移。挂在这层（而不是 .player-view）见上面的说明 */
  animation: fadeIn 0.4s ease-out;
}

/* 从迷你播放器展开过来时不用入场动画（补间动画已经在做这件事了） */
.player-layout.no-enter-animation {
  animation: none;
}

.player-main {
  grid-area: main;
  min-width: 0;
  /* 收起播放列表时，播放器自己保持一个舒服的宽度 */
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
}

.queue-panel {
  grid-area: queue;
}

@media (min-width: 1080px) {
  .player-view {
    max-width: 1100px;
    /* 桌面端整体往下坐一点点，别贴着顶栏 */
    padding-top: 24px;
  }

  /*
   * 桌面端：播放器固定 640 宽，第二轨（播放列表）在 0 ↔ 340 之间过渡。
   * 整组是居中的，所以列表展开时播放器会被「推开」一点，而不是突然换布局。
   */
  .player-layout {
    grid-template-columns: minmax(0, 640px) var(--queue-w, 0px);
    grid-template-areas: 'main queue';
    column-gap: 0;
    justify-content: center;
    align-items: start;
    transition: grid-template-columns 0.42s cubic-bezier(0.4, 0, 0.2, 1),
      column-gap 0.42s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .player-layout.has-queue {
    --queue-w: 340px;
    column-gap: 24px;
  }

  .player-main {
    max-width: none;
    margin: 0;
  }

  /* 收起时淡出并往右挪一点，避免 0 宽时内容从格子里溢出来 */
  .queue-panel {
    overflow-x: hidden;
    transition: opacity 0.32s ease, transform 0.42s cubic-bezier(0.4, 0, 0.2, 1),
      visibility 0s;
  }

  .player-layout:not(.has-queue) .queue-panel {
    opacity: 0;
    transform: translateX(28px);
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.24s ease, transform 0.32s ease, visibility 0s linear 0.32s;
  }

  /*
   * 队列高度跟播放器那栏对齐；面板本身不滚 ——
   * 标题固定在上面，只有下面的列表是滑动区域（和移动端一致）。
   */
  .queue-panel {
    position: sticky;
    top: 76px;
    max-height: calc(100vh - 160px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* 标题不参与滚动：不吸顶、不铺底色，就是卡片的头 */
  .player-layout .queue-panel {
    padding: 0;
  }

  .queue-panel .panel-head {
    /* 面板改成 flex 后，标题不能被列表挤扁 */
    flex: none;
    /* 上下留白一样多（16px），标题才居中 */
    padding: 16px 18px;
    background: none;
  }

  /* 列表自己滚：flex 撑满标题下面的空间，超出部分在这里滑动 */
  .queue-panel .queue-list {
    flex: 1;
    min-height: 0;
    margin-top: 0;
    padding: 0 18px 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}

/* ---------- 侧栏面板（歌词 / 队列共用外壳） ---------- */
.side-panel {
  padding: 16px 18px;
  /* max-height 按边框盒算，否则加上内边距会比旁边卡片多出一截 */
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 65%, transparent);
  border-radius: 16px;
  /* 毛玻璃：让封面的颜色透上来，而不是盖一块实心卡片 */
  background-color: color-mix(in srgb, var(--el-bg-color) 66%, transparent);
  backdrop-filter: blur(22px) saturate(1.25);
  -webkit-backdrop-filter: blur(22px) saturate(1.25);
  box-shadow: var(--el-box-shadow-light);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panel-hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* ---------- 歌词：固定三行窗口 + 内部整条轨道滚动 ---------- */
.player-view {
  --lyric-line-height: 30px;
}

.lyric-window {
  position: relative;
  width: 100%;
  height: calc(var(--lyric-line-height) * 3);
  overflow: hidden;
  text-align: center;
  /* 上下两行往边缘淡出，滚起来更像歌词字幕 */
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 26%,
    #000 74%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom, transparent 0, #000 26%, #000 74%, transparent 100%);
}

.lyric-track {
  will-change: transform;
  transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.lyric-row {
  height: var(--lyric-line-height);
  margin: 0;
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: var(--lyric-line-height);
  color: var(--el-text-color-secondary);
  opacity: 0.55;
  cursor: pointer;
  transition: color 0.3s ease, opacity 0.3s ease, font-size 0.3s ease;
}

.lyric-row:hover {
  opacity: 0.85;
}

.lyric-row.is-current {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-color-primary);
  opacity: 1;
}

.lyric-row.is-muted {
  /* 没有歌词时占满整个窗口，让这行字居中 */
  height: calc(var(--lyric-line-height) * 3);
  line-height: calc(var(--lyric-line-height) * 3);
  opacity: 0.7;
  cursor: default;
}

/* ---------- 唱片 ---------- */
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding-top: 4px;
}

.disc {
  position: relative;
  display: grid;
  place-items: center;
  width: min(260px, 62vw);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, #2b2b31 0 26%, #16161a 27% 100%);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.42),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  animation: spin 22s linear infinite;
  animation-play-state: paused;
}

.disc.is-spinning {
  animation-play-state: running;
}

.disc-art {
  width: 62%;
  height: 62%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.disc-hole {
  position: absolute;
  width: 14%;
  height: 14%;
  border-radius: 50%;
  background-color: var(--el-bg-color);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.track-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  min-width: 0;
  width: 100%;
}

.track-name {
  margin: 0;
  max-width: 100%;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.track-tags {
  display: flex;
  gap: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  border-radius: 999px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tag:hover {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-regular);
}

/* 只有「已展开」才是主色；没展开时（哪怕是私人 FM）都保持中性 */
.tag.is-open {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.tag-caret {
  transition: transform 0.2s ease;
}

/* 窄屏箭头朝下，展开后翻上来；宽屏箭头朝右，展开后翻成朝左 */
.tag.is-open .tag-caret {
  transform: rotate(180deg);
}

/* ---------- 控制区 ---------- */
.controls {
  margin-top: 24px;
  padding: 20px 20px 16px;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 65%, transparent);
  border-radius: 20px;
  background-color: color-mix(in srgb, var(--el-bg-color) 66%, transparent);
  backdrop-filter: blur(22px) saturate(1.25);
  -webkit-backdrop-filter: blur(22px) saturate(1.25);
  box-shadow: var(--el-box-shadow-light);
}

/* 不支持 backdrop-filter 的内核：退回不透明底色，保证可读 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .controls,
  .side-panel {
    background-color: var(--el-bg-color);
  }
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.progress {
  flex: 1;
  min-width: 0;
}

/* Element Plus 的圆钮尺寸是写死的 20px（CSS 变量管不到），这里直接调小 */
.progress :deep(.el-slider__button),
.volume-slider :deep(.el-slider__button) {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

.time {
  flex-shrink: 0;
  min-width: 40px;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.time:last-child {
  text-align: right;
}

.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin: 18px 0 4px;
}

.skip-btn,
.play-btn {
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  cursor: pointer;
  transition: transform 0.16s ease, color 0.16s ease, background-color 0.16s ease,
    box-shadow 0.16s ease;
}

/* 上一首 / 下一首：浅底圆钮，静止时安静，hover 才亮 */
.skip-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  color: var(--el-text-color-regular);
  background-color: transparent;
}

/* MediaIcon 的尺寸是 1em，所以这里调字号即可（用 font-size 不会被组件内的 width 规则盖掉） */
.skip-icon {
  font-size: 30px;
}

.skip-btn:hover:not(:disabled) {
  color: var(--el-color-primary);
}

.skip-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.skip-btn:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}

.play-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: var(--el-color-primary);
  background: none;
}

/* 图标本身就是「实心圆挖出播放/暂停」，所以按钮不再画底 */
.play-icon {
  font-size: 54px;
  filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--el-color-primary) 32%, transparent));
}

.play-btn:hover {
  transform: translateY(-1px);
  color: var(--el-color-primary-dark-2);
}

.play-btn:active {
  transform: scale(0.96);
}

/* 次级控制：一条浅底栏装 FM 与音量，比原来那条虚线更干净 */
.extra-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  padding: 8px 12px;
  border-radius: 14px;
  /* 贴着毛玻璃卡片的淡底，同样别用实心色 */
  background-color: color-mix(in srgb, var(--el-fill-color-lighter) 55%, transparent);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: none;
  border-radius: 999px;
  background: none;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.pill:hover {
  color: var(--el-color-primary);
  background-color: var(--el-bg-color);
}

/* ---------- 收藏 / 不感兴趣：和色盘那颗同款的圆形图标按钮 ---------- */
.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}

.icon-btn:hover {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.icon-btn-svg {
  width: 18px;
  height: 18px;
}

/* 点亮：爱心填满并染上当前主色 */
.fav-btn.is-on {
  color: var(--el-color-primary);
}

.fav-btn.is-on:hover {
  transform: scale(1.06);
}

.fav-btn.is-busy {
  opacity: 0.55;
  cursor: progress;
}

/* ---------- 色盘 ---------- */
.palette-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.palette-btn:hover {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.palette-btn.is-open {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.palette-icon {
  width: 18px;
  height: 18px;
  fill: currentColor;
  display: block;
}

.palette-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  /* 收起：高度、内边距、外边距一起归零，展开时再一起长出来 */
  overflow: hidden;
  max-height: 0;
  margin-top: 0;
  padding: 0 12px;
  border-radius: 14px;
  background-color: color-mix(in srgb, var(--el-fill-color-lighter) 55%, transparent);
  opacity: 0;
  transform: translateY(-6px);
  transition: max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.26s ease, transform 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    margin-top 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.palette-panel.is-open {
  margin-top: 12px;
  padding: 10px 12px;
  opacity: 1;
  transform: none;
}

.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease;
}

.swatch:hover {
  transform: scale(1.12);
}

.swatch.is-active {
  border-color: var(--el-text-color-primary);
}

/* 跟随封面：圆里套一圈细边，和纯色块区分开；还没取到色时是中性底色 */
.swatch-cover {
  background-color: var(--el-fill-color-dark);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--el-bg-color) 55%, transparent);
}

.swatch-default {
  /* 站点默认主题色，点它 = 清掉本页主色 */
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-bg-color) 25%, transparent);
}

.pill.is-on {
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.volume {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

.volume-btn {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.16s ease;
}

.volume-btn:hover {
  color: var(--el-color-primary);
}

.volume-icon {
  display: block;
  width: 18px;
  height: 18px;
  fill: currentColor;
  transition: opacity 0.16s ease;
}

/* 静音：图标压暗，一眼能看出是关着的 */
.volume-btn.is-muted {
  color: var(--el-text-color-placeholder);
}

.volume-btn.is-muted .volume-icon {
  opacity: 0.55;
}

.volume-slider {
  width: 112px;
  flex-shrink: 1;
}

/* ---------- 队列 ---------- */
/*
 * 新加载进来的歌曲行，用色盘那张卡展开时的同一套动效：
 * 高度（max-height + 上下内边距）撑开、同时淡入、轻微落位。
 * 缓动和时长跟 .palette-panel 的展开保持一致。
 */
@keyframes queueRowGrow {
  from {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    max-height: 56px;
    padding-top: 8px;
    padding-bottom: 8px;
    transform: translateY(0);
  }
}

.queue-list {
  /* 和面板内边距等宽：标题上下留白一样多 */
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1.4fr) minmax(0, 1fr) 44px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.16s ease;
  /*
   * 持续加载进来的新歌是「撑开」进来的，不是啪一下出现；
   * key 是 歌曲id-序号，老行不会重播，只有新行才动。
   */
  animation: queueRowGrow 0.32s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.queue-row:hover {
  background-color: var(--el-fill-color-light);
}

.queue-row.is-active {
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.q-index {
  display: grid;
  place-items: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.queue-row.is-active .q-index {
  color: var(--el-color-primary);
}

.q-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  color: var(--el-text-color-primary);
}

.queue-row.is-active .q-name {
  color: var(--el-color-primary);
  font-weight: 600;
}

.q-artist,
.q-duration {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.q-duration {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 480px) {
  .player-view {
    padding: 4px 14px 24px;
  }

  .disc {
    width: min(220px, 58vw);
  }

  .track-name {
    font-size: 18px;
  }

  .controls {
    padding: 14px 14px 10px;
    border-radius: 16px;
  }

  .transport {
    gap: 16px;
  }

  .side-panel {
    padding: 14px;
    border-radius: 14px;
  }

  .queue-row {
    grid-template-columns: 24px minmax(0, 1.4fr) minmax(0, 1fr) 40px;
    gap: 8px;
    padding: 8px 6px;
  }
}

/*
 * 移动端：音量由系统控制，不摆音量条；
 * 音量条收起来之后，把收藏 / 不感兴趣推到最右边。
 * 这两条必须放在所有基础样式之后，否则会被后面同优先级的规则盖掉。
 */
@media (max-width: 768px) {
  .extra-bar {
    justify-content: flex-start;
  }

  .volume {
    display: none;
  }

  .fav-btn {
    margin-left: auto;
  }

  /* 队列最多露 8 行（--queue-rows 是按真实行高算出来的），剩下的在里面滚 */
  .queue-panel .queue-list {
    max-height: var(--queue-rows, 320px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
</style>

<!--
  色盘里的自定义取色器是 Element 的组件，内部节点在 scoped 样式里够不到
  （:deep 需要根节点带 scopeId，这里落不上），所以单独放一段非 scoped 的样式。
-->
<style>
/* 取色器触发器：和别的一样的小圆，没选过时整颗就是彩圈 */
.palette-panel .swatch-picker {
  display: inline-flex;
  line-height: 0;
}

.palette-panel .swatch-picker .el-color-picker__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  transition: transform 0.16s ease, border-color 0.16s ease;
}

.palette-panel .swatch-picker .el-color-picker__trigger:hover {
  transform: scale(1.12);
}

.palette-panel .swatch-picker .el-color-picker__color {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 50%;
}

.palette-panel .swatch-picker .el-color-picker__color-inner {
  border-radius: 50%;
}

/* 自带的尾巴箭头和空态那个叉都不要 */
.palette-panel .swatch-picker .el-color-picker__icon,
.palette-panel .swatch-picker .el-color-picker__empty {
  display: none;
}

/* 还没选过自定义色：整颗就是彩圈 */
.palette-panel .swatch-picker.is-empty .el-color-picker__color {
  background: conic-gradient(
    from 210deg,
    #ff3b30,
    #ff9500,
    #ffcc00,
    #34c759,
    #00c7be,
    #0a84ff,
    #5e5ce6,
    #ff2d55,
    #ff3b30
  );
}

.palette-panel .swatch-picker.is-empty .el-color-picker__color-inner {
  background-color: transparent !important;
}

.palette-panel .swatch-picker.is-active .el-color-picker__trigger {
  border-color: var(--el-text-color-primary);
}
</style>
