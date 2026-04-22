<script setup lang="ts">
import { computed } from 'vue'
import type { BenchmarkResult } from '../App.vue'

const props = defineProps<{
    results: BenchmarkResult[]
    protocol: string
}>()

defineEmits<{ close: [] }>()

const recommendation = computed(() => {
    let lastOptimal = -1
    let lastAcceptable = -1
    for (let i = 0; i < props.results.length; i++) {
        const r = props.results[i]
        if (r.avgLatency < 20 && r.avgFps >= 10) lastOptimal = i
        if (r.avgLatency < 50 && r.avgFps >= 5) lastAcceptable = i
    }
    return {
        optimal: lastOptimal >= 0 ? props.results[lastOptimal] : null,
        acceptable: lastAcceptable >= 0 ? props.results[lastAcceptable] : null,
    }
})

const testDate = new Date().toLocaleString('zh-CN')

function latencyClass(ms: number): string {
    if (ms < 20) return 'cell-good'
    if (ms < 50) return 'cell-ok'
    if (ms < 100) return 'cell-warn'
    return 'cell-bad'
}

function fpsClass(fps: number): string {
    if (fps >= 30) return 'cell-good'
    if (fps >= 15) return 'cell-ok'
    if (fps >= 5) return 'cell-warn'
    return 'cell-bad'
}

function exportTSV() {
    const header = '场景\t变量数\t间隔(ms)\t平均延迟(ms)\tP95(ms)\tP99(ms)\t最大(ms)\t帧率(fps)\t吞吐量(/s)\t批次数'
    const rows = props.results.map(r =>
        [r.scenario.label, r.scenario.variableCount, r.scenario.updateIntervalMs,
            r.avgLatency, r.p95Latency, r.p99Latency, r.maxLatency,
            r.avgFps, r.throughput, r.totalBatches].join('\t')
    )
    const text = [header, ...rows].join('\n')
    navigator.clipboard.writeText(text)
    alert('已复制到剪贴板（TSV 格式，可粘贴到 Excel）')
}
</script>

