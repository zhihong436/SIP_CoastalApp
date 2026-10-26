import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// spike.html is a second entry so the camera spike ships beside the app without sharing its routes.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        spike: 'spike.html',
      },
    },
  },
})
