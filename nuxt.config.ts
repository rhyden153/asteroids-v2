// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@vercel/analytics'],
  devtools: { enabled: false },
  extends: ['github:rhyden153/neogames-ui'],
  runtimeConfig: {
    leaderboard: { redisUrlEnv: 'ASTEROIDS_SCORES_REDIS_URL' },
    public: { leaderboard: { game: 'asteroids' } },
  },
  compatibilityDate: '2026-10-13'
});