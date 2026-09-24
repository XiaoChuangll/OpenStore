<template>
  <!--
    鸿蒙官方符号库里的 download 图标（HarmonyOS Symbol / download）：
    https://developer.huawei.com/consumer/cn/design/harmonyos-symbol
    路径取自官方符号，仅把 fill 换成 currentColor，让它跟随按钮文字颜色（含深色模式）。
    用法：<el-button :icon="HarmonyDownloadIcon">打开 App</el-button>
  -->
  <svg
    class="harmony-download-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M10.9 17.28Q11.14 17.5 11.41 17.6Q11.69 17.71 12 17.71Q12.31 17.71 12.59 17.6Q12.86 17.5 13.1 17.28L17.78 12.58L17.83 12.53Q18.02 12.29 18.01 12Q18 11.71 17.78 11.52Q17.59 11.33 17.3 11.32Q17.02 11.3 16.78 11.47L16.73 11.52L12.74 15.43L12.74 2.88Q12.74 2.57 12.53 2.35Q12.31 2.14 12 2.14Q11.69 2.14 11.47 2.35Q11.26 2.57 11.26 2.88L11.26 15.48L7.27 11.52Q7.08 11.3 6.77 11.3Q6.46 11.3 6.24 11.52Q6 11.74 6 12.05Q6 12.36 6.24 12.58L10.9 17.28Z"
    />
    <path
      d="M21.26 15.29Q20.95 15.29 20.74 15.5Q20.52 15.72 20.52 16.03L20.52 18.12Q20.52 19.03 19.86 19.69Q19.2 20.35 18.26 20.35L5.74 20.35Q4.82 20.35 4.15 19.69Q3.48 19.03 3.48 18.12L3.48 16.06Q3.48 15.74 3.26 15.53Q3.05 15.31 2.74 15.31Q2.42 15.31 2.21 15.53Q1.99 15.74 1.99 16.06L1.99 18.12Q1.99 19.13 2.5 19.99Q3 20.86 3.86 21.36Q4.73 21.86 5.74 21.86L18.26 21.86Q19.3 21.86 20.16 21.36Q21.02 20.86 21.53 19.99Q22.03 19.13 22.03 18.12L22.03 16.03Q22.03 15.72 21.8 15.5Q21.58 15.29 21.26 15.29Z"
    />
  </svg>
</template>

<style scoped>
.harmony-download-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
}
</style>
