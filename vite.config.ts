import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { compression } from 'vite-plugin-compression2'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/**
 * KaTeX 的样式表给每个字体都列了 woff2 / woff / ttf 三种格式，
 * Vite 会把这三种文件全部复制进 dist（20 个字重 × 3 = 60 个字体文件，约 800KB）。
 * 现在能跑这个后台的浏览器都支持 woff2，这里把另外两种从 src 里去掉，
 * 只留 woff2，dist 里就只剩 20 个字体文件。
 */
function katexWoff2Only(): Plugin {
  const WASTE_FORMATS = [
    /,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g,
    /,\s*url\([^)]*\.ttf\)\s*format\(['"]truetype['"]\)/g
  ]

  return {
    name: 'openstore:katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/katex[\\/]dist[\\/]katex(\.min)?\.css$/.test(id)) return null
      let out = code
      let removed = 0
      for (const pattern of WASTE_FORMATS) {
        out = out.replace(pattern, () => {
          removed += 1
          return ''
        })
      }
      if (!removed) {
        this.warn('KaTeX 样式里没匹配到 woff/ttf 字体源，检查一下 katex 版本是否换了写法')
        return null
      }
      return out
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      vue(),
      katexWoff2Only(),
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
      /*
       * 预压缩旁文件，配合 nginx 的 gzip_static 直接发 .gz，省 CPU 又省带宽。
       *
       * 注意 vite-plugin-compression2 v2 的参数名是 algorithms（复数）：
       * 之前写的 algorithm: 'gzip' 被插件忽略，它按默认值 ["gzip","brotliCompress"]
       * 同时生成了 .gz 和 .br。而服务器上的 brotli_static 一直是注释状态
       * （需要 nginx 自己编译 ngx_brotli），.br 从来没被发出去过，
       * dist 里因此白白多了一半文件（147 个 .br、1.2MB）。这里显式只留 gzip。
       *
       * 哪天服务器真的开了 brotli_static，把 algorithms 改成
       * ['gzip','brotliCompress'] 即可（.br 体积比 .gz 还小一点）。
       */
      compression({
        include: [/\.js$/, /\.css$/, /\.html$/, /\.json$/, /\.xml$/, /\.svg$/],
        threshold: 1024, // 只压 1KB 以上的文件
        algorithms: ['gzip'],
      }),
    ],
    test: {
      environment: 'jsdom',
      // 内联 element-plus：否则 vitest 把它交给 Node 加载，撞上它按需导入的 .css 会报错
      server: {
        deps: {
          inline: ['element-plus'],
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          /*
           * 拆出来的碎片 chunk 太多（100 多个，其中一堆只有几百字节~1KB，
           * 每个都要单独发一个请求、还要多一个 .gz 旁文件）。
           * 让 Rollup 把这类小 chunk 合并回引用它们的 chunk，文件数直接降下来。
           */
          experimentalMinChunkSize: 30 * 1024,
        },
      },
    },
    /*
     * 这里曾经是 define: { 'process.env': env }。
     * loadEnv 的第三个参数是空前缀，等于把整个进程环境变量都塞进来（连 Windows 的 Path 都在内），
     * 再整体替换掉客户端代码里的 process.env。实测只要有人写下 process.env[key] 这种动态访问，
     * 打包产物里就会带出 .env 的全部密钥（ADMIN_PASSWORD / JWT_SECRET / VUE_APP_API_KEY）
     * 以及整台机器的环境变量，访客下载 js 就能读到。
     * 客户端要读公开配置请用 import.meta.env.VITE_XXX（Vite 只会暴露 VITE_ 前缀），不要再恢复这段 define。
     */
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
