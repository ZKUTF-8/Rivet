<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { createConnection, type RivetConnection, type Protocol } from '@rivet/client'
import ControlPanel from './components/ControlPanel.vue'
import VariableGrid from './components/VariableGrid.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import BenchmarkReport from './components/BenchmarkReport.vue'

const BACKEND_URL = 'http://localhost:9710/bridge'

// ─── 基准测试场景定义 ───
const BENCHMARK_SCENARIOS = [
    { label: '轻量 10变量', variableCount: 10, updateIntervalMs: 500, useBatchMode: true },
    { label: '适中 50变量', variableCount: 50, updateIntervalMs: 200, useBatchMode: true },
    { label: '中等 100变量', variableCount: 100, updateIntervalMs: 100, useBatchMode: true },
    { label: '较多 200变量', variableCount: 200, updateIntervalMs: 100, useBatchMode: true },
    { label: '压力 500变量', variableCount: 500, updateIntervalMs: 50, useBatchMode: true },
    { label: '高压 1000变量', variableCount: 1000, updateIntervalMs: 50, useBatchMode: true },
    { label: '极限 2000变量', variableCount: 2000, updateIntervalMs: 20, useBatchMode: true },
    { label: '暴力 5000变量', variableCount: 5000, updateIntervalMs: 10, useBatchMode: true },
]
const WARMUP_SEC = 3
const COLLECT_SEC = 15

// ─── 连接状态 ───
const conn = ref<RivetConnection | null>(null)
const protocol = ref<Protocol>('msgpack')
const connected = ref(false)
const variables = ref<Record<string, any>>({})
const batchCount = ref(0)

// ─── 实时指标 ───
const latencies = ref<number[]>([])
const writeLatencies = ref<number[]>([])
const fps = ref(0)
let frameCount = 0
let fpsTimer: ReturnType<typeof setInterval>

// ─── 写入测试 ───
let writeTimer: ReturnType<typeof setInterval> | null = null
const writeEnabled = ref(false)

// ─── 基准测试状态 ───
const benchmarkRunning = ref(false)
const benchmarkCancelled = ref(false)
const benchmarkProgress = ref({ current: 0, total: 0, label: '', phase: '' as 'warmup' | 'collecting', secondsLeft: 0 })
const benchmarkResults = ref<BenchmarkResult[]>([])
const showReport = ref(false)

let benchmarkCollector: number[] | null = null

export interface BenchmarkResult {
    scenario: { label: string; variableCount: number; updateIntervalMs: number }
    avgLatency: number
    p95Latency: number
    p99Latency: number
    maxLatency: number
    avgFps: number
    throughput: number
    totalBatches: number
}

const variableCount = computed(() => Object.keys(variables.value).length)

// ─── 工具函数 ───
function normalizeVar(key: string, v: any): any {
    if (!v || typeof v !== 'object') return { name: key, value: null, type: 0, updateCount: 0, lastUpdated: 0 }
    const isPascal = 'Name' in v
    return {
        name: isPascal ? v.Name : (v.name ?? key),
        value: isPascal ? v.Value : v.value,
        type: isPascal ? (v.Type ?? 0) : (v.type ?? 0),
        updateCount: isPascal ? (v.UpdateCount ?? 0) : (v.updateCount ?? 0),
        lastUpdated: isPascal ? (v.LastUpdated ?? 0) : (v.lastUpdated ?? 0),
    }
}

function normalizeVarMap(raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'object') return {}
    const result: Record<string, any> = {}
    for (const [key, v] of Object.entries<any>(raw)) {
        result[key] = normalizeVar(key, v)
    }
    return result
}

function calcAvg(arr: number[]): number {
    if (arr.length === 0) return 0
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

function calcPercentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)] ?? 0
}

