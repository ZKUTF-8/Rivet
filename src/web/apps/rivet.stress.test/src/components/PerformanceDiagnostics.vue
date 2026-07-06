<script setup lang="ts">
import { computed, ref } from 'vue'

interface DiagnosticsConnection {
    invoke<T = unknown>(methodName: string, ...args: unknown[]): Promise<T>
}

const props = defineProps<{
    connected: boolean
    connection: DiagnosticsConnection | null
}>()

const currentTime = ref('')
const loadingTime = ref(false)
const testingLatency = ref(false)
const testingThroughput = ref(false)
const testingConcurrent = ref(false)
const testingBandwidth = ref(false)
const errorMessage = ref('')

const latencyResult = ref<{
    latest: number
    average: number
    min: number
    max: number
} | null>(null)

const throughputResult = ref<{
    totalCalls: number
    qps: number
    duration: number
} | null>(null)

const concurrentResult = ref<{
    totalCalls: number
    qps: number
    duration: number
} | null>(null)

const bandwidthResult = ref<{
    dataSize: number
    receivedSize: number
    duration: number
    speedMBps: number
} | null>(null)

const busy = computed(() =>
    loadingTime.value
    || testingLatency.value
    || testingThroughput.value
    || testingConcurrent.value
    || testingBandwidth.value
)

const canRun = computed(() => props.connected && props.connection && !busy.value)

async function getCurrentTime() {
    if (!props.connection) return
    loadingTime.value = true
    errorMessage.value = ''
    try {
        currentTime.value = await props.connection.invoke<string>('GetCurrentTime')
    } catch (err) {
        errorMessage.value = formatError(err)
    } finally {
        loadingTime.value = false
    }
}

async function testLatency() {
    if (!props.connection) return
    testingLatency.value = true
    errorMessage.value = ''
    const latencies: number[] = []
    try {
        for (let i = 0; i < 10; i++) {
            const startedAt = performance.now()
            await props.connection.invoke<number>('PingTest', startedAt)
            latencies.push(round(performance.now() - startedAt, 3))
            if (i < 9) {
                await sleep(100)
            }
        }

        const sum = latencies.reduce((total, value) => total + value, 0)
        latencyResult.value = {
            latest: latencies[latencies.length - 1] ?? 0,
            average: round(sum / latencies.length, 3),
            min: Math.min(...latencies),
            max: Math.max(...latencies),
        }
    } catch (err) {
        errorMessage.value = formatError(err)
    } finally {
        testingLatency.value = false
    }
}

async function testThroughput() {
    if (!props.connection) return
    testingThroughput.value = true
    errorMessage.value = ''
    let totalCalls = 0
    const testDuration = 5000

    try {
        const startedAt = performance.now()
        const endAt = startedAt + testDuration
        while (performance.now() < endAt) {
            await props.connection.invoke<boolean>('ThroughputTest')
            totalCalls++
        }

        const duration = round((performance.now() - startedAt) / 1000, 2)
        throughputResult.value = {
            totalCalls,
            qps: round(totalCalls / duration, 2),
            duration,
        }
    } catch (err) {
        errorMessage.value = formatError(err)
    } finally {
        testingThroughput.value = false
    }
}

async function testConcurrent() {
    if (!props.connection) return
    testingConcurrent.value = true
    errorMessage.value = ''
    const concurrentCount = 50000
    const batchSize = 500

    try {
        const startedAt = performance.now()
        let completed = 0
        while (completed < concurrentCount) {
            const currentBatchSize = Math.min(batchSize, concurrentCount - completed)
            const calls: Promise<boolean>[] = []
            for (let i = 0; i < currentBatchSize; i++) {
                calls.push(props.connection.invoke<boolean>('ThroughputTest'))
            }
            await Promise.all(calls)
            completed += currentBatchSize
        }

        const duration = round((performance.now() - startedAt) / 1000, 2)
        concurrentResult.value = {
            totalCalls: concurrentCount,
            qps: round(concurrentCount / duration, 2),
            duration,
        }
    } catch (err) {
        errorMessage.value = formatError(err)
    } finally {
        testingConcurrent.value = false
    }
}

