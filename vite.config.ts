import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { compression } from 'vite-plugin-compression2'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      vue(),
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
          target: env.VITE_API_TARGET || 'http://shenjack.top:10003',
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
