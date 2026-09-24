<template>
  <div class="login-view" :class="{ 'is-busy': loading, 'is-success': success }">
    <div class="login-shell">
      <!-- 左侧：品牌 + 会看鼠标的几何角色 -->
      <aside ref="stageRef" class="stage" aria-hidden="true">
        <div class="stage-top">
          <span class="brand-mark"></span>
          <span class="brand-name">OpenStore</span>
          <span class="brand-badge">{{ isAdmin ? '控制台' : '登录' }}</span>
        </div>

        <!-- 光源：浅色是太阳，深色是月亮；切换主题时两者旋转轮换 -->
        <div class="celestial" aria-hidden="true">
          <span class="celestial-rays"></span>
          <span class="celestial-halo halo-sun"></span>
          <span class="celestial-halo halo-moon"></span>
          <span class="celestial-disc disc-sun"></span>
          <span class="celestial-disc disc-moon"></span>
          <span class="stars">
            <i v-for="i in 6" :key="i" class="star"></i>
          </span>
        </div>

        <div ref="sceneWrapRef" class="scene-wrap">
            <div
              ref="sceneRef"
              class="scene"
              :style="{ '--u': `${sceneUnit}px`, '--snap': `${sceneSnap}px` }"
            >
            <div
              v-for="c in characters"
              :key="c.key"
              class="char"
              :class="`char-${c.key}`"
              :style="charBoxStyle(c)"
            >
              <span class="char-body" :style="charBodyStyle(c)"></span>
              <div class="face" :style="faceStyle(c)">
                <span
                  v-for="i in 2"
                  :key="i"
                  class="eye"
                  :class="{ 'eye-white': c.eye.white, 'is-blinking': blinking[c.key] }"
                  :style="eyeStyle(c)"
                >
                  <span class="pupil" :style="pupilStyle(c)"></span>
                </span>
              </div>
              <span v-if="c.mouth" class="mouth" :style="mouthStyle(c)"></span>
            </div>
          </div>
        </div>

        <p class="stage-note">
          <span class="pulse-dot"></span>
          {{ sceneNote }}
        </p>

        <!-- 打在角色身上的光：暖光与冷光两层交叉淡入，主题切换时光照也是平滑过渡的 -->
        <span class="starlight starlight-warm" aria-hidden="true"></span>
        <span class="starlight starlight-cool" aria-hidden="true"></span>
      </aside>

      <!-- 右侧：登录表单 -->
      <section class="panel">
        <div class="panel-inner" :class="{ 'shake': shaking }">
          <header class="panel-head">
            <h1 class="panel-title">欢迎回来<span class="title-dot">!</span></h1>
            <p class="panel-sub">{{ isAdmin ? '请登录后管理应用、文章与站点配置' : '请登录后继续' }}</p>
          </header>

          <form class="login-form" novalidate @submit.prevent="login">
            <div class="field">
              <label class="field-label" for="login-username">用户名</label>
              <div
                class="field-box"
                :class="{ 'is-focused': focused === 'username', 'has-icon': true }"
              >
                <el-icon class="field-icon"><User /></el-icon>
                <input
                  id="login-username"
                  ref="usernameRef"
                  v-model="form.username"
                  type="text"
                  autocomplete="username"
                  placeholder="请输入用户名"
                  :disabled="loading || success"
                  @focus="onFocus('username')"
                  @blur="onBlur"
                />
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="login-password">密码</label>
              <div
                class="field-box"
                :class="{ 'is-focused': focused === 'password', 'has-icon': true, 'has-trailing': true }"
              >
                <el-icon class="field-icon"><Lock /></el-icon>
                <input
                  id="login-password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                  :disabled="loading || success"
                  @focus="onFocus('password')"
                  @blur="onBlur"
                  @keydown="checkCapsLock"
                  @keyup="checkCapsLock"
                />
                <button
                  type="button"
                  class="field-trailing"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-pressed="showPassword"
                  :title="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <el-icon><component :is="showPassword ? Hide : View" /></el-icon>
                </button>
              </div>

              <transition name="hint">
                <p v-if="capsOn" class="field-hint">
                  <el-icon><Warning /></el-icon> Caps Lock 已开启
                </p>
              </transition>
            </div>

            <transition name="hint">
              <div v-if="error" class="error-chip" role="alert">
                <el-icon><CircleClose /></el-icon>
                <span>{{ error }}</span>
              </div>
            </transition>

            <button
              class="submit-btn"
              type="submit"
              :disabled="loading || success"
              :aria-busy="loading"
            >
              <span class="submit-text" :class="{ 'is-out': loading || success }">
                {{ loading ? '验证中…' : success ? '登录成功' : '登 录' }}
              </span>
              <span class="submit-fill">
                <template v-if="loading">
                  <span class="spinner" aria-hidden="true"></span>验证中…
                </template>
                <template v-else-if="success">
                  <el-icon><Select /></el-icon>登录成功
                </template>
                <template v-else>
                  登 录
                  <el-icon class="submit-arrow"><Right /></el-icon>
                </template>
              </span>
            </button>
          </form>

          <p class="panel-foot">
            按 <kbd>Enter</kbd> 直接提交 · <kbd>Tab</kbd> 切换输入框
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  User, Lock, View, Hide, Right, Select, Warning, CircleClose,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { loginAdmin } from '../services/admin';
import { useThemeStore } from '../stores/theme';

