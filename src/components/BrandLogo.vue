<template>
  <img :src="withBase('/favicon.svg')" :alt="alt" />
</template>

<script setup lang="ts">
// 品牌图标:统一走 withBase——fnOS 统一网关(/app/pigeonbox/)等带前缀部署下,
// 模板里写死 src="/favicon.svg" 会丢前缀 404(2026-10-09 深度融合改造)。
import { withBase } from '@/utils/base'

withDefaults(defineProps<{ alt?: string }>(), { alt: 'PigeonBox' })
</script>