async function testBandwidth() {
    if (!props.connection) return
    testingBandwidth.value = true
    errorMessage.value = ''
    const dataSize = 100

    try {
        const startedAt = performance.now()
        const data = await props.connection.invoke<unknown>('BandwidthTest', dataSize)
        const receivedSize = round(getReceivedSizeInMB(data), 2)
        const duration = round((performance.now() - startedAt) / 1000, 2)
        bandwidthResult.value = {
            dataSize,
            receivedSize,
            duration,
            speedMBps: round(receivedSize / duration, 2),
        }
    } catch (err) {
        errorMessage.value = formatError(err)
    } finally {
        testingBandwidth.value = false
    }
}

function getReceivedSizeInMB(data: unknown): number {
    if (data instanceof ArrayBuffer) {
        return data.byteLength / 1024 / 1024
    }

    if (ArrayBuffer.isView(data)) {
        return data.byteLength / 1024 / 1024
    }

    if (Array.isArray(data)) {
        return data.length / 1024 / 1024
    }

    if (typeof data === 'string') {
        return Math.floor(data.length * 3 / 4) / 1024 / 1024
    }

    return 0
}

function round(value: number, precision: number): number {
    const factor = 10 ** precision
    return Math.round(value * factor) / factor
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}
</script>

<template>
    <div class="diagnostics">
        <div class="diag-header">
            <div>
                <h2>SignalR 诊断测试</h2>
                <p>用于单独评估前端和后端之间的调用延迟、请求吞吐和下行带宽。</p>
            </div>
            <span class="diag-status" :class="connected ? 'online' : 'offline'">
                {{ connected ? '已连接' : '未连接' }}
            </span>
        </div>

        <div v-if="errorMessage" class="diag-error">
            {{ errorMessage }}
        </div>

        <div class="diag-grid">
            <section class="diag-card">
                <div class="card-head">
                    <h3>基础测试</h3>
                    <span>前端请求后端</span>
                </div>
                <p class="card-note">检查前端能否正常调用后端，并测量一次请求来回耗时。</p>
                <button class="diag-btn primary" :disabled="!canRun" @click="getCurrentTime">
                    {{ loadingTime ? '获取中...' : '获取当前时间' }}
                </button>
                <div v-if="currentTime" class="result-box time">
                    {{ currentTime }}
                </div>

                <button class="diag-btn" :disabled="!canRun" @click="testLatency">
                    {{ testingLatency ? '测试中...' : '测试通讯延迟' }}
                </button>
                <div v-if="latencyResult" class="result-box latency">
                    <div><span>平均延迟</span><strong>{{ latencyResult.average }} ms</strong></div>
                    <div><span>最小 / 最大</span><strong>{{ latencyResult.min }} / {{ latencyResult.max }} ms</strong></div>
                    <div><span>最近一次</span><strong>{{ latencyResult.latest }} ms</strong></div>
                </div>
            </section>

            <section class="diag-card">
                <div class="card-head">
                    <h3>吞吐量测试</h3>
                    <span>前端连续请求后端</span>
                </div>
                <p class="card-note">统计前端每秒可以完成多少次后端方法调用。</p>
                <button class="diag-btn danger" :disabled="!canRun" @click="testThroughput">
                    {{ testingThroughput ? '测试中...' : '串行吞吐量（5秒）' }}
                </button>
                <div v-if="throughputResult" class="result-box throughput">
                    <div><span>每秒请求数</span><strong>{{ throughputResult.qps.toLocaleString() }} 次/秒</strong></div>
                    <div><span>总请求数</span><strong>{{ throughputResult.totalCalls.toLocaleString() }} 次</strong></div>
                    <div><span>耗时</span><strong>{{ throughputResult.duration }} 秒</strong></div>
                </div>

                <button class="diag-btn danger" :disabled="!canRun" @click="testConcurrent">
                    {{ testingConcurrent ? '测试中...' : '并发吞吐量（5万）' }}
                </button>
                <div v-if="concurrentResult" class="result-box concurrent">
                    <div><span>每秒请求数</span><strong>{{ concurrentResult.qps.toLocaleString() }} 次/秒</strong></div>
                    <div><span>总请求数</span><strong>{{ concurrentResult.totalCalls.toLocaleString() }} 次</strong></div>
                    <div><span>耗时</span><strong>{{ concurrentResult.duration }} 秒</strong></div>
                </div>
            </section>

            <section class="diag-card">
                <div class="card-head">
                    <h3>带宽测试</h3>
                    <span>服务端到前端</span>
                </div>
                <p class="card-note">后端生成数据块并传给前端，用来观察下行传输速度。</p>
                <button class="diag-btn primary" :disabled="!canRun" @click="testBandwidth">
                    {{ testingBandwidth ? '传输中...' : '测试带宽（100MB）' }}
                </button>
                <div v-if="bandwidthResult" class="result-box bandwidth">
                    <div><span>传输速度</span><strong>{{ bandwidthResult.speedMBps }} MB/s</strong></div>
                    <div><span>目标大小</span><strong>{{ bandwidthResult.dataSize }} MB</strong></div>
                    <div><span>收到大小</span><strong>{{ bandwidthResult.receivedSize }} MB</strong></div>
                    <div><span>传输时长</span><strong>{{ bandwidthResult.duration }} 秒</strong></div>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.diagnostics {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.diag-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
}