const router = useRouter();
const route = useRoute();
const store = useAuthStore();
const themeStore = useThemeStore();

/**
 * 主题切换时播放一次"日落月升"。
 * 必须**同步**改类名：主题是直接改 html.dark 的（同步生效），
 * 如果等 Vue 下一帧再挂动画类，就会先闪一下新状态再倒回去重播，非常难看。
 */
const stageRef = ref<HTMLElement | null>(null);
let morphTimer = 0;
watch(() => themeStore.isDark, (isDark) => {
  const el = stageRef.value;
  if (!el) return;
  window.clearTimeout(morphTimer);
  el.classList.remove('is-morphing', 'is-toDark', 'is-toLight');
  void el.offsetWidth; // 强制重排，保证连续切换时动画能重新播放
  el.classList.add('is-morphing', isDark ? 'is-toDark' : 'is-toLight');
  morphTimer = window.setTimeout(() => {
    el.classList.remove('is-morphing', 'is-toDark', 'is-toLight');
  }, 1800);
});

const isAdmin = computed(() => route.path.startsWith('/admin'));

const form = ref({ username: '', password: '' });
const loading = ref(false);
const success = ref(false);
const error = ref('');
const showPassword = ref(false);
const capsOn = ref(false);
const shaking = ref(false);
const focused = ref<'' | 'username' | 'password'>('');
const usernameRef = ref<HTMLInputElement | null>(null);

/* ---------------- 登录逻辑（与原实现保持一致） ---------------- */

const login = async () => {
  if (loading.value || success.value) return;
  error.value = '';
  loading.value = true;
  try {
    const data = await loginAdmin(form.value);
    store.setToken(data.token);
    success.value = true;
    // 留一点时间播完成功动画再跳转
    await new Promise((resolve) => window.setTimeout(resolve, 620));

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect.trim() : '';
    if (redirect.startsWith('/admin')) {
      router.replace(redirect);
      return;
    }
    if (route.path.startsWith('/admin')) {
      router.replace('/admin/dashboard');
      return;
    }
    router.replace({ name: 'home' });
  } catch (e: any) {
    const raw = String(e?.response?.data?.error || '');
    // 上游返回的是英文提示，这里顺手汉化一下常见的几种
    if (/invalid credentials/i.test(raw)) {
      error.value = '用户名或密码不正确';
    } else if (/too many/i.test(raw)) {
      error.value = '尝试次数过多，请稍后再试';
    } else {
      error.value = raw || '登录失败，请检查用户名和密码';
    }
    await triggerShake();
  } finally {
    loading.value = false;
  }
};

const triggerShake = async () => {
  shaking.value = false;
  await nextTick();
  shaking.value = true;
  window.setTimeout(() => { shaking.value = false; }, 520);
};

const checkCapsLock = (e: KeyboardEvent) => {
  capsOn.value = e.getModifierState?.('CapsLock') ?? false;
};

const onFocus = (which: 'username' | 'password') => {
  focused.value = which;
  if (which !== 'password') capsOn.value = false;
  triggerLean(which === 'password' ? 'amber' : 'violet');
};

const onBlur = () => {
  focused.value = '';
  capsOn.value = false;
};

/* ---------------- 角色的鼠标跟随 / 倾斜 ---------------- */

type CharKey = 'violet' | 'slate' | 'coral' | 'amber';

interface CharConfig {
  key: CharKey;
  left: number;
  width: number;
  height: number;
  /** 四个角的圆角，单位同 left/width（会按 --u 等比换算） */
  radius: [number, number, number, number];
  z: number;
  /** 响应鼠标位移的强度，越大越"活" */
    react: number;
    face: { left: number; top: number; gap: number };
    eye: { size: number; pupil: number; white: boolean };
    /** 瞳孔最多能偏移多少像素 */
  pupilMax: number;
  mouth?: { left: number; top: number; width: number };
}

