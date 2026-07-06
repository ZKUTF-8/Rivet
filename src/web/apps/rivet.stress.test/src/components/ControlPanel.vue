<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Protocol } from '../stressConnection'

const props = defineProps<{
    connected: boolean
    protocol: Protocol
    writeEnabled: boolean
    running: boolean
    mode: 'preset' | 'custom' | 'diagnostics'
    benchmarkRunning: boolean
    totalBenchmarkSec: number
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
    start: [config: { variableCount: number; updateIntervalMs: number; writeIntervalMs: number; useBatchMode: boolean }]
    stop: []
    updateConfig: [config: { variableCount: number; updateIntervalMs: number; writeIntervalMs: number; useBatchMode: boolean }]
    switchProtocol: [protocol: Protocol]
    modeChange: [mode: 'preset' | 'custom' | 'diagnostics']
    startBenchmark: []
    cancelBenchmark: []
}>()

const variableCount = ref(100)
const updateIntervalMs = ref(100)
const writeIntervalMs = ref(50)
const useBatchMode = ref(true)
const selectedScenarioIndex = ref(0)

const scenarios = [
    { label: '极轻量', variableCount: 10, updateIntervalMs: 500, desc: '10变量·500ms·验证连通' },
    { label: '轻量', variableCount: 50, updateIntervalMs: 300, desc: '50变量·300ms·低负载' },
    { label: '中等', variableCount: 100, updateIntervalMs: 150, desc: '100变量·150ms·日常负载' },
    { label: '较重', variableCount: 500, updateIntervalMs: 75, desc: '500变量·75ms·中等压力' },
    { label: '压力', variableCount: 1000, updateIntervalMs: 40, desc: '1000变量·40ms·持续压力' },
    { label: '高负载', variableCount: 2000, updateIntervalMs: 25, desc: '2000变量·25ms·高并发' },
    { label: '极限', variableCount: 3500, updateIntervalMs: 15, desc: '3500变量·15ms·近极限' },
    { label: '暴力', variableCount: 5000, updateIntervalMs: 10, desc: '5000变量·10ms·极限压测' },
]

const progressPercent = computed(() => {
    if (props.benchmarkProgress.total === 0) return 0
    return Math.round((props.benchmarkProgress.current / props.benchmarkProgress.total) * 100)
})

const totalEstimate = computed(() => {
    const total = props.benchmarkProgress.total
    const current = props.benchmarkProgress.current
    const scenarioSec = total > 0 ? Math.ceil(props.totalBenchmarkSec / total) : 0
    const remaining = (total - current) * scenarioSec + props.benchmarkProgress.secondsLeft
    const min = Math.floor(remaining / 60)
    const sec = remaining % 60
    return min > 0 ? `${min}分${sec}秒` : `${sec}秒`
})

const selectedScenario = computed(() => scenarios[selectedScenarioIndex.value])

const selectedScenarioDescription = computed(() =>
    `后端生成 ${selectedScenario.value.variableCount.toLocaleString()} 个变量，每隔 ${selectedScenario.value.updateIntervalMs}ms 向页面批量推送一次。前端每隔 ${writeIntervalMs.value}ms 随机更改一个变量并写回后端。`
)

const customDescriptions = computed(() => [
    `变量：后端模拟生成的变量数量，数量越多，页面渲染和数据同步压力越大。`,
    `推送：后端向前端推送一轮变量数据的间隔，数值越小，推送越频繁。`,
    `写入：前端向后端写入一个变量值的间隔，用来模拟用户修改参数。`,
    `批量：开启后会把一轮变量合并成一条消息推送，关闭后逐个变量推送。`,
])

function handleStart() {
    const cfg = getConfig()
    emit('start', cfg)
}

function handleStop() {
    emit('stop')
}

function handleApply() {
    const cfg = getConfig()
    emit('updateConfig', cfg)
}

