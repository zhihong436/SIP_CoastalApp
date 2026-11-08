import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app and the printable card are the only production entries. The retired standalone experiment
// pages are no longer built.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        card: 'card.html',
      },
    },
  },
})
