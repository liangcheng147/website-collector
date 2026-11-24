<script setup lang="ts">
import { ref, watch } from 'vue'
import { faviconDataUrl } from '../composables/useFavicon'

const props = defineProps<{ path?: string | null }>()
const src = ref<string | null>(null)

watch(
  () => props.path,
  async (path) => {
    src.value = null
    if (!path) return
    src.value = await faviconDataUrl(path)
  },
  { immediate: true },
)
</script>

<template>
  <img v-if="src" class="site-favicon" :src="src" alt="" data-testid="site-favicon" />
  <span v-else class="site-favicon site-favicon-placeholder" data-testid="site-favicon-placeholder" aria-hidden="true"></span>
</template>

<style scoped>
.site-favicon {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  object-fit: contain;
  flex: none;
}

.site-favicon-placeholder {
  display: inline-block;
  background: var(--border-2);
}
</style>
