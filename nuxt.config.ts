// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@vercel/analytics'],
  devtools: { enabled: false },
  extends: ['github:rhyden153/neogames-ui'],
  compatibilityDate: '2026-10-13'
});
npm 