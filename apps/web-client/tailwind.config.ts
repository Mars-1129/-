import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      colors: {
        // 旧 token（保持兼容）
        ink: '#111827',
        panel: '#f8fafc',

        // ================================================================
        // 语义化暗色主题设计令牌
        // ================================================================
        surface: {
          primary: '#020617',   // 页面底色 (slate-950)
          secondary: '#0f172a', // Card / 容器底色 (slate-900)
          elevated: '#1e293b',  // hover / 浮层底色 (slate-800)
        },
        border: {
          DEFAULT: '#1e293b',    // 默认边框 (slate-800)
          subtle: '#334155',    // 弱边框 (slate-700)
        },
        // 文本层级
        'text-primary': '#f1f5f9',    // slate-100
        'text-secondary': '#94a3b8',  // slate-400
        'text-muted': '#64748b',      // slate-500

        // 语义色（暗色友好）
        accent: {
          DEFAULT: '#06b6d4',  // cyan-500
          hover: '#22d3ee',   // cyan-400
          muted: '#06b6d420', // cyan-500/12
        },
        success: {
          DEFAULT: '#10b981',   // emerald-500
          muted: '#10b98120',   // emerald-500/12
          text: '#6ee7b7',      // emerald-300
        },
        warning: {
          DEFAULT: '#f59e0b',  // amber-500
          muted: '#f59e0b20',  // amber-500/12
          text: '#fcd34d',     // amber-300
        },
        destructive: {
          DEFAULT: '#f43f5e',  // rose-500
          muted: '#f43f5e20',  // rose-500/12
          text: '#fda4af',     // rose-300
        },
        info: {
          DEFAULT: '#0ea5e9',  // sky-500
          muted: '#0ea5e920',  // sky-500/12
          text: '#7dd3fc',     // sky-300
        },

        // ================================================================
        // 模块主题色 — 为不同功能区域提供微妙区分
        // 用法示例: bg-module-materials/10 border-module-materials/30
        // ================================================================
        module: {
          materials: '#3b82f6',   // blue-500   — 素材管理
          scripts: '#8b5cf6',     // violet-500 — 剧本生成
          create: '#06b6d4',      // cyan-500   — 视频创作
          tasks: '#10b981',       // emerald-500 — 任务管理
          analytics: '#f59e0b',   // amber-500  — 数据分析
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
