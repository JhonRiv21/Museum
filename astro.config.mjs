import { defineConfig } from "astro/config";

export default defineConfig({
  // Sitio estático puro: sin adaptadores ni SSR.
  vite: {
    build: {
      rolldownOptions: { output: { comments: { legal: true } } },
    },
  },
});