const SCENE_W = 550;
const SCENE_H = 400;
/** 场景左右留白：倾斜时身体会横向甩出去，需要留出空间 */
const SCENE_PAD_X = 40;
const SCENE_BOX_W = SCENE_W + SCENE_PAD_X * 2;
const SCENE_BOX_H = SCENE_H;

const characters: CharConfig[] = [
  {
    key: 'violet',
    left: 70, width: 180, height: 400,
    radius: [14, 14, 0, 0], z: 1, react: 1,
    face: { left: 45, top: 40, gap: 32 },
    eye: { size: 18, pupil: 7, white: true },
    pupilMax: 5,
  },
  {
    key: 'slate',
    left: 240, width: 120, height: 310,
    radius: [10, 10, 0, 0], z: 2, react: 1.5,
    face: { left: 26, top: 32, gap: 24 },
    eye: { size: 16, pupil: 6, white: true },
    pupilMax: 4,
  },
  {
    key: 'coral',
    left: 0, width: 240, height: 200,
    radius: [120, 120, 0, 0], z: 3, react: 0.8,
    face: { left: 82, top: 90, gap: 32 },
    eye: { size: 12, pupil: 12, white: false },
    pupilMax: 5,
  },
  {
    key: 'amber',
    left: 310, width: 140, height: 230,
    radius: [70, 70, 0, 0], z: 4, react: 1,
    face: { left: 52, top: 40, gap: 24 },
    eye: { size: 12, pupil: 12, white: false },
    pupilMax: 5,
    mouth: { left: 40, top: 88, width: 80 },
  },
];

const CHAR_COLOR: Record<CharKey, string> = {
  violet: 'var(--char-violet)',
  slate: 'var(--char-slate)',
  coral: 'var(--char-coral)',
  amber: 'var(--char-amber)',
};

const pointer = reactive({ x: -9999, y: -9999 });
const sceneWrapRef = ref<HTMLElement | null>(null);
const sceneRef = ref<HTMLElement | null>(null);
/** 1 个设计单位 = 多少 px（不用 transform: scale，避免缩放重采样让底边发虚） */
const sceneUnit = ref(1);
/**
 * 地平线（场景底边）到整数像素的补偿量。
 * 落在 692.125 这种小数像素上时，每个角色的底边都会各自抗锯齿，
 * 混合比例略有差别就会被看成"某个角色没和别的一样齐"。
 */
const sceneSnap = ref(0);

/** 把设计单位换算成实际的 px 长度 */
const u = (n: number) => `calc(${n} * var(--u))`;
const blinking = reactive<Record<CharKey, boolean>>({
  violet: false, slate: false, coral: false, amber: false,
});
const leaningChar = ref<CharKey | ''>('');
// 密码已输入时的两种花样：遮挡 / 偷看
const peeking = ref(false);

const passwordFilled = computed(() => form.value.password.length > 0);
const hidingPassword = computed(() => passwordFilled.value && !showPassword.value);
const spyingPassword = computed(() => passwordFilled.value && showPassword.value);

/** 角色整体相对鼠标的偏移（脸 + 身体倾斜） */
const charDelta = (c: CharConfig) => {
  const el = sceneRef.value;
  if (!el || pointer.x < -1000) return { faceX: 0, faceY: 0, skew: 0 };
  const rect = el.getBoundingClientRect();
  // 用场景盒子的实际尺寸换算回内容坐标（内容相对盒子还偏移了左右留白 / 底部裁剪线）
  const localX = ((pointer.x - rect.left) / rect.width) * SCENE_BOX_W - SCENE_PAD_X;
  const localY = ((pointer.y - rect.top) / rect.height) * SCENE_BOX_H;
  const charCenterX = c.left + c.width / 2;
  const charCenterY = SCENE_H - c.height / 3;
  const deltaX = localX - charCenterX;
  const deltaY = localY - charCenterY;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    faceX: clamp(deltaX / 22, -16, 16) * c.react,
    faceY: clamp(deltaY / 34, -11, 11) * c.react,
    skew: clamp(-deltaX / 130, -6, 6),
  };
};

/**
 * 每个角色外层留出左右缓冲（倾斜时身体会横向甩出去），
 * 并用 overflow:hidden 让四条底边落在同一条裁剪线上 ——
 * 否则带 transform 的元素各自光栅化，底边会出现约 1px 的错位。
 */
const charPad = (c: CharConfig) => Math.ceil(c.height * 0.19);