function getConfig() {
    if (props.mode === 'custom') {
        return {
            variableCount: variableCount.value,
            updateIntervalMs: updateIntervalMs.value,
            writeIntervalMs: writeIntervalMs.value,
            useBatchMode: useBatchMode.value,
        }
    }
    const s = scenarios[selectedScenarioIndex.value]
    return {
        variableCount: s.variableCount,
        updateIntervalMs: s.updateIntervalMs,
        writeIntervalMs: writeIntervalMs.value,
        useBatchMode: true,
    }
}

function handleRunScenario(i: number) {
    selectedScenarioIndex.value = i
    const s = scenarios[i]
    emit('start', {
        variableCount: s.variableCount,
        updateIntervalMs: s.updateIntervalMs,
        writeIntervalMs: writeIntervalMs.value,
        useBatchMode: true,
    })
}
</script>

<template>
    <div class="control-panel">
        <!-- 基准测试进度（运行中显示） -->
        <template v-if="benchmarkRunning">
            <div class="bench-progress">
                <div class="bp-header">
                    <span class="bp-title">基准测试运行中</span>
                    <span class="scenario-badge">{{ benchmarkProgress.current }}/{{ benchmarkProgress.total }}</span>
                </div>
                <div class="bp-label">{{ benchmarkProgress.label }}</div>
                <div class="bp-phase">
                    {{ benchmarkProgress.phase === 'warmup' ? '预热中' : '采集中' }}
                    · 剩余 {{ benchmarkProgress.secondsLeft }}s
                </div>
                <div class="progress-bar-track">
                    <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }" />
                </div>
                <div class="bp-meta">{{ progressPercent }}% · 约剩 {{ totalEstimate }} · 总计约{{ Math.ceil(totalBenchmarkSec
                    / 60) }}分</div>
                <button class="btn btn-danger btn-block" @click="$emit('cancelBenchmark')">取消测试</button>
            </div>
        </template>

        <!-- 正常控制 -->
        <template v-else>
            <!-- 模式切换标签 -->
            <div class="mode-tabs">
                <button class="mode-tab" :class="{ active: mode === 'preset' }" @click="$emit('modeChange', 'preset')">
                    预设方案
                </button>
                <button class="mode-tab" :class="{ active: mode === 'custom' }" @click="$emit('modeChange', 'custom')">
                    自定义
                </button>
                <button class="mode-tab" :class="{ active: mode === 'diagnostics' }"
                    @click="$emit('modeChange', 'diagnostics')">
                    诊断测试
                </button>
            </div>

            <!-- 预设方案列表 -->
            <template v-if="mode === 'preset'">
                <div class="ctrl-section">
                    <div class="scenario-list">
                        <label v-for="(s, i) in scenarios" :key="i" class="scenario-item"
                            :class="{ selected: selectedScenarioIndex === i }">
                            <input type="radio" :value="i" v-model="selectedScenarioIndex" name="scenario" />
                            <div class="scenario-info">
                                <span class="scenario-name">{{ s.label }}</span>
                                <span class="scenario-detail">{{ s.desc }}</span>
                            </div>
                            <button class="btn-scenario-run" :disabled="props.running || !connected"
                                @click.stop="handleRunScenario(i)" title="单独运行此方案">▶</button>
                        </label>
                    </div>
                </div>
                <!-- 选中方案的参数摘要 -->
                <div class="ctrl-section params-preview">
                    <div class="preview-heading">
                        <span>{{ selectedScenario.label }}</span>
                        <strong>{{ selectedScenario.desc }}</strong>
                    </div>
                    <div class="preview-description">
                        {{ selectedScenarioDescription }}
                    </div>
                </div>
            </template>

            <!-- 自定义参数 -->
            <template v-else-if="mode === 'custom'">
                <div class="ctrl-section">
                    <div class="param-row">
                        <span class="param-label">变量</span>
                        <input type="range" v-model.number="variableCount" min="1" max="10000" step="1"
                            class="param-slider" />
                        <input type="number" v-model.number="variableCount" min="1" max="10000" class="param-num" />
                    </div>
                    <div class="param-row">
                        <span class="param-label">推送</span>
                        <input type="range" v-model.number="updateIntervalMs" min="5" max="2000" step="5"
                            class="param-slider" />
                        <span class="param-val">{{ updateIntervalMs }}ms</span>
                    </div>
                    <div class="param-row">
                        <span class="param-label">写入</span>
                        <input type="range" v-model.number="writeIntervalMs" min="10" max="1000" step="10"
                            class="param-slider" />
                        <span class="param-val">{{ writeIntervalMs }}ms</span>
                    </div>
                    <div class="param-row">
                        <span class="param-label">批量</span>
                        <label class="toggle-switch">
                            <input type="checkbox" v-model="useBatchMode" />
                            <span class="toggle-knob"></span>
                        </label>
                        <span class="param-val">{{ useBatchMode ? '开' : '关' }}</span>
                    </div>
                    <div class="custom-help">
                        <p v-for="text in customDescriptions" :key="text">{{ text }}</p>
                    </div>
                </div>
            </template>

            <template v-else>
                <div class="ctrl-section diagnostics-preview">
                    <div class="diag-preview-title">SignalR 诊断测试</div>
                    <div class="diag-preview-text">
                        右侧可测试调用延迟、串行吞吐、并发吞吐和 100MB 服务端下行带宽。
                    </div>
                    <div class="diag-preview-grid">
                        <span>延迟</span>
                        <span>吞吐</span>
                        <span>并发</span>
                        <span>带宽</span>
                    </div>
                </div>
            </template>

            <!-- 操作按钮 -->
            <div v-if="mode !== 'diagnostics'" class="ctrl-actions">
                <template v-if="props.running">
                    <button class="btn btn-danger btn-block" @click="handleStop">停止压测</button>
                    <button class="btn btn-outline btn-block btn-sm" @click="handleApply">应用参数</button>
                </template>
                <template v-else>
                    <template v-if="mode === 'preset'">
                        <button class="btn btn-primary btn-block" :disabled="!connected" @click="handleStart">
                            运行选中方案
                        </button>
                        <button class="btn btn-outline btn-block btn-sm" :disabled="!connected"
                            @click="$emit('startBenchmark')">
                            完整基准测试并生成报告
                        </button>
                    </template>
                    <!-- 自定义模式：单个开始 -->
                    <button v-else class="btn btn-primary btn-block" :disabled="!connected" @click="handleStart">
                        开始压测
                    </button>
                </template>
            </div>
        </template>
    </div>
