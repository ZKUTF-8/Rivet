<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { createStressConnection, type StressConnection, type Protocol } from './stressConnection'
import ControlPanel from './components/ControlPanel.vue'
import VariableGrid from './components/VariableGrid.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import BenchmarkReport from './components/BenchmarkReport.vue'
import PerformanceDiagnostics from './components/PerformanceDiagnostics.vue'

const BACKEND_URL = 'http://localhost:9710/bridge'

// ─── 基准测试场景定义 ───
const BENCHMARK_SCENARIOS = [
    { label: '极轻量', variableCount: 10, updateIntervalMs: 500, useBatchMode: true },
    { label: '轻量', variableCount: 50, updateIntervalMs: 300, useBatchMode: true },
    { label: '中等', variableCount: 100, updateIntervalMs: 150, useBatchMode: true },
    { label: '较重', variableCount: 500, updateIntervalMs: 75, useBatchMode: true },
    { label: '压力', variableCount: 1000, updateIntervalMs: 40, useBatchMode: true },
    { label: '高负载', variableCount: 2000, updateIntervalMs: 25, useBatchMode: true },
    { label: '极限', variableCount: 3500, updateIntervalMs: 15, useBatchMode: true },
    { label: '暴力', variableCount: 5000, updateIntervalMs: 10, useBatchMode: true },
]
const WARMUP_SEC = 5
const COLLECT_SEC = 15
const MANUAL_TEST_SEC = 20

// ─── 连接状态 ───
const conn = ref<StressConnection | null>(null)
const protocol = ref<Protocol>('msgpack')
const connected = ref(false)
const variables = ref<Record<string, any>>({})
const batchCount = ref(0)
const controlMode = ref<'preset' | 'custom' | 'diagnostics'>('preset')

// ─── 实时指标 ───
const latencies = ref<number[]>([])
const writeLatencies = ref<number[]>([])
const fps = ref(0)
let frameCount = 0
let fpsTimer: ReturnType<typeof setInterval>

// ─── 测试运行状态 ───
const running = ref(false)
const elapsedSeconds = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null
const currentScenarioDesc = ref('')
const estimatedTotalSec = ref(0)
const manualTotalSec = ref(0)

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

async function setControlMode(mode: 'preset' | 'custom' | 'diagnostics') {
    if (mode === 'diagnostics' && running.value) {
        await stopTest()
    }
    controlMode.value = mode
    if (mode === 'diagnostics') {
        showReport.value = false
    }
}

