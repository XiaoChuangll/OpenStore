/**
 * 关于页面的默认展示内容。
 *
 * 建库种子、后台「恢复默认」和前端兜底都以这份为准：
 *   techStack     技术栈标签，color 对应 Element Plus 的标签色（primary/success/warning/danger/info）
 *   socialLinks   作者的联系我们，icon 是前端图标名（见 src/utils/about.ts 的映射表）
 *   contributors  鸣谢名单，github 存的是 GitHub 用户名（头像由前端按用户名拼地址取）
 *
 * 三者都以 JSON 字符串存在 about_page 表里，改这里的默认值不会覆盖后台已经保存过的内容。
 */
const DEFAULT_TECH_STACK = [
  { name: 'Vue 3', color: 'success' },
  { name: 'TypeScript', color: 'primary' },
  { name: 'Vite', color: 'warning' },
  { name: 'Element Plus', color: 'primary' },
  { name: 'Pinia', color: 'warning' },
  { name: 'Apache ECharts', color: 'danger' },
  { name: 'Node.js', color: 'success' },
  { name: 'Express', color: 'info' },
  { name: 'SQLite', color: 'info' },
];

const DEFAULT_SOCIAL_LINKS = [
  { label: 'GitHub', url: 'https://github.com/XiaoChuangll', icon: 'github' },
];

/** 鸣谢名单默认留空：名单是站点自己的事，塞默认值反而会让别的部署多出不相干的人 */
const DEFAULT_CONTRIBUTORS = [];

module.exports = { DEFAULT_TECH_STACK, DEFAULT_SOCIAL_LINKS, DEFAULT_CONTRIBUTORS };
