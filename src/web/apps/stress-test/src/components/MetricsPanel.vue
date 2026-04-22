<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    latencies: number[];
    writeLatencies: number[];
    fps: number;
    variableCount: number;
    batchCount: number;
}>();

function calcPercentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

const avgLatency = computed(() => {
    if (props.latencies.length === 0) return 0;
    return Math.round(props.latencies.reduce((a, b) => a + b, 0) / props.latencies.length);
});
const p95Latency = computed(() => calcPercentile(props.latencies, 0.95));
const p99Latency = computed(() => calcPercentile(props.latencies, 0.99));
const maxLatency = computed(() => {
    if (props.latencies.length === 0) return 0;
    return Math.max(...props.latencies);
});

const avgWriteLatency = computed(() => {
    if (props.writeLatencies.length === 0) return 0;
    return Math.round(props.writeLatencies.reduce((a, b) => a + b, 0) / props.writeLatencies.length);
});
const p95WriteLatency = computed(() => calcPercentile(props.writeLatencies, 0.95));

const throughput = computed(() => props.fps * props.variableCount);

function getLatencyColor(ms: number): string {
    if (ms < 20) return "#3fb950";
    if (ms < 50) return "#d29922";
    if (ms < 100) return "#db6d28";
    return "#f85149";
}

function getFpsColor(fps: number): string {
    if (fps >= 30) return "#3fb950";
    if (fps >= 15) return "#d29922";
    return "#f85149";
}
</script>

<template>
    <div class="metrics-panel">
        <h2>性能指标</h2>

        <h3>推送延迟（后端 → 前端）</h3>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">平均延迟</div>
                <div class="metric-value" :style="{ color: getLatencyColor(avgLatency) }">
                    {{ avgLatency }}<span class="metric-unit">ms</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">P95 延迟</div>
                <div class="metric-value" :style="{ color: getLatencyColor(p95Latency) }">
                    {{ p95Latency }}<span class="metric-unit">ms</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">P99 延迟</div>
                <div class="metric-value" :style="{ color: getLatencyColor(p99Latency) }">
                    {{ p99Latency }}<span class="metric-unit">ms</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">最大延迟</div>
                <div class="metric-value" :style="{ color: getLatencyColor(maxLatency) }">
                    {{ maxLatency }}<span class="metric-unit">ms</span>
                </div>
            </div>
        </div>

        <h3>写入延迟（前端 → 后端 往返）</h3>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">平均 RTT</div>
                <div class="metric-value" :style="{ color: getLatencyColor(avgWriteLatency) }">
                    {{ avgWriteLatency }}<span class="metric-unit">ms</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">P95 RTT</div>
                <div class="metric-value" :style="{ color: getLatencyColor(p95WriteLatency) }">
                    {{ p95WriteLatency }}<span class="metric-unit">ms</span>
                </div>
            </div>
        </div>

        <h3>吞吐量</h3>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">更新帧率</div>
                <div class="metric-value" :style="{ color: getFpsColor(fps) }">
                    {{ fps }}<span class="metric-unit">fps</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">变量数</div>
                <div class="metric-value">{{ variableCount }}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">变量吞吐量</div>
                <div class="metric-value">
                    {{ throughput.toLocaleString() }}<span class="metric-unit">/s</span>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">总批次数</div>
                <div class="metric-value">{{ batchCount.toLocaleString() }}</div>
            </div>
        </div>

        <div class="latency-bar">
            <h3>推送延迟分布（最近 {{ latencies.length }} 条）</h3>
            <div class="bar-container">
                <div v-for="(l, i) in latencies.slice(-100)" :key="i" class="bar" :style="{
                    height: Math.min(l, 200) / 2 + 'px',
                    backgroundColor: getLatencyColor(l),
                }" :title="`${l}ms`" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.metrics-panel {
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
    margin-top: 16px;
}

h3:first-of-type {
    margin-top: 0;
}

.metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 4px;
}

.metric-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
}

.metric-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #656d76;
    margin-bottom: 4px;
}

.metric-value {
    font-size: 24px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #1f2328;
}

.metric-unit {
    font-size: 12px;
    font-weight: 400;
    color: #656d76;
    margin-left: 2px;
}

.latency-bar {
    border-top: 1px solid #e5e7eb;
    padding-top: 16px;
    margin-top: 12px;
}

.bar-container {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 100px;
    background: #f3f4f6;
    border-radius: 4px;
    padding: 4px;
    overflow: hidden;
}

.bar {
    flex: 1;
    min-width: 2px;
    border-radius: 1px 1px 0 0;
    transition: height 0.1s ease;
}
</style>
