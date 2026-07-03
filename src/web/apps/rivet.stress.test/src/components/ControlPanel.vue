<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Protocol } from '../stressConnection'

const props = defineProps<{
    connected: boolean
    protocol: Protocol
    writeEnabled: boolean
    benchmarkRunning: boolean
    benchmarkProgress: {
        current: number
        total: number
        label: string
        phase: 'warmup' | 'collecting'
        secondsLeft: number
    }
}>()

const emit = defineEmits<{
    connect: []
    disconnect: []
    start: [config: { variableCount: number; updateIntervalMs: number; useBatchMode: boolean }]
    stop: []
    updateConfig: [config: { variableCount: number; updateIntervalMs: number; useBatchMode: boolean }]
    switchProtocol: [protocol: Protocol]
    startWrite: [intervalMs: number]
    stopWrite: []
    startBenchmark: []
    cancelBenchmark: []
}>()

const variableCount = ref(100)
const updateIntervalMs = ref(100)
const useBatchMode = ref(true)
const running = ref(false)
const writeIntervalMs = ref(50)

const progressPercent = computed(() => {
    if (props.benchmarkProgress.total === 0) return 0
    return Math.round((props.benchmarkProgress.current / props.benchmarkProgress.total) * 100)
})

const totalEstimate = computed(() => {
    const total = props.benchmarkProgress.total
    const current = props.benchmarkProgress.current
    const remaining = (total - current) * 19 + props.benchmarkProgress.secondsLeft
    const min = Math.floor(remaining / 60)
    const sec = remaining % 60
    return min > 0 ? `${min}分${sec}秒` : `${sec}秒`
})

function handleStart() {
    running.value = true
    emit('start', {
        variableCount: variableCount.value,
        updateIntervalMs: updateIntervalMs.value,
        useBatchMode: useBatchMode.value,
    })
}

function handleStop() {
    running.value = false
    emit('stop')
}

function handleApply() {
    emit('updateConfig', {
        variableCount: variableCount.value,
        updateIntervalMs: updateIntervalMs.value,
        useBatchMode: useBatchMode.value,
    })
}

const presets = [
    { label: '轻量 (10 vars, 500ms)', vars: 10, interval: 500 },
    { label: '中等 (100 vars, 100ms)', vars: 100, interval: 100 },
    { label: '压力 (500 vars, 50ms)', vars: 500, interval: 50 },
    { label: '极限 (2000 vars, 20ms)', vars: 2000, interval: 20 },
    { label: '暴力 (5000 vars, 10ms)', vars: 5000, interval: 10 },
]

function applyPreset(preset: (typeof presets)[number]) {
    variableCount.value = preset.vars
    updateIntervalMs.value = preset.interval
    if (running.value) handleApply()
}
</script>

