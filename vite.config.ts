import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyConfig = {
  '/proxy/mal': {
    target: 'https://myanimelist.net',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/mal/, ''),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  },
  '/proxy/ann': {
    target: 'https://www.animenewsnetwork.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/ann/, ''),
  },
};

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/ListTube/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase/')) return 'vendor-supabase';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: proxyConfig,
  },
  preview: {
    port: 5173,
    host: true,
    proxy: proxyConfig,
  },
});
