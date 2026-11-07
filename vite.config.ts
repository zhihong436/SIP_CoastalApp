import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The experiment pages are separate entries so they do not share the app's routes or lifecycle.
// spike.html is a second entry so the camera spike ships beside the app without sharing its routes.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        spike: 'spike.html',
        ar: 'ar.html',
        card: 'card.html',
        diorama: 'diorama.html',
      },
    },
  },
})
