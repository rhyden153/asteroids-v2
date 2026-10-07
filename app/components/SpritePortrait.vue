<script setup lang="ts">
import {
  drawModernRock,
  drawModernShip,
  drawModernUfo,
} from "../utils/sprites";

const props = defineProps<{ kind: "rock" | "ship" | "ufo"; small?: boolean }>();
const canvas = ref<HTMLCanvasElement>();
function draw() {
  const ctx = canvas.value?.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);
  if (props.kind === "rock") {
    drawModernRock(
      ctx,
      48,
      [0.85, 1.03, 0.91, 1.12, 0.79, 0.95, 1.08, 0.83, 1.04, 0.9, 1.1],
    );
  } else if (props.kind === "ship") {
    ctx.scale(2.3, 2.3);
    drawModernShip(ctx);
  } else {
    drawModernUfo(ctx, 53, props.small);
  }
  ctx.restore();
}
onMounted(draw);
watch(() => [props.kind, props.small], draw);
</script>

<template>
  <canvas
    ref="canvas"
    class="sprite-portrait"
    width="128"
    height="128"
    aria-hidden="true"
  />
</template>
