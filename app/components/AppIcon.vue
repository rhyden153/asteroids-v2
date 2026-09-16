<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
  shield: "M12 2 21 6V12C21 17 17 20 12 22C7 20 3 17 3 12V6Z M8 12 11 15 16 9",
  hyperspace: "M4 6H10 M2 12H7 M4 18H10 M13 3 21 12 13 21 M9 6 15 12 9 18",
  ufo: "M2 13 7 9 9 5H15L17 9 22 13 17 17H7Z M2 13H22 M7 9H17",
  asteroid:
    "M8 2 15 3 21 8 20 15 15 21 7 20 2 14 3 7Z M8 2 9 8 3 7 M9 8 15 11 21 8 M15 11 13 17 15 21 M13 17 7 20",
  ship: "M12 2 21 21 12 17 3 21Z M12 17V11",
  trophy:
    "M7 3H17V10A5 5 0 0 1 7 10Z M7 5H3V8A4 4 0 0 0 7 12 M17 5H21V8A4 4 0 0 1 17 12 M12 15V20 M8 21H16",
  info: "M12 11V17 M12 7V7.1 M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12",
  play: "M8 4 20 12 8 20Z",
  pause: "M8 5V19 M16 5V19",
  sound:
    "M11 4 5 9H2V15H5L11 20Z M15 8A6 6 0 0 1 15 16 M18 4A11 11 0 0 1 18 20",
  muted: "M11 4 5 9H2V15H5L11 20Z M16 9 22 15 M22 9 16 15",
  fullscreen: "M8 3H3V8 M16 3H21V8 M3 16V21H8 M16 21H21V16",
  bolt: "M13 2 5 14H11L10 22 19 9H12Z",
  crosshair:
    "M12 2V6 M12 18V22 M2 12H6 M18 12H22 M19 12A7 7 0 1 1 5 12A7 7 0 1 1 19 12 M12 10V14 M10 12H14",
  spark: "M12 2 14 9 21 12 14 14 12 22 10 14 3 12 10 9Z",
  restart: "M3 10A9 9 0 1 1 5 19 M3 3V10H10",
};
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.spark" />
  </svg>
</template>