/** 偷看密码时，整组角色往后退一点 */
const shiftX = () => (spyingPassword.value ? -10 : 0);
/** 被聚焦的角色探身一点：从地平线往上"长"，而不是整块离开地面 */
const shiftY = (c: CharConfig) => (leaningChar.value === c.key ? -12 : 0);
/** 盒子上方预留的空间（≥ 最大探身位移），否则探身时角色的头顶会被裁掉 */
const LIFT_PAD = 16;

const charBoxStyle = (c: CharConfig) => {
  const pad = charPad(c);
  return {
    left: u(c.left + SCENE_PAD_X - pad),
    width: u(c.width + pad * 2),
    height: u(c.height + LIFT_PAD),
    bottom: 0,
    zIndex: c.z,
    '--pad': u(pad),
    '--pad-y': u(LIFT_PAD),
    '--pad-x': u(SCENE_PAD_X),
  };
};

const charBodyStyle = (c: CharConfig) => {
  const { skew } = charDelta(c);
  // 密码可见：身体往后仰（歪一下），像是"我可没看"
  const lean = spyingPassword.value ? -4 : hidingPassword.value ? 3 : 0;
  return {
    background: CHAR_COLOR[c.key],
    borderRadius: c.radius.map((r) => (r ? u(r) : '0')).join(' '),
    /*
     * 位移只作用在身体上，不作用在外层盒子上：
     * 外层盒子负责裁剪，裁剪线必须钉死在地平线上。之前把整个盒子抬起来，
     * 角色"跳起"的瞬间底边会跟着上移，下面立刻露出一段空白。
     */
    transform: `translate(${u(shiftX())}, ${u(shiftY(c))}) skewX(${skew + lean}deg)`,
  };
};

const faceStyle = (c: CharConfig) => {
  const { faceX, faceY } = charDelta(c);
  // 看密码可见时角色把头扭开
  const away = spyingPassword.value ? (c.key === 'amber' ? -22 : -16) : 0;
  const peekBack = spyingPassword.value && peeking.value ? 30 : 0;
  const down = hidingPassword.value ? 14 : 0;
  return {
    left: u(charPad(c) + c.face.left + faceX + away + peekBack + shiftX()),
    top: u(LIFT_PAD + c.face.top + faceY + down + shiftY(c)),
    gap: u(c.face.gap),
  };
};

const eyeStyle = (c: CharConfig) => ({
  width: u(c.eye.size),
  height: u(c.eye.size),
});

const pupilStyle = (c: CharConfig) => {
  const { faceX, faceY } = charDelta(c);
  const max = c.pupilMax;
  const x = spyingPassword.value ? -max * (peeking.value ? -1 : 1) : Math.max(-max, Math.min(max, (faceX / 16) * max));
  const y = hidingPassword.value ? max : Math.max(-max, Math.min(max, (faceY / 11) * max));
  return {
    width: u(c.eye.pupil),
    height: u(c.eye.pupil),
    transform: `translate(${u(x)}, ${u(y)})`,
  };
};

const mouthStyle = (c: CharConfig) => {
  const { faceX, faceY } = charDelta(c);
  const away = spyingPassword.value ? (peeking.value ? 30 : -22) : 0;
  return {
    left: u(charPad(c) + (c.mouth!.left) + faceX + away + shiftX()),
    top: u(LIFT_PAD + (c.mouth!.top) + faceY + shiftY(c)),
    width: spyingPassword.value ? u(22) : u(c.mouth!.width),
  };
};

/* ---------------- 交互：鼠标、眨眼、入场 ---------------- */

let pointerRaf = 0;
const pendingPointer = { x: 0, y: 0 };
const onPointerMove = (e: PointerEvent) => {
  pendingPointer.x = e.clientX;
  pendingPointer.y = e.clientY;
  if (pointerRaf) return;
  pointerRaf = window.requestAnimationFrame(() => {
    pointer.x = pendingPointer.x;
    pointer.y = pendingPointer.y;
    pointerRaf = 0;
  });
};

let blinkTimers: number[] = [];
const scheduleBlink = (key: CharKey) => {
  const delay = 2600 + Math.random() * 3600;
  const id = window.setTimeout(() => {
    blinking[key] = true;
    window.setTimeout(() => {
      blinking[key] = false;
      scheduleBlink(key);
    }, 150);
  }, delay);
  blinkTimers.push(id);
};

let peekTimer = 0;
let leanTimer = 0;
const triggerLean = (key: CharKey) => {
  leaningChar.value = key;
  window.clearTimeout(leanTimer);
  leanTimer = window.setTimeout(() => { leaningChar.value = ''; }, 800);
};

