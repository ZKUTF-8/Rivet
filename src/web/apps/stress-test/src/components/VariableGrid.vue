<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
    variables: Record<string, any>
}>()

const search = ref('')
const pageSize = ref(100)
const currentPage = ref(0)

const entries = computed(() => {
    const all = Object.entries(props.variables)
    if (search.value) {
        const q = search.value.toLowerCase()
        return all.filter(([key]) => key.toLowerCase().includes(q))
    }
    return all
})

const totalPages = computed(() => Math.ceil(entries.value.length / pageSize.value))

const pagedEntries = computed(() => {
    const start = currentPage.value * pageSize.value
    return entries.value.slice(start, start + pageSize.value)
})

function typeLabel(type: number): string {
    switch (type) {
        case 0: return '温度'
        case 1: return '压力'
        case 2: return '位置'
        case 3: return '计数'
        case 4: return '文本'
        case 5: return '数组'
        case 6: return '设备'
        default: return '未知'
    }
}

function typeColor(type: number): string {
    switch (type) {
        case 0: return '#f47067'
        case 1: return '#58a6ff'
        case 2: return '#3fb950'
        case 3: return '#d29922'
        case 4: return '#a371f7'
        case 5: return '#f778ba'
        case 6: return '#79c0ff'
        default: return '#8b949e'
    }
}

function formatValue(val: any): string {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'number') return val.toFixed(2)
    if (typeof val === 'string') return val.length > 60 ? val.substring(0, 60) + '…' : val
    if (Array.isArray(val)) {
        const preview = val.slice(0, 3).map((x: any) => typeof x === 'number' ? x.toFixed(1) : x).join(', ')
        return `[${val.length}] ${preview}${val.length > 3 ? ', …' : ''}`
    }
    if (typeof val === 'object') {
        const entries = Object.entries(val)
        const preview = entries.slice(0, 3).map(([k, v]) => `${k}: ${formatBrief(v)}`).join(', ')
        return `{${preview}${entries.length > 3 ? ', …' : ''}}`
    }
    return String(val)
}

function formatBrief(val: any): string {
    if (typeof val === 'number') return val.toFixed(1)
    if (typeof val === 'string') return val.length > 12 ? val.substring(0, 12) + '…' : val
    if (Array.isArray(val)) return `[${val.length}]`
    return String(val)
}
</script>

<template>
    <div class="variable-grid">
        <div class="grid-header">
            <h2>变量列表 ({{ entries.length }})</h2>
            <input v-model="search" type="text" placeholder="搜索变量..." class="search-input" />
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>名称</th>
                        <th>类型</th>
                        <th>当前值</th>
                        <th>更新次数</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="[key, v] in pagedEntries" :key="key">
                        <td class="var-name">{{ key }}</td>
                        <td>
                            <span class="type-tag" :style="{ color: typeColor(v.type) }">
                                {{ typeLabel(v.type) }}
                            </span>
                        </td>
                        <td class="var-value">{{ formatValue(v.value) }}</td>
                        <td class="var-count">{{ v.updateCount?.toLocaleString() ?? 0 }}</td>
                    </tr>
                    <tr v-if="pagedEntries.length === 0">
                        <td colspan="4" class="empty">暂无数据 — 连接服务器并启动压测</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="totalPages > 1" class="pagination">
            <button class="btn-page" :disabled="currentPage === 0" @click="currentPage--">
                上一页
            </button>
            <span>{{ currentPage + 1 }} / {{ totalPages }}</span>
            <button class="btn-page" :disabled="currentPage >= totalPages - 1" @click="currentPage++">
                下一页
            </button>
        </div>
    </div>
</template>

<style scoped>
.variable-grid {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.grid-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

h2 {
    font-size: 16px;
    color: #1f2328;
}

.search-input {
    padding: 6px 12px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    color: #1f2328;
    font-size: 13px;
    width: 200px;
}

.search-input::placeholder {
    color: #9ca3af;
}

.table-container {
    flex: 1;
    overflow: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

thead {
    position: sticky;
    top: 0;
    background: #fff;
}

th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid #d1d5db;
    color: #656d76;
    font-weight: 500;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

td {
    padding: 6px 12px;
    border-bottom: 1px solid #f0f1f3;
}

tr:hover td {
    background: #f5f6f8;
}

.var-name {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    color: #0550ae;
}

.var-value {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    color: #1f2328;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.var-count {
    color: #656d76;
    font-variant-numeric: tabular-nums;
}

.type-tag {
    font-size: 12px;
    font-weight: 500;
}

.empty {
    text-align: center;
    color: #9ca3af;
    padding: 40px 12px;
}

.pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: #656d76;
}

.btn-page {
    padding: 4px 12px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #374151;
    cursor: pointer;
    font-size: 12px;
}

.btn-page:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.btn-page:hover:not(:disabled) {
    background: #e5e7eb;
}
</style>
