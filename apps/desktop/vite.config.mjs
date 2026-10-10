import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { desktopBridge } from './scripts/dev-bridge.mjs'
import { connectionDefaultsPlugin } from './scripts/connection-defaults.mjs'
import { desktopDevelopmentServer } from './scripts/development-server.mjs'

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), tailwindcss(), desktopBridge(), connectionDefaultsPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      // Exercise a locally built ChatKit before its next package release.
      ...(process.env.XPERT_DESKTOP_CHATKIT_BUNDLE
        ? [{ find: '@xpert-ai/chatkit-web-component', replacement: resolve(process.env.XPERT_DESKTOP_CHATKIT_BUNDLE) }]
        : []),
      {
        find: '@xpert-ai/shadcn-ui/styles.css',
        replacement: fileURLToPath(new URL('../../packages/shadcn-ui/src/styles.css', import.meta.url))
      },
      { find: '@xpert-ai/shadcn-ui', replacement: fileURLToPath(new URL('./src/ui.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('../../packages/shadcn-ui/src', import.meta.url)) }
    ]
  },
  server: command === 'serve' ? desktopDevelopmentServer() : undefined,
  optimizeDeps: { include: ['@xpert-ai/desktop-protocol'] },
  build: { outDir: 'dist', commonjsOptions: { include: [/node_modules/, /packages\/desktop-protocol/] } }
}))