/** 密码可见时，角色偶尔"偷看"一眼（自己排队下一次） */
const schedulePeek = () => {
  window.clearTimeout(peekTimer);
  if (!spyingPassword.value) {
    peeking.value = false;
    return;
  }
  peekTimer = window.setTimeout(() => {
    peeking.value = true;
    window.setTimeout(() => {
      peeking.value = false;
      schedulePeek();
    }, 800);
  }, 1800 + Math.random() * 2600);
};

watch(spyingPassword, (spying) => {
  window.clearTimeout(peekTimer);
  peeking.value = false;
  if (spying) schedulePeek();
});

const sceneNote = computed(() => {
  if (success.value) return '身份验证通过';
  if (spyingPassword.value) return '它们正在偷看你的密码…';
  if (hidingPassword.value) return '密码已隐藏，它们什么也看不见';
  if (loading.value) return '正在校验凭据…';
  if (focused.value) return '认真输入中…';
  return '它们会一直看着你的鼠标';
});

/* ---------------- 布局缩放 ---------------- */

let resizeObserver: ResizeObserver | null = null;
const updateScale = () => {
  const el = sceneWrapRef.value;
  if (!el) return;
  const availableW = Math.max(el.clientWidth, 240);
  const availableH = Math.max(el.clientHeight, 140);
  sceneUnit.value = Math.min(1, availableW / SCENE_W, availableH / SCENE_H);

  // 场景贴着 scene-wrap 底部，把这条地平线的像素小数部分补掉，底边才干净
  const rect = el.getBoundingClientRect();
  sceneSnap.value = Math.round(rect.bottom) - rect.bottom;
};

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  (['violet', 'slate', 'coral', 'amber'] as CharKey[]).forEach((k, i) => {
    window.setTimeout(() => scheduleBlink(k), i * 700);
  });
  updateScale();
  if (typeof ResizeObserver !== 'undefined' && sceneWrapRef.value) {
    resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(sceneWrapRef.value);
  }
  usernameRef.value?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  if (pointerRaf) window.cancelAnimationFrame(pointerRaf);
  blinkTimers.forEach((id) => window.clearTimeout(id));
  blinkTimers = [];
  window.clearTimeout(leanTimer);
  window.clearTimeout(peekTimer);
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.login-view {
  padding: 8px 0 24px;
}

.login-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  width: 100%;
  max-width: 1080px;
  /*
   * 高度跟着窗口走：顶部 60px 是固定顶栏，底部留出悬浮 Dock 的位置。
   * 之前锁死 660px，窗口更高时卡片下方会空出一截，那条卡片底边看起来
   * 就像画面中间凭空多了一条横线。
   */
  min-height: clamp(520px, calc(100vh - 192px), 1040px);
  margin: 0 auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 24px;
  background: var(--el-bg-color);
  box-shadow: 0 24px 60px -30px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}

/* ---------- 左侧舞台 ---------- */

.stage {
  /* 光源在右上角：太阳 / 月亮与光照层共用，保证光是从光源发出去的 */
  --light-x: 77%;
  --light-y: 15%;
  position: relative;
  isolation: isolate;
  /* 裁掉画布外的部分：月亮从右上角"外面"进来时要被挡在面板内 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  padding: 28px 28px 22px;
  /*
   * 只用纯色 + 一层柔和的径向高光，刻意不用线性渐变：
   * 大面积浅色线性渐变在 8bit 量化下每跨一级会出现一条很淡的分界线，
   * 而且这条线随 x 倾斜，看起来就是面板中间凭空多了一条横线。
   */
  background-color: #e4e9f2;
  /* 底色跟着主题平滑过渡，配合日/月的起落，整块面板是渐变过来的 */
  transition: background-color 0.75s ease;
  --char-violet: #6c3ff5;
  --char-slate: #2d2d2d;
  --char-coral: #ff9b6b;
  --char-amber: #e8d754;
}

html.dark .stage {
  background-color: #1d2027;
  --char-slate: #8d949e;
}

.stage-top {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2430;
}

html.dark .stage-top {
  color: #e8ebf0;
}

.brand-mark {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background-color: currentColor;
  -webkit-mask: url('/favicon.svg') no-repeat center center / contain;
  mask: url('/favicon.svg') no-repeat center center / contain;
}

.brand-badge {
  padding: 1px 9px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.55;
}

.scene-wrap {
  position: relative;
  flex: 1;
  min-height: 240px;
}

