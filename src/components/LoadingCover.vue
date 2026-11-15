<template>
  <div class="px-4 py-6" role="status">
    <p class="mb-4 text-sm text-muted-foreground">
      正在连接监控服务…
    </p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]" aria-hidden="true">
      <div v-for="index in 4" :key="index" class="min-h-40 rounded-md border border-border/70 bg-background/65 p-4">
        <div class="mb-5 h-4 w-2/5 rounded bg-muted" />
        <div class="mb-3 h-2 w-full rounded bg-muted" />
        <div class="h-2 w-3/4 rounded bg-muted" />
      </div>
    </div>
  </div>
</template>
