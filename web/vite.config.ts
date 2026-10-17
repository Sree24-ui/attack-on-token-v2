import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// V2-specific ports: 5180 (web) / 5179 (api) so V1 can run side by side.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:5179', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
})