</template>

<style scoped>
.control-panel {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* ---- 模式切换标签 ---- */
.mode-tabs {
    display: flex;
    background: #f3f4f6;
    border-radius: 6px;
    padding: 2px;
    margin-bottom: 16px;
}

.mode-tab {
    flex: 1;
    padding: 6px 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #6b7280;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
}

.mode-tab.active {
    background: #fff;
    color: #1f2937;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.mode-tab:hover:not(.active) {
    color: #374151;
}

/* ---- 区块划分 ---- */
.ctrl-section {
    margin-bottom: 18px;
    padding-bottom: 16px;
    border-bottom: 1px solid #eef0f2;
}

.ctrl-section:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.ctrl-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #6b7280;
    margin-bottom: 10px;
}

/* ---- 方案列表 ---- */
.scenario-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.scenario-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s;
    border: 1px solid transparent;
}

.scenario-item:hover {
    background: #f3f4f6;
}

.scenario-item.selected {
    background: #eff6ff;
    border-color: #bfdbfe;
}

.scenario-item input[type='radio'] {
    accent-color: #2563eb;
    flex-shrink: 0;
}

.btn-scenario-run {
    margin-left: auto;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    color: #374151;
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s;
    opacity: 0.5;
}

.scenario-item:hover .btn-scenario-run,
.scenario-item.selected .btn-scenario-run {
    opacity: 1;
}

