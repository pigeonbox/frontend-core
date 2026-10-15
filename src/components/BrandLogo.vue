<template>
  <img :src="withBase('/pigeon-glyph.png')" :alt="alt" />
</template>

<script setup lang="ts">
// 品牌图标:统一走 withBase——fnOS 统一网关(/app/pigeonbox/)等带前缀部署下,
// 模板里写死 src="/favicon.svg" 会丢前缀 404(2026-10-09 深度融合改造)。
// 贴片=透明底纯白信鸽(scripts/gen-pigeon-glyph.py 从真相源 favicon.svg 解混
// 生成,512×512 画布与原 PNG 像素对位);主题色渐变底座由各处 .logo-icon/.logo
// 容器按 --primary-color 现算(main.scss),随颜色主题选择器联动。favicon.svg
// 本体仍是浏览器标签页等静态场景的品牌真相源,不随主题。
import { withBase } from '@/utils/base'

withDefaults(defineProps<{ alt?: string }>(), { alt: 'PigeonBox' })
</script>