.scene {
  position: absolute;
  /* 用 margin 居中而不是 transform：带 transform 的祖先会让子图层的裁剪各自取整 */
  left: 0;
  right: 0;
  margin: 0 auto;
  bottom: calc(0px - var(--snap, 0px));
  width: calc(630 * var(--u));
  height: calc(400 * var(--u));
  transform-origin: bottom center;
  /* 场景再兜一层裁剪，保证任何溢出都不会露到地平线以下 */
  overflow: hidden;
}

.char {
  position: absolute;
  /* 四个角色的盒子都停在同一条地平线上（bottom: 0），身体多伸出的部分在这里被裁掉 */
  bottom: 0;
  overflow: hidden;
  transform-origin: bottom center;
  transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  animation: char-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.char-body {
  position: absolute;
  /* 盒子顶部多留了 LIFT_PAD：身体从这里往下画，探身时头顶才不会被裁掉 */
  top: var(--pad-y);
  left: var(--pad);
  right: var(--pad);
  /* 底部统一向下延伸一大截，四个角色最后由同一条地平线收底 */
  bottom: calc(-40 * var(--u));
  display: block;
  transform-origin: bottom center;
  /* 角色的颜色也跟着主题平滑过渡（深色下那个"深灰"角色会变中灰） */
  transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.7s ease;
}

.char-violet { animation-delay: 0.05s; }
.char-slate { animation-delay: 0.15s; }
.char-coral { animation-delay: 0.25s; }
.char-amber { animation-delay: 0.35s; }

@keyframes char-rise {
  from { transform: translateY(calc(60 * var(--u))); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.face {
  position: absolute;
  display: flex;
  align-items: center;
  transition: left 0.7s cubic-bezier(0.22, 1, 0.36, 1), top 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.eye {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: transparent;
  overflow: hidden;
  transition: height 0.16s ease, background-color 0.3s ease;
}

.eye-white {
  background: #fff;
}

.eye.is-blinking {
  height: calc(3 * var(--u)) !important;
}

.pupil {
  display: block;
  border-radius: 50%;
  background: #2d2d2d;
  transition: transform 0.12s ease-out, width 0.3s ease;
}

.mouth {
  position: absolute;
  height: calc(4 * var(--u));
  border-radius: 999px;
  background: #2d2d2d;
  transition: left 0.7s cubic-bezier(0.22, 1, 0.36, 1), top 0.7s ease, width 0.3s ease;
}

.stage-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  color: #4b5563;
}

/* ---------- 光源：太阳 / 月亮（右上角） ---------- */

.celestial {
  position: absolute;
  left: var(--light-x);
  top: var(--light-y);
  width: 76px;
  height: 76px;
  translate: -50% -50%;
  z-index: 3;
  pointer-events: none;
}

.celestial > * {
  position: absolute;
  border-radius: 50%;
}

/* 太阳与月亮是两层叠在一起，切换时交叉淡入淡出 */
.celestial-disc {
  inset: 0;
  transition: opacity 0.45s ease;
}

.disc-sun {
  background: radial-gradient(circle at 34% 30%, #fffdf2 0%, #ffe89a 42%, #ffc85c 72%, #ffb03f 100%);
  box-shadow:
    0 0 26px rgba(255, 200, 92, 0.55),
    0 0 64px rgba(255, 190, 90, 0.28);
}

.disc-moon {
  opacity: 0;
  background:
    radial-gradient(circle at 68% 30%, rgba(0, 0, 0, 0.16) 0%, transparent 26%),
    radial-gradient(circle at 36% 64%, rgba(0, 0, 0, 0.12) 0%, transparent 22%),
    radial-gradient(circle at 32% 30%, #ffffff 0%, #e8eefc 48%, #c9d6f5 100%);
  box-shadow:
    0 0 24px rgba(198, 216, 255, 0.6),
    0 0 70px rgba(150, 180, 255, 0.32);
}

.celestial-halo {
  inset: -46%;
  transition: opacity 0.45s ease;
  animation: halo-breathe 5.5s ease-in-out infinite;
}

.halo-sun {
  background: radial-gradient(circle, rgba(255, 214, 130, 0.42) 0%, rgba(255, 214, 130, 0.12) 48%, transparent 72%);
}

.halo-moon {
  opacity: 0;
  background: radial-gradient(circle, rgba(190, 214, 255, 0.45) 0%, rgba(160, 190, 255, 0.14) 50%, transparent 72%);
}

.celestial-rays {
  inset: -78%;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 205, 110, 0.34) 0deg 3deg,
    transparent 3deg 22deg
  );
  -webkit-mask: radial-gradient(circle, transparent 34%, #000 44%, transparent 74%);
  mask: radial-gradient(circle, transparent 34%, #000 44%, transparent 74%);
  animation: rays-spin 64s linear infinite;
  transition: opacity 0.45s ease;
}

/* 星星只在深色（月亮）下出现 */
.stars {
  inset: 0;
}

.star {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #eaf1ff;
  opacity: 0;
  transition: opacity 0.5s ease;
}

.star:nth-child(1) { top: -22px; left: 68px; }
.star:nth-child(2) { top: 42px; left: 84px; animation-delay: 0.9s; }
.star:nth-child(3) { top: 74px; left: 34px; animation-delay: 1.6s; }
.star:nth-child(4) { top: -6px; left: 8px; animation-delay: 2.3s; }
.star:nth-child(5) { top: 62px; left: -18px; animation-delay: 1.1s; }
.star:nth-child(6) { top: 12px; left: -22px; animation-delay: 2.8s; }

html.dark .disc-sun { opacity: 0; }
html.dark .disc-moon { opacity: 1; }
html.dark .halo-sun { opacity: 0; }
html.dark .halo-moon { opacity: 1; }
html.dark .celestial-rays { opacity: 0; }
html.dark .star {
  opacity: 0.55;
  animation: twinkle 3.6s ease-in-out infinite;
}

/*
 * 主题切换的一瞬间：日落月升。
 * 转深色 = 太阳落下、月亮升起；转浅色则相反。
 */
/* 先落：太阳（本体 + 光晕 + 光芒 + 暖光） */
.stage.is-toDark .disc-sun,
.stage.is-toDark .halo-sun,
.stage.is-toDark .celestial-rays,
.stage.is-toDark .starlight-warm,
/* 先落：月亮（本体 + 光晕 + 星星 + 冷光） */
.stage.is-toLight .disc-moon,
.stage.is-toLight .halo-moon,
.stage.is-toLight .stars,
.stage.is-toLight .starlight-cool {
  /* fill-mode 用 both：带延迟的那组在等待期间也要停在起始帧，不能提前露出来 */
  animation: celestial-set 0.72s cubic-bezier(0.5, 0, 0.85, 0.35) both;
}

/* 后升：等前一个基本落出去了才进场（延迟 0.78s） */
.stage.is-toDark .disc-moon,
.stage.is-toDark .halo-moon,
.stage.is-toDark .stars,
.stage.is-toDark .starlight-cool,
.stage.is-toLight .disc-sun,
.stage.is-toLight .halo-sun,
.stage.is-toLight .celestial-rays,
.stage.is-toLight .starlight-warm {
  animation: celestial-rise 0.78s cubic-bezier(0.22, 1.05, 0.36, 1) 0.78s both;
}

/* 落下：朝左下角沉出去，先慢后快，末段淡出 */
@keyframes celestial-set {
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  35%  { transform: translate(-52px, 62px) scale(0.99); opacity: 1; }
  72%  { opacity: 0.5; }
  100% { transform: translate(-360px, 470px) scale(0.86); opacity: 0; }
}

/* 升起：从右上角外滑进来，落位时轻微过冲再回稳 */
@keyframes celestial-rise {
  0%   { transform: translate(205px, -230px) scale(0.86); opacity: 0; }
  38%  { opacity: 0.75; }
  72%  { transform: translate(-6px, 8px) scale(1.03); opacity: 1; }
  100% { transform: translate(0, 0) scale(1); opacity: 1; }
}

/* 光照层：盖在角色之上，从光源发散出去 */
.starlight {
  position: absolute;
  /* 光照层做成"跟着光源走"的一块光斑：基点与光源重合，动画时跟着一起位移 */
  left: var(--light-x);
  top: var(--light-y);
  width: 190%;
  height: 160%;
  translate: -50% -50%;
  z-index: 2;
  pointer-events: none;
  mix-blend-mode: screen;
  /* 主题切换时光照也跟着交叉淡入，不会"啪"地一下换色 */
  transition: opacity 0.85s ease;
}

.starlight-warm {
  background: radial-gradient(
    circle at 50% 50%,
    rgba(255, 208, 130, 0.5) 0%,
    rgba(255, 222, 170, 0.24) 24%,
    rgba(255, 235, 205, 0.08) 44%,
    transparent 62%
  );
}

.starlight-cool {
  opacity: 0;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(196, 218, 255, 0.62) 0%,
    rgba(158, 188, 255, 0.32) 26%,
    rgba(136, 166, 246, 0.13) 45%,
    transparent 64%
  );
}

html.dark .starlight-warm { opacity: 0; }
html.dark .starlight-cool { opacity: 1; }

@keyframes rays-spin {
  to { transform: rotate(360deg); }
}

@keyframes halo-breathe {
  0%, 100% { opacity: 0.72; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.07); }
}

@keyframes twinkle {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 0.95; transform: scale(1.15); }
}

@keyframes light-breathe {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}

html.dark .stage-note {
  color: #9aa3af;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
  animation: pulse 2s ease-out infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
  70% { box-shadow: 0 0 0 9px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

/* ---------- 右侧表单 ---------- */

.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 44px;
  background: var(--el-bg-color);
}

.panel-inner {
  width: 100%;
  max-width: 380px;
}

.panel-inner.shake {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-7px); }
  40%, 60% { transform: translateX(7px); }
}

.panel-head {
  text-align: center;
  margin-bottom: 30px;
}

.panel-title {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--el-text-color-primary);
}

