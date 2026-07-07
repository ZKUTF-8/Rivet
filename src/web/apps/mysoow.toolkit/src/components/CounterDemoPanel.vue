<script setup lang="ts">
import { computed } from 'vue'
import { message as toast } from 'ant-design-vue'

/** 计数器演示面板展示所需数据。 */
defineProps<{
    /** 后端是否已连接。 */
    connected: boolean
}>()

/** 后端计数器当前值。 */
const counter = computed(() => rv.toolkit.counter.value ?? 0)

/** 通过前端直接写绑定变量验证双向同步。 */
function incrementByVariable() {
    rv.toolkit.counter.value = counter.value + 1
    toast.success('已通过前端直接写变量 +1')
}

/** 通过后端方法修改变量，验证服务端主动推送。 */
async function incrementByMethod() {
    await rv.toolkit.incrementCounter()
    toast.success('已调用后端方法 +1')
}
</script>

<template>
    <a-card title="计数器验证" :bordered="false">
        <a-space direction="vertical" size="middle" class="full-width">
            <a-statistic title="toolkit.counter" :value="counter" />
            <a-space wrap>
                <a-button type="primary" :disabled="!connected" @click="incrementByVariable">
                    直接写变量 +1
                </a-button>
                <a-button :disabled="!connected" @click="incrementByMethod">
                    调后端方法 +1
                </a-button>
            </a-space>
        </a-space>
    </a-card>
</template>

<style scoped>
.full-width {
    width: 100%;
}
</style>
