# 全局样式说明

所有**跨页面**的样式都集中在这个目录，入口是 `src/style.css`（只做 `@import`，不写规则）。
组件**自己**的外观留在组件的 `<style scoped>` 里，不要往这里塞。

## 目录结构

| 文件 | 放什么 |
| --- | --- |
| `tokens.css` | 设计令牌：主色/语义色、中性色阶、圆角、阴影、控件高度。改主题先改这里 |
| `base.css` | 基础重置：`body`、字体平滑、滚动条隐藏、焦点环、点击高亮 |
| `element-plus.css` | Element Plus 组件皮肤：表单、按钮、表格、分页、标签、折叠、通知等 |
| `app.css` | 应用级形态：表格操作列、ECharts 浮层、拖拽状态等跨页面复用的类 |

引入顺序（`src/style.css`）：`base` → `tokens` → `element-plus` → `app`。

## 约定

1. **颜色/圆角/阴影一律走变量**，变量定义在 `tokens.css` 的 `:root`，深色值在 `html.dark`。
   不要在组件或本目录里写死 `#2563eb` 这类具体色值。
2. **覆盖 Element Plus 的选择器带 `html` 前缀**，例如 `html .el-button { ... }`。
   组件库样式是运行时注入的，前缀能稳定压过默认样式，避免靠加载顺序碰运气。
3. **只影响单个组件**的样式写在该组件的 `<style scoped>`；本目录只放跨页面复用的规则。
4. 需要给某一类控件换形态时，优先在这里加一条**收窄到具体变体**的规则
   （如 `html .el-button.is-link:has(> span)`），而不是在页面里逐个加 class。

## 新增样式放哪里？

- 新的主题配色 / 圆角 / 间距 → `tokens.css`
- 调整某个 Element Plus 组件在全站的样子 → `element-plus.css`
- 跨多个页面复用的布局或工具类 → `app.css`
- 只属于某个页面 / 组件 → 对应 `.vue` 的 `<style scoped>`

## 后台的共享组件

后台里反复出现的结构优先抽成组件，放在 `src/components/admin/`：

- `AdminPageHeader.vue` —— 后台子页面标题栏（返回箭头 + 标题）。嵌进后台面板
  （`embedded`）时不渲染；返回行为统一收在组件里（回后台首页，可用 `back-to` 覆盖）。
- `AdminSection.vue` —— 「分区卡片」（标题行 + 说明标签 + 右侧操作 + 内容）。
  `variant="plain"` 用于并排的小卡片（不带分隔线），`head-wrap` 让标题行允许换行。
  目前首页配置、系统日志、故障维护、公告管理、文章管理、主题设置、关于页面都用它。

加新页面时优先复用这些组件，不要重新手写一套 `.section-card` / `.section-head`，
也不要再各自写 `<el-page-header>` + `goBack`。