<template>
    <div class="report">
        <div class="report-header">
            <div>
                <h2>基准测试报告</h2>
                <div class="report-meta">
                    协议: <strong>{{ protocol.toUpperCase() }}</strong>
                    · 场景数: <strong>{{ results.length }}</strong>
                    · 测试时间: {{ testDate }}
                </div>
            </div>
            <div class="report-actions">
                <button class="btn btn-sm" @click="exportTSV">复制数据</button>
                <button class="btn btn-sm btn-primary" @click="$emit('close')">关闭报告</button>
            </div>
        </div>

        <!-- 性能评估 -->
        <div class="summary">
            <h3>性能评估</h3>
            <div v-if="recommendation.optimal" class="summary-card optimal">
                <div class="summary-icon">●</div>
                <div>
                    <strong>最佳方案</strong>（平均延迟 &lt; 20ms，帧率 ≥ 10fps）
                    <div class="summary-detail">
                        {{ recommendation.optimal.scenario.label }} —
                        {{ recommendation.optimal.scenario.variableCount }} 个变量，
                        {{ recommendation.optimal.scenario.updateIntervalMs }}ms 间隔，
                        平均延迟 {{ recommendation.optimal.avgLatency }}ms，
                        帧率 {{ recommendation.optimal.avgFps }}fps
                    </div>
                </div>
            </div>
            <div v-if="recommendation.acceptable && recommendation.acceptable !== recommendation.optimal"
                class="summary-card acceptable">
                <div class="summary-icon">●</div>
                <div>
                    <strong>可接受上限</strong>（平均延迟 &lt; 50ms，帧率 ≥ 5fps）
                    <div class="summary-detail">
                        {{ recommendation.acceptable.scenario.label }} —
                        {{ recommendation.acceptable.scenario.variableCount }} 个变量，
                        {{ recommendation.acceptable.scenario.updateIntervalMs }}ms 间隔，
                        平均延迟 {{ recommendation.acceptable.avgLatency }}ms，
                        帧率 {{ recommendation.acceptable.avgFps }}fps
                    </div>
                </div>
            </div>
            <div v-if="!recommendation.optimal && !recommendation.acceptable" class="summary-card bad">
                <div class="summary-icon">●</div>
                <div>
                    <strong>所有场景均超标</strong>
                    <div class="summary-detail">建议检查网络环境或降低更新频率。</div>
                </div>
            </div>
        </div>

        <!-- 详细数据 -->
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>场景</th>
                        <th class="num">变量数</th>
                        <th class="num">间隔</th>
                        <th class="num">平均延迟</th>
                        <th class="num">P95</th>
                        <th class="num">P99</th>
                        <th class="num">最大延迟</th>
                        <th class="num">帧率</th>
                        <th class="num">吞吐量</th>
                        <th class="num">批次数</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="r in results" :key="r.scenario.label">
                        <td class="scenario-name">{{ r.scenario.label }}</td>
                        <td class="num">{{ r.scenario.variableCount }}</td>
                        <td class="num">{{ r.scenario.updateIntervalMs }}ms</td>
                        <td class="num" :class="latencyClass(r.avgLatency)">{{ r.avgLatency }}ms</td>
                        <td class="num" :class="latencyClass(r.p95Latency)">{{ r.p95Latency }}ms</td>
                        <td class="num" :class="latencyClass(r.p99Latency)">{{ r.p99Latency }}ms</td>
                        <td class="num" :class="latencyClass(r.maxLatency)">{{ r.maxLatency }}ms</td>
                        <td class="num" :class="fpsClass(r.avgFps)">{{ r.avgFps }}</td>
                        <td class="num">{{ r.throughput.toLocaleString() }}/s</td>
                        <td class="num">{{ r.totalBatches.toLocaleString() }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- 图例 -->
        <div class="legend">
            <span class="legend-item"><span class="dot good" />优秀（&lt;20ms / ≥30fps）</span>
            <span class="legend-item"><span class="dot ok" />良好（&lt;50ms / ≥15fps）</span>
            <span class="legend-item"><span class="dot warn" />警告（&lt;100ms / ≥5fps）</span>
            <span class="legend-item"><span class="dot bad" />超标（≥100ms / &lt;5fps）</span>
        </div>
    </div>
</template>

<style scoped>
.report {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
}

h2 {
    font-size: 18px;
    color: #1f2328;
    margin-bottom: 4px;
}

h3 {
    font-size: 14px;
    color: #1f2328;
    margin-bottom: 12px;
}

.report-meta {
    font-size: 13px;
    color: #656d76;
}

.report-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

/* 性能评估 */
.summary {
    margin-bottom: 20px;
}

.summary-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 8px;
    font-size: 13px;
    line-height: 1.6;
}

.summary-card.optimal {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
}

.summary-card.optimal .summary-icon {
    color: #16a34a;
}

.summary-card.acceptable {
    background: #fffbeb;
    border: 1px solid #fde68a;
}

.summary-card.acceptable .summary-icon {
    color: #d97706;
}

.summary-card.bad {
    background: #fef2f2;
    border: 1px solid #fecaca;
}

.summary-card.bad .summary-icon {
    color: #dc2626;
}

.summary-detail {
    color: #656d76;
    font-size: 12px;
}

/* 表格 */
.table-wrapper {
    overflow-x: auto;
    margin-bottom: 16px;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    white-space: nowrap;
}

thead {
    background: #f9fafb;
}

th {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 2px solid #d1d5db;
    color: #656d76;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

th.num,
td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
}

td {
    padding: 10px 12px;
    border-bottom: 1px solid #f0f1f3;
}

.scenario-name {
    font-weight: 500;
    color: #1f2328;
}

tr:hover td {
    background: #f5f6f8;
}

/* 颜色编码 */
.cell-good {
    color: #16a34a;
    font-weight: 600;
}

.cell-ok {
    color: #d97706;
    font-weight: 600;
}

.cell-warn {
    color: #ea580c;
    font-weight: 600;
}

.cell-bad {
    color: #dc2626;
    font-weight: 700;
    background: #fef2f2;
}

/* 图例 */
.legend {
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: #656d76;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.dot.good {
    background: #16a34a;
}

.dot.ok {
    background: #d97706;
}

.dot.warn {
    background: #ea580c;
}

.dot.bad {
    background: #dc2626;
}

/* 通用按钮 */
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

.btn-sm {
    padding: 6px 12px;
    font-size: 12px;
}

.btn-primary {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
}

.btn-primary:hover {
    background: #1d4ed8;
}
</style>
