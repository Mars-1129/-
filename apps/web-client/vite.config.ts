import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

// 开发模式下清除 PWA service worker 缓存，避免代码改动不生效
const devSwCleanup: Plugin = {
  name: 'dev-sw-cleanup',
  transformIndexHtml: {
    order: 'post',
    handler: () => [
      {
        tag: 'script',
        children: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(regs) {
              regs.forEach(function(r) { r.unregister(); });
            });
          }
        `,
        injectTo: 'head',
      },
    ],
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'production'
      ? [VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon-192.png', 'icon-512.png'],
          manifest: {
            name: 'TikStream AI',
            short_name: 'TikStream',
            description: '短视频智能创作工作台',
            theme_color: '#020617',
            background_color: '#020617',
            display: 'standalone',
            orientation: 'portrait',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https?:\/\/.*\/api\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
                },
              },
            ],
          },
        })]
      : [devSwCleanup]),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker 端口映射时，动态 import 会使用默认 origin (localhost:5173)
    // 设置 VITE_DEV_ORIGIN 为外部访问地址以避免模块加载失败
    ...(process.env.VITE_DEV_ORIGIN ? { origin: process.env.VITE_DEV_ORIGIN } : {}),
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/artifacts': {
        target: process.env.VITE_ARTIFACT_PROXY_TARGET || 'http://localhost:3102',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_PROXY_TARGET || process.env.VITE_API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // SSE 长连接：保持连接活跃，避免代理层超时断开
            if (req.url?.includes('/events')) {
              proxyReq.setHeader('Connection', 'keep-alive');
              proxyReq.setHeader('Cache-Control', 'no-cache');
            }
          });
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/artifacts': {
        target: process.env.VITE_ARTIFACT_PROXY_TARGET || 'http://localhost:3102',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://server-gateway:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                message: '网关暂时不可用，请稍后重试',
                error: { code: 'GATEWAY_UNAVAILABLE', retryable: true },
              }));
            }
          });
        },
      },
    },
  },
}));
