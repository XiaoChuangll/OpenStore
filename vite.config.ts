import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { compression } from 'vite-plugin-compression2'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      vue(),
      // Element Plus 按需引入：只把模板里真正用到的组件及其样式打进包。
      // 之前是全量 import，入口包里塞了 ~1MB JS + 400KB CSS。
      Components({
        resolvers: [ElementPlusResolver({ importStyle: 'css' })],
        // v-loading 这类指令也要按需引入，否则会报 "Failed to resolve directive: loading"
        directives: true,
        dts: false,
        // 自己 import 的组件（图标等）不重复生成
        dirs: ['src/components']
      }),
      compression({
        include: [/\.js$/, /\.css$/, /\.html$/, /\.json$/, /\.xml$/, /\.svg$/],
        threshold: 1024, // Only compress files larger than 1KB
        algorithm: 'gzip',
        ext: '.gz',
      }),
      compression({
        include: [/\.js$/, /\.css$/, /\.html$/, /\.json$/, /\.xml$/, /\.svg$/],
        threshold: 1024, // Only compress files larger than 1KB
        algorithm: 'brotliCompress',
        ext: '.br',
      }),
    ],
    test: {
      environment: 'jsdom',
    },
    define: {
      'process.env': env
    },
    server: {
      proxy: {
        '/api/v0': {
          // 走本地 Node 代理（而不是直连上游）：
          // 这样后端能看到并记录每一次上游调用（UA 透传、限流、实时日志都在 Node 侧）
          target: `http://localhost:${env.PORT || 3001}`,
          changeOrigin: true,
        },
        '/api': {
          target: `http://localhost:${env.PORT || 3001}`,
          changeOrigin: true,
        },
        '/next-api': {
          target: env.VITE_NEXT_API_TARGET || 'https://next.vcck.cn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/next-api/, '/api'),
        },
        '/uploads': {
          target: `http://localhost:${env.PORT || 3001}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `http://localhost:${env.PORT || 3001}`,
          ws: true,
          changeOrigin: true,
        }
      }
    }
  }
})
