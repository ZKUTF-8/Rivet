<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { message as toast } from 'ant-design-vue'
import { useRivetBackend } from '@rivet/client'

interface RivetVariableState {
    name?: string
    Name?: string
    value?: unknown
    Value?: unknown
    type?: string
    Type?: string
    updatedAt?: number
    UpdatedAt?: number
}

interface RivetMethodResult {
    success?: boolean
    Success?: boolean
    value?: unknown
    Value?: unknown
    error?: string
    Error?: string
}

const backend = useRivetBackend()
const connection = backend.connection.connection

const connected = ref(false)
const connecting = ref(false)
const inputValue = ref('来自前端的测试值')
const serverMessage = ref('等待连接后读取后端变量')
const lastResult = ref('')
const variableSnapshot = ref<Record<string, RivetVariableState>>({})

const statusText = computed(() => {
    if (connecting.value) return '连接中'
    return connected.value ? '已连接' : '未连接'
})

function normalizeState(raw: RivetVariableState): RivetVariableState {
    return {
        name: raw.name ?? raw.Name,
        value: raw.value ?? raw.Value,
        type: raw.type ?? raw.Type,
        updatedAt: raw.updatedAt ?? raw.UpdatedAt,
    }
}

function applySnapshot(raw: Record<string, RivetVariableState>) {
    const next: Record<string, RivetVariableState> = {}

    for (const [key, value] of Object.entries(raw ?? {})) {
        next[key] = normalizeState(value)
    }

    variableSnapshot.value = next
    const messageState = next.message
    if (messageState) {
        serverMessage.value = String(messageState.value ?? '')
    }
}

function applyVariable(raw: RivetVariableState) {
    const state = normalizeState(raw)
    if (!state.name) return

    variableSnapshot.value = {
        ...variableSnapshot.value,
        [state.name]: state,
    }

    if (state.name === 'message') {
        serverMessage.value = String(state.value ?? '')
    }
}

connection.on('RivetInitialState', applySnapshot)
connection.on('RivetSnapshot', applySnapshot)
connection.on('RivetVariableChanged', applyVariable)

async function connect() {
    connecting.value = true
    try {
        await backend.connection.start()
        connected.value = true
        const snapshot = await connection.invoke<Record<string, RivetVariableState>>('GetSnapshot')
        applySnapshot(snapshot)
    } finally {
        connecting.value = false
    }
}

async function disconnect() {
    await backend.connection.stop()
    connected.value = false
}

async function writeVariable() {
    const state = await connection.invoke<RivetVariableState>('SetVariable', 'message', inputValue.value)
    applyVariable(state)
    toast.success('变量已写入后端')
}

async function echoByBackend() {
    const result = await connection.invoke<RivetMethodResult>('InvokeMethod', 'echo', inputValue.value)
    applyMethodResult(result)
}

async function updateByBackend() {
    const result = await connection.invoke<RivetMethodResult>('InvokeMethod', 'updateMessage', null)
    applyMethodResult(result)
}

function applyMethodResult(result: RivetMethodResult) {
    const success = result.success ?? result.Success
    const value = result.value ?? result.Value
    const error = result.error ?? result.Error

    if (!success) {
        toast.error(error ?? '后端方法调用失败')
        return
    }

    lastResult.value = String(value ?? '')
    if (value !== undefined && value !== null) {
        serverMessage.value = String(value)
    }
}

onUnmounted(() => {
    connection.off('RivetInitialState', applySnapshot)
    connection.off('RivetSnapshot', applySnapshot)
    connection.off('RivetVariableChanged', applyVariable)
    void disconnect()
})
</script>

<template>
    <a-config-provider>
        <main class="toolkit-page">
            <header class="page-header">
                <div>
                    <p class="eyebrow">Rivet 业务应用验证</p>
                    <h1>Mysoow.Toolkit</h1>
                </div>
                <a-space>
                    <a-tag :color="connected ? 'green' : 'red'">{{ statusText }}</a-tag>
                    <a-button v-if="!connected" type="primary" :loading="connecting" @click="connect">
                        连接后端
                    </a-button>
                    <a-button v-else danger @click="disconnect">断开连接</a-button>
                </a-space>
            </header>

            <section class="content-grid">
                <a-card title="变量验证" :bordered="false">
                    <a-space direction="vertical" size="middle" class="full-width">
                        <a-alert
                            type="info"
                            show-icon
                            message="应用层只调用 @rivet/client；后端通信宿主由 Rivet.Core 内部处理。"
                        />

                        <a-form layout="vertical">
                            <a-form-item label="前端输入值">
                                <a-input v-model:value="inputValue" placeholder="输入要发送给后端的内容" />
                            </a-form-item>
                        </a-form>

                        <a-space wrap>
                            <a-button type="primary" :disabled="!connected" @click="writeVariable">
                                写入 message 变量
                            </a-button>
                            <a-button :disabled="!connected" @click="echoByBackend">
                                调用 echo 方法
                            </a-button>
                            <a-button :disabled="!connected" @click="updateByBackend">
                                后端按钮更新
                            </a-button>
                        </a-space>
                    </a-space>
                </a-card>

                <a-card title="后端状态" :bordered="false">
                    <a-descriptions :column="1" bordered size="small">
                        <a-descriptions-item label="message">
                            {{ serverMessage }}
                        </a-descriptions-item>
                        <a-descriptions-item label="最后方法返回">
                            {{ lastResult || '暂无' }}
                        </a-descriptions-item>
                        <a-descriptions-item label="变量数量">
                            {{ Object.keys(variableSnapshot).length }}
                        </a-descriptions-item>
                    </a-descriptions>
                </a-card>
            </section>

            <a-card title="变量快照" :bordered="false">
                <a-table
                    size="small"
                    :pagination="false"
                    :data-source="Object.values(variableSnapshot)"
                    :columns="[
                        { title: '变量', dataIndex: 'name' },
                        { title: '类型', dataIndex: 'type' },
                        { title: '当前值', dataIndex: 'value' },
                        { title: '更新时间', dataIndex: 'updatedAt' },
                    ]"
                    row-key="name"
                />
            </a-card>
        </main>
    </a-config-provider>
</template>

<style scoped>
.toolkit-page {
    min-height: 100vh;
    padding: 24px;
    background: #f5f7fb;
}

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

.content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    gap: 16px;
    margin-bottom: 16px;
}

.full-width {
    width: 100%;
}

@media (max-width: 900px) {
    .toolkit-page {
        padding: 16px;
    }

    .page-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .content-grid {
        grid-template-columns: 1fr;
    }
}
</style>
