<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
const unused: any = 1;
if (count.value == 1) {
  debugger;
}
</script>

<template>
  <button @click="count++">{{ count == 2 ? 'two' : count }}</button>
</template>
