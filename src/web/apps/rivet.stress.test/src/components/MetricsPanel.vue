<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    latencies: number[];
    writeLatencies: number[];
    fps: number;
    variableCount: number;
    batchCount: number;
    running: boolean;
    elapsedSeconds: number;
    scenarioDesc: string;
    estimatedTotalSec?: number;
    manualTotalSec?: number;
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
const jitter = computed(() => {
    if (props.latencies.length < 5) return 0;
    // 取最近 20 个样本的波动范围
    const recent = props.latencies.slice(-20);
    return Math.max(...recent) - Math.min(...recent);
});

const avgWriteLatency = computed(() => {
    if (props.writeLatencies.length === 0) return 0;
    return Math.round(props.writeLatencies.reduce((a, b) => a + b, 0) / props.writeLatencies.length);
});
const p95WriteLatency = computed(() => calcPercentile(props.writeLatencies, 0.95));

const totalSec = computed(() => props.estimatedTotalSec || props.manualTotalSec || 0);

const elapsedStr = computed(() => {
    return formatDuration(props.elapsedSeconds);
});

const totalStr = computed(() => {
    return totalSec.value > 0 ? formatDuration(totalSec.value) : "";
});

function latencyColor(ms: number): string {
    if (ms < 20) return "#3fb950";
    if (ms < 50) return "#d29922";
    if (ms < 100) return "#db6d28";
    return "#f85149";
}

function formatDuration(seconds: number): string {
    const normalized = Math.max(0, Math.floor(seconds));
    const m = Math.floor(normalized / 60);
    const s = normalized % 60;
    return m > 0 ? `${m}m${s}s` : `${s}s`;
}
</script>

<template>
    <div class="metrics-bar">
        <!-- 左侧：方案描述 + 运行时间 -->
        <div class="mb-left">
            <div class="mb-scenario">
                <svg class="mb-icon" viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                    <path
                        d="M8 1a.75.75 0 0 1 .75.75V5.3l2.84-1.64a.75.75 0 1 1 .74 1.3L9.5 6.61v2.77l2.83 1.63a.75.75 0 1 1-.73 1.31L8.75 10.7v3.54a.75.75 0 0 1-1.5 0V10.7l-2.82 1.63a.75.75 0 1 1-.73-1.31L6.5 9.38V6.61L3.66 4.96a.75.75 0 1 1 .74-1.3L7.25 5.3V1.75A.75.75 0 0 1 8 1Z" />
                </svg>
                <span class="mb-desc">{{ scenarioDesc || '等待启动…' }}</span>
            </div>
            <div v-if="running" class="mb-elapsed">
                <span class="mb-dot pulse"></span>
                {{ elapsedStr }}{{ totalStr ? ' / ' + totalStr : '' }}
            </div>
        </div>

        <!-- 右侧：指标分组 -->
        <div class="mb-right">
            <!-- 推送延迟 -->
            <div class="mb-group">
                <span class="mb-label">推送延迟</span>
                <span class="mb-item" :style="{ color: latencyColor(avgLatency) }">平均 {{ avgLatency }}ms</span>
                <span class="mb-item muted">95%≤{{ p95Latency }}ms</span>
                <span class="mb-item" :style="{ color: latencyColor(jitter) }">波动±{{ jitter }}ms</span>
            </div>
            <div class="mb-divider"></div>
            <!-- 写入延迟 -->
            <div class="mb-group">
                <span class="mb-label">写入延迟</span>
                <span class="mb-item" :style="{ color: latencyColor(avgWriteLatency) }">平均 {{ avgWriteLatency
                    }}ms</span>
                <span class="mb-item muted">95%≤{{ p95WriteLatency }}ms</span>
            </div>
            <div class="mb-divider"></div>
            <!-- 吞吐量 -->
            <div class="mb-group">
                <span class="mb-label">推送速度</span>
                <span class="mb-item">{{ fps }} 轮/秒</span>
            </div>
            <div class="mb-divider"></div>
            <!-- 统计 -->
            <div class="mb-group">
                <span class="mb-label">总批次数</span>
                <span class="mb-item">{{ batchCount.toLocaleString() }}</span>
            </div>
            <div class="mb-divider"></div>
            <div class="mb-group">
                <span class="mb-label">变量数</span>
                <span class="mb-item">{{ variableCount }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.metrics-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 0 14px;
    height: 48px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
    overflow: hidden;
}

.mb-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 360px;
    min-width: 0;
    white-space: nowrap;
}

.mb-scenario {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
}

.mb-icon {
    color: #6366f1;
    flex-shrink: 0;
}

.mb-desc {
    font-size: 12px;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 360px;
}

.mb-elapsed {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: #6366f1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
}

.mb-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6366f1;
}

.mb-dot.pulse {
    animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.3;
    }
}

.mb-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: nowrap;
    gap: 0;
    overflow-x: auto;
    flex: 2 1 560px;
    min-width: 420px;
}

.mb-group {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    padding: 0 8px;
}

.mb-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #9ca3af;
}

.mb-item {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #1f2937;
}

.mb-item.muted {
    color: #9ca3af;
    font-weight: 500;
}

.mb-divider {
    width: 1px;
    height: 20px;
    background: #e5e7eb;
    flex-shrink: 0;
}

@media (max-width: 900px) {
    .metrics-bar {
        flex-direction: column;
    }

    .mb-right {
        justify-content: flex-start;
        min-width: 0;
        width: 100%;
    }

    .mb-divider {
        display: none;
    }
}
</style>