.btn-scenario-run:hover:not(:disabled) {
    background: #e5e7eb;
}

.btn-scenario-run:disabled {
    opacity: 0.2;
    cursor: not-allowed;
}

.scenario-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.scenario-name {
    font-size: 13px;
    font-weight: 550;
    color: #1f2937;
}

.scenario-detail {
    font-size: 11px;
    color: #9ca3af;
    white-space: nowrap;
}

/* ---- 参数行 ---- */
.param-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}

.param-label {
    font-size: 12px;
    color: #6b7280;
    min-width: 34px;
    flex-shrink: 0;
}

.param-slider {
    flex: 1;
    accent-color: #2563eb;
    height: 4px;
}

.param-num {
    width: 62px;
    padding: 3px 6px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #1f2328;
    font-size: 12px;
    text-align: center;
}

.param-val {
    font-size: 12px;
    color: #6b7280;
    min-width: 30px;
    text-align: right;
}

/* ---- 参数预览（预设方案下的说明） ---- */
.params-preview {
    padding: 10px 12px;
    background: #f9fafb;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    margin-top: -8px;
}

.preview-heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
}

.preview-heading span {
    font-size: 12px;
    font-weight: 700;
    color: #111827;
}

.preview-heading strong {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
}

.preview-description {
    color: #4b5563;
    font-size: 12px;
    line-height: 1.65;
}

.custom-help {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
    padding: 10px 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
}

.custom-help p {
    color: #4b5563;
    font-size: 12px;
    line-height: 1.55;
}

.diagnostics-preview {
    padding: 12px;
    background: #f6f8fa;
    border-radius: 6px;
    border: 1px solid #d8dee4;
}

.diag-preview-title {
    font-size: 13px;
    font-weight: 700;
    color: #1f2328;
    margin-bottom: 6px;
}

.diag-preview-text {
    font-size: 12px;
    line-height: 1.55;
    color: #57606a;
    margin-bottom: 10px;
}

.diag-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}

.diag-preview-grid span {
    padding: 5px 8px;
    text-align: center;
    background: #fff;
    border: 1px solid #d8dee4;
    border-radius: 5px;
    color: #374151;
    font-size: 12px;
    font-weight: 650;
}

/* ---- 开关 ---- */
.toggle-switch {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 18px;
    cursor: pointer;
}

.toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.toggle-knob {
    position: absolute;
    inset: 0;
    background: #d1d5db;
    border-radius: 18px;
    transition: background 0.2s;
}

.toggle-knob::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    left: 2px;
    top: 2px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
}

.toggle-switch input:checked+.toggle-knob {
    background: #2563eb;
}

.toggle-switch input:checked+.toggle-knob::after {
    transform: translateX(14px);
}

/* ---- 操作按钮 ---- */
.ctrl-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
}

/* ---- 通用按钮 ---- */
.btn {
    padding: 8px 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f3f4f6;
    color: #374151;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
    font-family: inherit;
}

.btn:hover {
    background: #e5e7eb;
}

.btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.btn-sm {
    padding: 5px 10px;
    font-size: 12px;
}

.btn-block {
    display: block;
    width: 100%;
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

.btn-outline {
    background: transparent;
}

/* ---- 基准测试进度 ---- */
.bench-progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.bp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.bp-title {
    font-size: 14px;
    font-weight: 650;
    color: #1f2937;
}

.bp-label {
    font-size: 13px;
    color: #374151;
}

.bp-phase {
    font-size: 12px;
    color: #6b7280;
}

.bp-meta {
    font-size: 11px;
    color: #9ca3af;
}

.scenario-badge {
    padding: 2px 8px;
    background: #6f42c1;
    color: #fff;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
}

.progress-bar-track {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #6f42c1, #8b5cf6);
    border-radius: 4px;
    transition: width 0.5s ease;
}
</style>