.title-dot {
  color: var(--el-color-primary);
}

.panel-sub {
  margin: 0;
  font-size: 13.5px;
  color: var(--el-text-color-secondary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.field-box {
  position: relative;
  display: flex;
  align-items: center;
  height: 50px;
  padding: 0 18px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s ease, box-shadow 0.25s ease, background-color 0.2s ease;
}

.field-box.is-focused {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--el-color-primary) 16%, transparent);
}

.field-box:focus-within .field-icon {
  color: var(--el-color-primary);
  transform: scale(1.08);
}

.field-icon {
  flex: 0 0 auto;
  margin-right: 10px;
  font-size: 17px;
  color: var(--el-text-color-placeholder);
  transition: color 0.2s ease, transform 0.2s ease;
}

.field-box input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14.5px;
  font-family: inherit;
  color: var(--el-text-color-primary);
}

.field-box input::placeholder {
  color: var(--el-text-color-placeholder);
}

.field-box.has-trailing input {
  padding-right: 8px;
}

.field-trailing {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;
}

.field-trailing:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.field-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0 4px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.error-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--el-color-danger) 35%, transparent);
  border-radius: 12px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 13px;
}

/* 参考 careercompass 的按钮：文字滑出 + 填充层滑入 */
.submit-btn {
  position: relative;
  height: 50px;
  margin-top: 4px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.submit-btn:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  box-shadow: 0 10px 24px -12px color-mix(in srgb, var(--el-color-primary) 80%, transparent);
}