<template>
    <div class="control-panel">
        <h2>控制面板</h2>

        <!-- 基准测试进度（运行中显示） -->
        <section v-if="benchmarkRunning" class="section benchmark-progress">
            <h3>自动基准测试运行中</h3>
            <div class="progress-info">
                <div class="progress-label">
                    <span class="scenario-badge">{{ benchmarkProgress.current }} / {{ benchmarkProgress.total }}</span>
                    <span>{{ benchmarkProgress.label }}</span>
                </div>
                <div class="progress-phase">
                    {{ benchmarkProgress.phase === 'warmup' ? '预热中...' : '采集数据中...' }}
                    剩余 {{ benchmarkProgress.secondsLeft }} 秒
                </div>
                <div class="progress-bar-track">
                    <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }" />
                </div>
                <div class="progress-meta">
                    总进度 {{ progressPercent }}% · 预计还需 {{ totalEstimate }}
                </div>
            </div>
            <button class="btn btn-danger btn-lg" @click="$emit('cancelBenchmark')">
                取消测试
            </button>
        </section>

        <!-- 正常控制（非基准测试时显示） -->
        <template v-else>
            <section class="section">
                <h3>连接</h3>
                <div class="row">
                    <button class="btn" :class="connected ? 'btn-danger' : 'btn-primary'"
                        @click="connected ? $emit('disconnect') : $emit('connect')">
                        {{ connected ? '断开连接' : '连接服务器' }}
                    </button>
                </div>
                <div class="row">
                    <label>协议：</label>
                    <div class="btn-group">
                        <button class="btn btn-sm" :class="protocol === 'msgpack' ? 'btn-active' : ''"
                            @click="$emit('switchProtocol', 'msgpack')">
                            MessagePack
                        </button>
                        <button class="btn btn-sm" :class="protocol === 'json' ? 'btn-active' : ''"
                            @click="$emit('switchProtocol', 'json')">
                            JSON
                        </button>
                    </div>
                </div>
            </section>

            <!-- 自动基准测试 -->
            <section class="section benchmark-section">
                <h3>自动基准测试</h3>
                <p class="hint">自动运行 8 个递进场景（10~5000 变量），每个场景预热 3 秒 + 采集 15 秒，约 2.5 分钟完成。</p>
                <button class="btn btn-benchmark btn-lg" :disabled="!connected" @click="$emit('startBenchmark')">
                    开始基准测试
                </button>
            </section>

            <section class="section">
                <h3>手动推送测试（后端 → 前端）</h3>
                <div class="field">
                    <label>变量数量: <strong>{{ variableCount }}</strong></label>
                    <input type="range" v-model.number="variableCount" min="1" max="10000" step="1" />
                    <input type="number" v-model.number="variableCount" min="1" max="10000" class="num-input" />
                </div>
                <div class="field">
                    <label>更新间隔: <strong>{{ updateIntervalMs }}ms</strong></label>
                    <input type="range" v-model.number="updateIntervalMs" min="5" max="2000" step="5" />
                    <input type="number" v-model.number="updateIntervalMs" min="5" max="2000" class="num-input" />
                </div>
                <div class="field">
                    <label>
                        <input type="checkbox" v-model="useBatchMode" />
                        批量推送模式
                    </label>
                </div>
            </section>

            <section class="section">
                <h3>写入测试（前端 → 后端）</h3>
                <div class="field">
                    <label>写入间隔: <strong>{{ writeIntervalMs }}ms</strong></label>
                    <input type="range" v-model.number="writeIntervalMs" min="10" max="1000" step="10" />
                    <input type="number" v-model.number="writeIntervalMs" min="10" max="1000" class="num-input" />
                </div>
                <div class="row">
                    <button v-if="!writeEnabled" class="btn btn-sm btn-outline" :disabled="!connected || !running"
                        @click="$emit('startWrite', writeIntervalMs)">
                        开始写入测试
                    </button>
                    <button v-else class="btn btn-sm btn-danger" @click="$emit('stopWrite')">
                        停止写入测试
                    </button>
                </div>
                <p class="hint">模拟操作员修改参数/设定值，测量往返延迟</p>
            </section>

            <section class="section">
                <h3>预设方案</h3>
                <div class="presets">
                    <button v-for="p in presets" :key="p.label" class="btn btn-sm btn-outline"
                        @click="applyPreset(p)">
                        {{ p.label }}
                    </button>
                </div>
            </section>

            <section class="section">
                <div class="row">
                    <button v-if="!running" class="btn btn-primary btn-lg" :disabled="!connected" @click="handleStart">
                        开始手动压测
                    </button>
                    <button v-else class="btn btn-danger btn-lg" @click="handleStop">
                        停止压测
                    </button>
                    <button v-if="running" class="btn btn-sm" @click="handleApply">
                        应用参数
                    </button>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
.control-panel {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

h2 {
    font-size: 16px;
    margin-bottom: 16px;
    color: #1f2328;
}

h3 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #656d76;
    margin-bottom: 10px;
}

.section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
}

.section:last-child {
    border-bottom: none;
    margin-bottom: 0;
}

.row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.field {
    margin-bottom: 12px;
}

.field label {
    display: block;
    font-size: 13px;
    margin-bottom: 6px;
    color: #374151;
}

.field input[type='range'] {
    width: 100%;
    accent-color: #2563eb;
}

.num-input {
    width: 80px;
    padding: 4px 8px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #1f2328;
    font-size: 13px;
    margin-top: 4px;
}

.hint {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 4px;
    line-height: 1.5;
}

.btn {
    padding: 8px 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f3f4f6;
    color: #374151;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.15s;
}

.btn:hover {
    background: #e5e7eb;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-sm {
    padding: 4px 10px;
    font-size: 12px;
}

.btn-lg {
    padding: 10px 24px;
    font-size: 15px;
    flex: 1;
}

.btn-primary {
    background: #1a7f37;
    border-color: #1a7f37;
    color: #fff;
}

.btn-primary:hover {
    background: #176e30;
}

.btn-danger {
    background: #cf222e;
    border-color: #cf222e;
    color: #fff;
}

.btn-danger:hover {
    background: #b91c26;
}

.btn-active {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
}

.btn-outline {
    background: transparent;
}

.btn-benchmark {
    background: #6f42c1;
    border-color: #6f42c1;
    color: #fff;
}

.btn-benchmark:hover {
    background: #5e35ad;
}

.btn-group {
    display: flex;
    gap: 4px;
}

.presets {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

label {
    font-size: 13px;
    color: #656d76;
}

/* 基准测试区域 */
.benchmark-section {
    background: #f8f5ff;
    margin: -4px -12px 20px;
    padding: 16px 12px;
    border-radius: 6px;
    border: 1px dashed #c4b5fd;
}

/* 基准测试进度 */
.benchmark-progress {
    border-bottom: none;
}

.progress-info {
    margin-bottom: 16px;
}

.progress-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 6px;
    color: #1f2328;
}

.scenario-badge {
    padding: 2px 8px;
    background: #6f42c1;
    color: #fff;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}

.progress-phase {
    font-size: 13px;
    color: #656d76;
    margin-bottom: 10px;
}

.progress-bar-track {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 6px;
}

.progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #6f42c1, #8b5cf6);
    border-radius: 4px;
    transition: width 0.5s ease;
}

.progress-meta {
    font-size: 12px;
    color: #9ca3af;
}
</style>
