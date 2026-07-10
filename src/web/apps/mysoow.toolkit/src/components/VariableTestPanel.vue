<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { message as toast } from 'ant-design-vue'
import { useRivetBackend, type RivetVariableState } from '@rivet/client'

/** 变量测试面板展示所需数据。 */
const props = defineProps<{
    /** 后端是否已连接。 */
    connected: boolean
}>()

/** 当前 Vue 应用注入的 Rivet 后端运行时。 */
const backend = useRivetBackend()

/** 最近一次从后端读取到的变量快照，用于渲染变量列表。 */
const variableSnapshot = ref<Record<string, RivetVariableState>>({})

/** 动态方法列表内部使用的标准形态。 */
type ToolkitMethod = {
    /** 前后端统一方法键。 */
    key: string
    /** 显示在测试面板中的方法名。 */
    label: string
    /** 方法声明参数数量，用于决定渲染按钮还是输入框。 */
    parameters: number
    /** 生成代理里的真实调用函数。 */
    call: (...args: string[]) => Promise<unknown>
}

/** 有参数方法的输入值集合，按完整方法 key 保存。 */
const methodInputs = reactive<Record<string, string>>({})

/** 方法调用后的最近返回值集合。 */
const methodResults = reactive<Record<string, string>>({})

/** 后端 message 变量的可编辑值。 */
const messageValue = computed({
    get: () => rv.toolkit.message.value ?? '',
    set: (value: string) => {
        rv.toolkit.message.value = value
        updateLocalSnapshot('toolkit.message', value)
    },
})

/** 后端 counter 变量的可编辑值。 */
const counterValue = computed({
    get: () => rv.toolkit.counter.value ?? 0,
    set: (value: number | null) => {
        const nextValue = Number(value ?? 0)
        rv.toolkit.counter.value = nextValue
        updateLocalSnapshot('toolkit.counter', nextValue)
    },
})

/** 当前生成的 toolkit 代理对象，可能还没有包含新增的演示变量。 */
const toolkitProxy = rv.toolkit as typeof rv.toolkit & {
    /** 后端时间变量在 contract 尚未刷新时可能不存在。 */
    thisTime?: { value: string | undefined }
}

/** 后端时间变量由服务端按 RivetOptions.DateTimeFormat 格式化。 */
const thisTimeValue = computed(() => toolkitProxy.thisTime?.value ?? '')

/** 当前后端变量快照列表。 */
const variableRows = computed(() => Object.values(variableSnapshot.value))

/** 从生成代理中动态提取 toolkit 的后端方法。 */
const toolkitMethods = computed<ToolkitMethod[]>(() => Object
    .entries(toolkitProxy as Record<string, unknown>)
    .flatMap(([label, value]) => {
        if (typeof value !== 'function') return []
        const call = value as (...args: string[]) => Promise<unknown>
        return [{
            key: `toolkit.${label}`,
            label,
            parameters: call.length,
            call,
        }]
    }))

/** 不需要输入参数、可以直接点击调用的方法。 */
const parameterlessMethods = computed(() => toolkitMethods.value.filter((method) => method.parameters === 0))

/** 需要一个输入框辅助调用的方法。 */
const inputMethods = computed(() => toolkitMethods.value
    .filter((method) => method.parameters > 0)
    .map((method) => {
        methodInputs[method.key] ??= method.label === 'echo' ? '来自前端的测试值' : ''
        return method
    }))

/** 连接建立时刷新变量列表，断开时清理本地测试结果。 */
watch(
    () => props.connected,
    async (connected) => {
        if (connected) {
            await refreshSnapshot()
            return
        }

        variableSnapshot.value = {}
        for (const key of Object.keys(methodResults)) {
            delete methodResults[key]
        }
    },
    { immediate: true },
)

/** 后端主动推送时间变化时同步变量列表中的展示值。 */
watch(
    thisTimeValue,
    (value) => {
        if (!value) return
        updateLocalSnapshot('toolkit.thisTime', value)
    },
)

/** 从后端读取当前所有可绑定变量的快照。 */
async function refreshSnapshot() {
    variableSnapshot.value = await backend.runtime.getSnapshot()
}

/** 前端直接写变量后同步本地列表，避免等待下一次快照刷新。 */
function updateLocalSnapshot(name: string, value: unknown) {
    variableSnapshot.value = {
        ...variableSnapshot.value,
        [name]: {
            name,
            value,
        },
    }
}

/** 把后端原始值转换成适合表格展示的文本。 */
function formatVariableValue(record: RivetVariableState) {
    return String(record.value ?? '')
}

/** 调用一个带输入参数的后端方法并刷新变量列表。 */
async function callInputMethod(method: ToolkitMethod) {
    const result = await method.call(methodInputs[method.key] ?? '')
    methodResults[method.key] = String(result)
    await refreshSnapshot()
    toast.success(`${method.label} 已调用`)
}

/** 调用无参数后端方法并记录返回结果。 */
async function callParameterlessMethod(method: ToolkitMethod) {
    const result = await method.call()
    methodResults[method.key] = String(result)
    await refreshSnapshot()
    toast.success(`${method.label} 已调用`)
}
</script>

<template>
    <a-card title="变量和方法" :bordered="false">
        <a-space direction="vertical" size="middle" class="full-width">
            <a-alert
                type="info"
                show-icon
                message="变量可以直接编辑；无参数方法显示为按钮；有参数方法显示输入框和调用按钮。"
            />

            <a-typography-title :level="5">变量列表</a-typography-title>
            <a-table
                size="small"
                :pagination="false"
                :data-source="variableRows"
                row-key="name"
            >
                <a-table-column title="变量" data-index="name" />
                <a-table-column title="值">
                    <template #default="{ record }">
                        <a-input
                            v-if="record.name === 'toolkit.message'"
                            v-model:value="messageValue"
                            :disabled="!connected"
                        />
                        <a-input-number
                            v-else-if="record.name === 'toolkit.counter'"
                            v-model:value="counterValue"
                            :disabled="!connected"
                            class="number-input"
                        />
                        <span v-else-if="record.name === 'toolkit.thisTime'">{{ thisTimeValue }}</span>
                        <span v-else>{{ formatVariableValue(record) }}</span>
                    </template>
                </a-table-column>
            </a-table>

            <a-typography-title :level="5">方法列表</a-typography-title>
            <a-space direction="vertical" size="small" class="full-width">
                <a-space v-for="method in inputMethods" :key="method.key" wrap>
                    <a-input v-model:value="methodInputs[method.key]" class="method-input" :disabled="!connected" />
                    <a-button type="primary" :disabled="!connected" @click="callInputMethod(method)">
                        调用 {{ method.label }}(value)
                    </a-button>
                    <span class="method-result">{{ methodResults[method.key] || '暂无返回' }}</span>
                </a-space>

                <a-space v-for="method in parameterlessMethods" :key="method.key" wrap>
                    <a-button :disabled="!connected" @click="callParameterlessMethod(method)">
                        调用 {{ method.label }}()
                    </a-button>
                    <span class="method-result">{{ methodResults[method.key] || '暂无返回' }}</span>
                </a-space>
            </a-space>
        </a-space>
    </a-card>
</template>

<style scoped>
.full-width {
    width: 100%;
}

.method-input {
    width: min(360px, 100%);
}

.method-result {
    color: #667085;
}

.number-input {
    width: 160px;
}
</style>
