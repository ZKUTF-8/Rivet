<script setup lang="ts">
/** 页面标题区域展示所需状态。 */
defineProps<{
    /** 后端是否已连接。 */
    connected: boolean
    /** 后端是否正在连接或重连。 */
    connecting: boolean
    /** 展示给用户的连接状态文本。 */
    statusText: string
}>()

/** 页面标题区域发出的操作。 */
const emit = defineEmits<{
    /** 用户要求连接后端。 */
    connect: []
    /** 用户要求断开后端。 */
    disconnect: []
}>()
</script>

<template>
    <header class="page-header">
        <div>
            <p class="eyebrow">Rivet 业务应用验证</p>
            <h1>Mysoow.Toolkit</h1>
        </div>
        <a-space>
            <a-tag :color="connected ? 'green' : 'red'">{{ statusText }}</a-tag>
            <a-button v-if="!connected" type="primary" :loading="connecting" @click="emit('connect')">
                连接后端
            </a-button>
            <a-button v-else danger @click="emit('disconnect')">断开连接</a-button>
        </a-space>
    </header>
</template>

<style scoped>
.page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
}

.page-header h1 {
    margin: 0;
    font-size: 24px;
    line-height: 32px;
}

.eyebrow {
    margin: 0 0 4px;
    color: #667085;
    font-size: 13px;
}

@media (max-width: 900px) {
    .page-header {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>