function calcMax(arr: number[]): number {
    if (arr.length === 0) return 0
    let max = arr[0]
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > max) max = arr[i]
    }
    return max
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── 连接管理 ───
async function connect() {
    const c = createConnection({ url: BACKEND_URL, protocol: protocol.value })
    conn.value = c

    c.connection.on('VariableBatchUpdate', (raw: any) => {
        const now = Date.now()
        const ts = raw.Timestamp ?? raw.timestamp
        if (typeof ts === 'number' && ts > 0) {
            const latency = now - ts
            latencies.value.push(latency)
            if (latencies.value.length > 500) latencies.value.shift()
            if (benchmarkCollector) benchmarkCollector.push(latency)
        }
        const vars = raw.Variables ?? raw.variables ?? {}
        variables.value = normalizeVarMap(vars)
        batchCount.value++
        frameCount++
    })

    c.connection.on('VariableUpdate', (key: string, raw: any) => {
        variables.value = { ...variables.value, [key]: normalizeVar(key, raw) }
        frameCount++
    })

    c.connection.on('InitialState', (raw: any) => {
        variables.value = normalizeVarMap(raw)
    })

    await c.start()
    connected.value = true
}

async function disconnect() {
    stopWriteTest()
    if (conn.value) {
        await conn.value.stop()
        connected.value = false
        conn.value = null
    }
}

async function switchProtocol(p: Protocol) {
    protocol.value = p
    if (connected.value) {
        await disconnect()
        await connect()
    }
}

// ─── 手动压测 ───
async function startTest(config: { variableCount: number; updateIntervalMs: number; useBatchMode: boolean }) {
    if (!conn.value) return
    latencies.value = []
    writeLatencies.value = []
    batchCount.value = 0
    frameCount = 0
    await conn.value.connection.invoke('StartStressTest', config.variableCount, config.updateIntervalMs, config.useBatchMode)
}

async function stopTest() {
    if (!conn.value) return
    stopWriteTest()
    await conn.value.connection.invoke('StopStressTest')
}

async function updateConfig(config: { variableCount: number; updateIntervalMs: number; useBatchMode: boolean }) {
    if (!conn.value) return
    await conn.value.connection.invoke('UpdateConfig', config.variableCount, config.updateIntervalMs, config.useBatchMode)
}

// ─── 写入测试 ───
function startWriteTest(intervalMs: number) {
    stopWriteTest()
    writeEnabled.value = true
    writeTimer = setInterval(async () => {
        if (!conn.value) return
        const keys = Object.keys(variables.value)
        if (keys.length === 0) return
        const randomKey = keys[Math.floor(Math.random() * keys.length)]
        const clientTs = Date.now()
        try {
            await conn.value.connection.invoke('WriteVariable', randomKey, Math.random() * 100, clientTs)
            writeLatencies.value.push(Date.now() - clientTs)
            if (writeLatencies.value.length > 500) writeLatencies.value.shift()
        } catch { /* 忽略写入失败 */ }
    }, intervalMs)
}

function stopWriteTest() {
    writeEnabled.value = false
    if (writeTimer) { clearInterval(writeTimer); writeTimer = null }
}