.submit-btn:disabled {
  cursor: default;
}

.submit-text {
  display: inline-block;
  transition: transform 0.32s ease, opacity 0.32s ease;
}

.submit-btn:hover:not(:disabled) .submit-text {
  transform: translateX(26px);
  opacity: 0;
}

.submit-fill {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  background: var(--el-color-primary);
  color: #fff;
  opacity: 0;
  transform: translateY(100%);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease;
}

.submit-btn:hover:not(:disabled) .submit-fill,
.submit-btn:disabled .submit-fill {
  opacity: 1;
  transform: translateY(0);
}

.submit-btn:disabled .submit-text.is-out {
  opacity: 0;
}

.login-view.is-success .submit-fill {
  background: var(--el-color-success);
}

.submit-arrow {
  transition: transform 0.3s ease;
}

.submit-btn:hover:not(:disabled) .submit-arrow {
  transform: translateX(4px);
}

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.panel-foot {
  margin: 22px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

kbd {
  padding: 1px 6px;
  border: 1px solid var(--el-border-color);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-family: inherit;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

/* ---------- 过渡 ---------- */

.hint-enter-active,
.hint-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---------- 响应式 ---------- */

@media (max-width: 1080px) {
  .login-shell {
    grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  }

  .panel {
    padding: 34px 28px;
  }

  .panel-inner {
    max-width: 340px;
  }
}

/* 窄屏改成上下堆叠：上面留一小段角色舞台，下面才是表单 */
@media (max-width: 760px) {
  .login-shell {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    border-radius: 20px;
  }

  .stage {
    gap: 6px;
    padding: 20px 20px 14px;
  }

  .scene-wrap {
    min-height: 216px;
  }

  .panel {
    padding: 24px 20px 30px;
  }

  .panel-head {
    margin-bottom: 22px;
  }

  .panel-title {
    font-size: 26px;
  }

  .panel-inner {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .char,
  .face,
  .pupil,
  .mouth,
  .submit-fill,
  .submit-text {
    transition: none !important;
    animation: none !important;
  }

  .pulse-dot,
  .celestial > *,
  .celestial-rays,
  .celestial-halo,
  .star,
  .starlight {
    animation: none;
  }

  .starlight {
    transition: none;
  }
}
</style>
