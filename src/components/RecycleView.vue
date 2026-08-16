<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <div>
    <div class="batchbar">
      <b>回收站 · {{ store.trashedSites.length }} 项</b>
      <button class="btn danger" style="margin-left:auto" @click="store.emptyRecycle()">清空回收站</button>
    </div>
    <table class="site-table">
      <thead><tr><th>名称</th><th>链接</th><th>删除时间</th><th></th></tr></thead>
      <tbody>
        <tr v-for="t in store.trashedSites" :key="t.site.id">
          <td>{{ t.site.name }}</td>
          <td class="muted">{{ t.site.url }}</td>
          <td class="muted">{{ t.deletedAt.slice(0, 10) }}</td>
          <td>
            <button class="btn" @click="store.restoreSite(t.site.id)">恢复</button>
            <button class="btn danger" @click="store.permanentlyDelete(t.site.id)">彻底删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="store.trashedSites.length === 0" class="empty">回收站为空</div>
  </div>
</template>