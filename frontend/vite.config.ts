import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        generator: fileURLToPath(new URL('./index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./gallery.html', import.meta.url)),
        knowledge: fileURLToPath(new URL('./knowledge.html', import.meta.url)),
        blob: fileURLToPath(new URL('./blob.html', import.meta.url)),
      },
    },
  },
});