// ─── 自动基准测试 ───
async function runBenchmark() {
    if (!conn.value) return

    benchmarkRunning.value = true
    benchmarkCancelled.value = false
    benchmarkResults.value = []
    showReport.value = false

    const scenarios = BENCHMARK_SCENARIOS
    benchmarkProgress.value.total = scenarios.length

    for (let i = 0; i < scenarios.length; i++) {
        if (benchmarkCancelled.value) break

        const s = scenarios[i]
        benchmarkProgress.value.current = i + 1
        benchmarkProgress.value.label = s.label

        latencies.value = []
        batchCount.value = 0
        frameCount = 0

        await conn.value!.connection.invoke('StartStressTest', s.variableCount, s.updateIntervalMs, s.useBatchMode)

        // 预热阶段
        benchmarkProgress.value.phase = 'warmup'
        for (let sec = WARMUP_SEC; sec > 0 && !benchmarkCancelled.value; sec--) {
            benchmarkProgress.value.secondsLeft = sec + COLLECT_SEC
            await sleep(1000)
        }
        if (benchmarkCancelled.value) break

        // 开始采集
        benchmarkCollector = []
        const fpsSnapshots: number[] = []
        const batchCountAtStart = batchCount.value
        benchmarkProgress.value.phase = 'collecting'

        for (let sec = COLLECT_SEC; sec > 0 && !benchmarkCancelled.value; sec--) {
            benchmarkProgress.value.secondsLeft = sec
            fpsSnapshots.push(fps.value)
            await sleep(1000)
        }

        // 收集结果
        const collected = benchmarkCollector ?? []
        benchmarkCollector = null
        const batchesDuringCollection = batchCount.value - batchCountAtStart
        const avgFps = calcAvg(fpsSnapshots)

        benchmarkResults.value.push({
            scenario: s,
            avgLatency: calcAvg(collected),
            p95Latency: calcPercentile(collected, 0.95),
            p99Latency: calcPercentile(collected, 0.99),
            maxLatency: calcMax(collected),
            avgFps,
            throughput: Math.round(avgFps * s.variableCount),
            totalBatches: batchesDuringCollection,
        })

        await conn.value!.connection.invoke('StopStressTest')
        await sleep(1000)
    }

    benchmarkRunning.value = false
    if (!benchmarkCancelled.value) {
        showReport.value = true
    }
}

function cancelBenchmark() {
    benchmarkCancelled.value = true
}

// ─── 生命周期 ───
onMounted(() => {
    fpsTimer = setInterval(() => {
        fps.value = frameCount
        frameCount = 0
    }, 1000)
})

onUnmounted(() => {
    clearInterval(fpsTimer)
    disconnect()
})
</script>

<template>
    <div class="app">
        <header class="app-header">
            <h1>Rivet 压力测试</h1>
            <div class="connection-status">
                <span class="status-dot" :class="connected ? 'online' : 'offline'" />
                <span>{{ connected ? '已连接' : '未连接' }}</span>
                <span class="protocol-badge">{{ protocol.toUpperCase() }}</span>
            </div>
        </header>

        <main class="app-main">
            <ControlPanel :connected="connected" :protocol="protocol" :write-enabled="writeEnabled"
                :benchmark-running="benchmarkRunning"
                :benchmark-progress="benchmarkProgress"
                @connect="connect" @disconnect="disconnect" @start="startTest" @stop="stopTest"
                @update-config="updateConfig" @switch-protocol="switchProtocol" @start-write="startWriteTest"
                @stop-write="stopWriteTest" @start-benchmark="runBenchmark" @cancel-benchmark="cancelBenchmark" />

            <BenchmarkReport v-if="showReport" :results="benchmarkResults" :protocol="protocol"
                @close="showReport = false" />

            <div v-else class="panels">
                <MetricsPanel :latencies="latencies" :write-latencies="writeLatencies" :fps="fps"
                    :variable-count="variableCount" :batch-count="batchCount" />
                <VariableGrid :variables="variables" />
            </div>
        </main>
    </div>
</template>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        'Helvetica Neue', Arial, sans-serif;
    background: #f5f6f8;
    color: #1f2328;
}

.app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}


.app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: #fff;
    border-bottom: 1px solid #d1d5db;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.app-header h1 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2328;
}

.connection-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.status-dot.online {
    background: #1a7f37;
    box-shadow: 0 0 6px rgba(26, 127, 55, 0.4);
}

.status-dot.offline {
    background: #cf222e;
}

.protocol-badge {
    padding: 2px 8px;
    background: #eef1f5;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    color: #656d76;
}

.app-main {
    flex: 1;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.panels {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 20px;
    flex: 1;
}

@media (max-width: 1024px) {
    .panels {
        grid-template-columns: 1fr;
    }
}
</style>
