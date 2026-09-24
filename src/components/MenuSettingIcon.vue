<template>
  <!--
    menu-setting：菜单（左侧三条）+ 设置齿轮（右下）。
    尺寸跟随字号（1em），颜色跟随 currentColor，跟其它图标组件一致。
  -->
  <svg
    class="menu-setting-icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="2.2" y="4.8" width="9.6" height="2.1" rx="1.05" fill="currentColor" />
    <rect x="2.2" y="10.55" width="9.6" height="2.1" rx="1.05" fill="currentColor" />
    <rect x="2.2" y="16.3" width="5.4" height="2.1" rx="1.05" fill="currentColor" />

    <g fill="currentColor" transform="translate(16.4 16.4)">
      <rect
        v-for="i in 6"
        :key="i"
        x="-0.95"
        y="-6.6"
        width="1.9"
        height="2.5"
        rx="0.95"
        :transform="`rotate(${(i - 1) * 60})`"
      />
      <path
        fill-rule="evenodd"
        d="M0 -4.3a4.3 4.3 0 1 0 0 8.6a4.3 4.3 0 1 0 0 -8.6Zm0 2.3a2 2 0 1 1 0 4a2 2 0 1 1 0 -4Z"
      />
    </g>
  </svg>
</template>