.diag-header h2 {
    font-size: 18px;
    font-weight: 650;
    color: #1f2328;
    margin-bottom: 4px;
}

.diag-header p {
    font-size: 13px;
    color: #656d76;
}

.diag-status {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
}

.diag-status.online {
    color: #1a7f37;
    background: #dafbe1;
}

.diag-status.offline {
    color: #cf222e;
    background: #ffebe9;
}

.diag-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}

.diag-error {
    margin-bottom: 14px;
    padding: 10px 12px;
    color: #cf222e;
    background: #ffebe9;
    border: 1px solid #ff8182;
    border-radius: 6px;
    font-size: 13px;
}

.diag-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    background: #f6f8fa;
    border: 1px solid #d8dee4;
    border-radius: 8px;
}

.card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 4px;
}

.card-head h3 {
    font-size: 15px;
    color: #1f2328;
}

.card-head span {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
}

.card-note {
    margin-top: -4px;
    color: #57606a;
    font-size: 12px;
    line-height: 1.5;
}

.diag-btn {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    color: #374151;
    cursor: pointer;
    font-size: 13px;
    font-weight: 650;
    font-family: inherit;
    transition: all 0.15s;
}

.diag-btn:hover:not(:disabled) {
    background: #f3f4f6;
}

.diag-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.diag-btn.primary {
    color: #fff;
    background: #0969da;
    border-color: #0969da;
}

.diag-btn.primary:hover:not(:disabled) {
    background: #0550ae;
}

.diag-btn.danger {
    color: #fff;
    background: #cf222e;
    border-color: #cf222e;
}

.diag-btn.danger:hover:not(:disabled) {
    background: #a0111f;
}

.result-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid #d8dee4;
    background: #fff;
    font-size: 13px;
}

.result-box div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.result-box span {
    color: #656d76;
}

.result-box strong {
    color: #1f2328;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.result-box.time {
    align-items: center;
    color: #1a7f37;
    background: #f0fdf4;
    border-color: #bbf7d0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.result-box.latency {
    background: #eff6ff;
    border-color: #bfdbfe;
}

.result-box.throughput {
    background: #fff7ed;
    border-color: #fed7aa;
}

.result-box.concurrent {
    background: #faf5ff;
    border-color: #e9d5ff;
}

.result-box.bandwidth {
    background: #f0fdfa;
    border-color: #99f6e4;
}

@media (max-width: 1120px) {
    .diag-grid {
        grid-template-columns: 1fr;
    }
}
</style>