// ─── 连接管理 ───
async function connect() {
    const c = createStressConnection({ url: BACKEND_URL, protocol: protocol.value })
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
        running.value = false
        if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
        manualTotalSec.value = 0
        variables.value = {}
        batchCount.value = 0
        latencies.value = []
        writeLatencies.value = []
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
async function startTest(config: { variableCount: number; updateIntervalMs: number; writeIntervalMs: number; useBatchMode: boolean }) {
    if (!conn.value) return
    running.value = true
    elapsedSeconds.value = 0
    latencies.value = []
    writeLatencies.value = []
    batchCount.value = 0
    frameCount = 0
    currentScenarioDesc.value = `${config.variableCount}个变量·每${config.updateIntervalMs}ms推送·每${config.writeIntervalMs}ms写入`
    estimatedTotalSec.value = 0
    manualTotalSec.value = MANUAL_TEST_SEC
    elapsedTimer = setInterval(() => {
        elapsedSeconds.value++
        // 到达预估时间后自动停止
        if (elapsedSeconds.value >= manualTotalSec.value) {
            stopTest()
        }
    }, 1000)
    await conn.value.connection.invoke('StartStressTest', config.variableCount, config.updateIntervalMs, config.useBatchMode)
    // 自动启动写入测试（前端→后端）
    startWriteTest(config.writeIntervalMs)
}

async function stopTest() {
    if (!conn.value) return
    running.value = false
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
    stopWriteTest()
    manualTotalSec.value = 0
    await stopRemoteStressTest()
}

async function stopRemoteStressTest() {
    if (!conn.value) return
    try {
        await conn.value.connection.invoke('StopStressTest')
    } catch { /* 连接可能已断开，忽略清理失败 */ }
}

async function updateConfig(config: { variableCount: number; updateIntervalMs: number; writeIntervalMs: number; useBatchMode: boolean }) {
    if (!conn.value) return
    await conn.value.connection.invoke('UpdateConfig', config.variableCount, config.updateIntervalMs, config.useBatchMode)
    // 重启写入测试以应用新间隔
    if (writeEnabled.value) {
        stopWriteTest()
        startWriteTest(config.writeIntervalMs)
    }
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
    // 每个场景：预热 + 采集 + 1s 间隔
    estimatedTotalSec.value = scenarios.length * (WARMUP_SEC + COLLECT_SEC + 1)

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
        if (benchmarkCancelled.value) {
            await stopRemoteStressTest()
            benchmarkCollector = null
            break
        }

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
        if (benchmarkCancelled.value) {
            await stopRemoteStressTest()
            benchmarkCollector = null
            break
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

        await stopRemoteStressTest()
        await sleep(1000)
    }

    benchmarkRunning.value = false
    estimatedTotalSec.value = 0
    manualTotalSec.value = 0
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
        <!-- 顶部工具栏：连接设置 -->
        <header class="app-toolbar">
            <div class="toolbar-left">
                <h1>Rivet 压力测试</h1>
            </div>
            <div class="toolbar-center">
                <div class="connection-controls">
                    <button class="tb-btn" :class="connected ? 'tb-btn-danger' : 'tb-btn-primary'"
                        @click="connected ? disconnect() : connect()">
                        {{ connected ? '断开' : '连接' }}
                    </button>
                    <div class="tb-divider"></div>
                    <div class="tb-group">
                        <button class="tb-btn tb-btn-sm" :class="protocol === 'msgpack' ? 'tb-btn-active' : ''"
                            @click="switchProtocol('msgpack')">MP</button>
                        <button class="tb-btn tb-btn-sm" :class="protocol === 'json' ? 'tb-btn-active' : ''"
                            @click="switchProtocol('json')">JSON</button>
                    </div>
                </div>
            </div>
            <div class="toolbar-right">
                <span class="status-indicator" :class="connected ? 'online' : 'offline'">
                    <span class="status-dot"></span>
                    {{ connected ? '已连接' : '未连接' }}
                </span>
            </div>
        </header>

        <main class="app-main">
            <aside class="sidebar">
                <ControlPanel :connected="connected" :protocol="protocol" :write-enabled="writeEnabled"
                    :running="running" :mode="controlMode" :benchmark-running="benchmarkRunning"
                    :total-benchmark-sec="estimatedTotalSec" :benchmark-progress="benchmarkProgress"
                    @connect="connect" @disconnect="disconnect" @mode-change="setControlMode"
                    @start="startTest" @stop="stopTest" @update-config="updateConfig" @switch-protocol="switchProtocol"
                    @start-benchmark="runBenchmark" @cancel-benchmark="cancelBenchmark" />
            </aside>

            <section class="content">
                <PerformanceDiagnostics v-if="controlMode === 'diagnostics'" :connected="connected"
                    :connection="conn?.connection ?? null" />

                <BenchmarkReport v-else-if="showReport" :results="benchmarkResults" :protocol="protocol"
                    @close="showReport = false" />

                <div v-else class="content-inner">
                    <MetricsPanel :latencies="latencies" :write-latencies="writeLatencies" :fps="fps"
                        :variable-count="variableCount" :batch-count="batchCount" :running="running"
                        :elapsed-seconds="elapsedSeconds" :scenario-desc="currentScenarioDesc"
                        :estimated-total-sec="estimatedTotalSec" :manual-total-sec="manualTotalSec" />
                    <VariableGrid :variables="variables" />
                </div>
            </section>
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

/* ─── 顶部工具栏 ─── */
.app-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 48px;
    background: #fff;
    border-bottom: 1px solid #d1d5db;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
}

.toolbar-left h1 {
    font-size: 16px;
    font-weight: 600;
    color: #1f2328;
}

.toolbar-center {
    display: flex;
    align-items: center;
}

.connection-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f5f6f8;
    padding: 3px;
    border-radius: 6px;
}

.tb-btn {
    padding: 5px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.12s ease;
    white-space: nowrap;
}

.tb-btn-primary {
    background: #0969da;
    color: #fff;
}

.tb-btn-primary:hover {
    background: #0550ae;
}

.tb-btn-danger {
    background: #cf222e;
    color: #fff;
}

.tb-btn-danger:hover {
    background: #a0111f;
}

.tb-btn-sm {
    padding: 4px 10px;
    font-size: 11px;
}

.tb-btn-active {
    background: #fff;
    color: #0969da;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.tb-divider {
    width: 1px;
    height: 20px;
    background: #d1d5db;
}

.tb-group {
    display: flex;
    gap: 2px;
}

.toolbar-right {
    display: flex;
    align-items: center;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #656d76;
}

.status-indicator.online {
    color: #1a7f37;
}

.status-indicator.offline {
    color: #cf222e;
}

.status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.status-indicator.online .status-dot {
    background: #1a7f37;
    box-shadow: 0 0 5px rgba(26, 127, 55, 0.4);
}

.status-indicator.offline .status-dot {
    background: #cf222e;
}

/* ─── 主体布局 ─── */
.app-main {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.sidebar {
    width: 290px;
    flex-shrink: 0;
    border-right: 1px solid #d1d5db;
    background: #fff;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    overflow: hidden;
}

.content-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
}
</style>
