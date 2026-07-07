<script setup lang="ts">
import { computed } from 'vue'
import { useRivetBackend } from '@rivet/client'
import CounterDemoPanel from './components/CounterDemoPanel.vue'
import ToolkitHeader from './components/ToolkitHeader.vue'
import VariableTestPanel from './components/VariableTestPanel.vue'

/** 当前 Vue 应用注入的 Rivet 后端运行时。 */
const backend = useRivetBackend()

/** 后端 Bridge 当前是否处于已连接状态。 */
const connected = computed(() => backend.runtime.status.value === 'connected')

/** 后端 Bridge 是否正在初次连接或自动重连。 */
const connecting = computed(() => backend.runtime.status.value === 'connecting' || backend.runtime.status.value === 'reconnecting')

/** 页面标题区展示的连接状态文案。 */
const statusText = computed(() => {
    if (backend.runtime.status.value === 'connecting') return '连接中'
    if (backend.runtime.status.value === 'reconnecting') return '重连中'
    return connected.value ? '已连接' : '未连接'
})

/** 用户手动要求建立 Bridge 连接。 */
async function connect() {
    await backend.runtime.start()
}

/** 用户手动要求断开 Bridge 连接。 */
async function disconnect() {
    await backend.runtime.stop()
}
</script>

<template>
    <a-config-provider>
        <main class="toolkit-page">
            <ToolkitHeader
                :connected="connected"
                :connecting="connecting"
                :status-text="statusText"
                @connect="connect"
                @disconnect="disconnect"
            />

            <section class="content-grid">
                <VariableTestPanel :connected="connected" />

                <CounterDemoPanel :connected="connected" />
            </section>
        </main>
    </a-config-provider>
</template>

<style scoped>
.toolkit-page {
    min-height: 100vh;
    padding: 24px;
    background: #f5f7fb;
}

.content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    gap: 16px;
}

@media (max-width: 900px) {
    .toolkit-page {
        padding: 16px;
    }

    .content-grid {
        grid-template-columns: 1fr;
    }
}
</style>
