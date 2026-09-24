import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/theme-chalk/dark/css-vars.css' // Import dark mode styles
import 'github-markdown-css/github-markdown.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// Element Plus 走按需引入（见 vite.config.ts 的 ElementPlusResolver）：
// 模板里的 el-* 组件和指令会自动带上样式，但「程序式调用」的几个组件要手动引样式
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/el-overlay.css'
import App from './App.vue'
import router from './router'
import './style.css'
import { connectWS } from './services/ws'

connectWS()

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)

app.mount('#app')
