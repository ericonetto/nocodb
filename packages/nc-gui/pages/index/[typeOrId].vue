<script lang="ts" setup>
const route = useRoute()
</script>

<template>
  <div>
    <NuxtPage :transition="false" :page-key="route.params.typeOrId" />
  </div>
</template>
