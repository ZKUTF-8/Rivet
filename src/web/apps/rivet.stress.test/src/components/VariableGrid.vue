<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
    variables: Record<string, any>
}>()

const search = ref('')
const pageSize = ref(50)
const currentPage = ref(0)

const allEntries = computed(() => Object.entries(props.variables))

const entries = computed(() => {
    if (search.value) {
        const q = search.value.toLowerCase()
        return allEntries.value.filter(([key]) => key.toLowerCase().includes(q))
    }
    return allEntries.value
})

const totalPages = computed(() => Math.ceil(entries.value.length / pageSize.value))

const countText = computed(() => {
    if (!search.value) return entries.value.length.toLocaleString()
    return `${entries.value.length.toLocaleString()} / ${allEntries.value.length.toLocaleString()}`
})

const emptyText = computed(() => {
    if (search.value) return '没有匹配的变量'
    return '暂无变量数据'
})

watch(search, () => {
    currentPage.value = 0
})

watch([entries, pageSize], () => {
    const maxPage = Math.max(0, totalPages.value - 1)
    if (currentPage.value > maxPage) {
        currentPage.value = maxPage
    }
}, { flush: 'sync' })

const pagedEntries = computed(() => {
    const start = currentPage.value * pageSize.value
    return entries.value.slice(start, start + pageSize.value)
})

const typeInfo: Record<number, { label: string; color: string }> = {
    0: { label: '温度', color: '#f47067' },
    1: { label: '压力', color: '#58a6ff' },
    2: { label: '位置', color: '#3fb950' },
    3: { label: '计数', color: '#d29922' },
    4: { label: '文本', color: '#a371f7' },
    5: { label: '数组', color: '#f778ba' },
    6: { label: '设备', color: '#79c0ff' },
}

function formatValue(val: any): string {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'number') return val.toFixed(2)
    if (typeof val === 'string') return val.length > 24 ? val.substring(0, 24) + '…' : val
    if (Array.isArray(val)) {
        const preview = val.slice(0, 2).map((x: any) => typeof x === 'number' ? x.toFixed(1) : x).join(', ')
        return `[${val.length}] ${preview}${val.length > 2 ? ', …' : ''}`
    }
    if (typeof val === 'object') {
        const kvs = Object.entries(val).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(1) : v}`).join(', ')
        return `{${kvs}${Object.keys(val).length > 2 ? ', …' : ''}}`
    }
    return String(val)
}
</script>

<template>
    <div class="vg">
        <div class="vg-hd">
            <span class="vg-title">变量列表 <span class="vg-count">{{ countText }}</span></span>
            <input v-model="search" type="text" placeholder="搜索…" class="vg-search" />
        </div>

        <div class="vg-body">
            <div class="vg-grid">
                <div v-for="[key, v] in pagedEntries" :key="key" class="vg-card">
                    <span class="dot" :style="{ background: typeInfo[v.type]?.color ?? '#8b949e' }"
                        :title="typeInfo[v.type]?.label ?? '未知'"></span>
                    <span class="vg-card-name">{{ key }}</span>
                    <span class="vg-card-val">{{ formatValue(v.value) }}</span>
                    <span class="vg-card-upd">{{ v.updateCount?.toLocaleString() ?? 0 }}次</span>
                </div>
                <div v-if="pagedEntries.length === 0" class="vg-empty">
                    {{ emptyText }}
                </div>
            </div>
        </div>

        <div v-if="totalPages > 1" class="vg-pg">
            <button class="vg-btn" :disabled="currentPage === 0" @click="currentPage--">‹</button>
            <span class="vg-pg-info">{{ currentPage + 1 }} / {{ totalPages }}</span>
            <button class="vg-btn" :disabled="currentPage >= totalPages - 1" @click="currentPage++">›</button>
        </div>
    </div>
</template>

<style scoped>
.vg {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.vg-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 0;
}

.vg-title {
    font-size: 14px;
    font-weight: 600;
    color: #1f2328;
}

.vg-count {
    font-weight: 400;
    color: #656d76;
    font-size: 12px;
    margin-left: 4px;
}

.vg-search {
    padding: 4px 10px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    color: #1f2328;
    font-size: 12px;
    width: 130px;
    outline: none;
}

.vg-search::placeholder {
    color: #9ca3af;
}

.vg-search:focus {
    border-color: #0969da;
}

.vg-body {
    flex: 1;
    overflow: auto;
    padding: 8px 14px 4px;
}

.vg-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
}

.vg-card {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    background: #fafbfc;
    min-width: 0;
}

.vg-card-name {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    color: #0550ae;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 30%;
}

.vg-card-val {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 11px;
    color: #1f2328;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}

.vg-card-upd {
    font-size: 10px;
    color: #9ca3af;
    flex-shrink: 0;
}

.dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.vg-empty {
    grid-column: 1 / -1;
    text-align: center;
    color: #9ca3af;
    padding: 36px 4px;
    font-size: 13px;
}

.vg-pg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 8px 14px;
    border-top: 1px solid #e5e7eb;
    font-size: 12px;
    color: #656d76;
}

.vg-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #374151;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}

.vg-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.vg-btn:hover:not(:disabled) {
    background: #e5e7eb;
}
</style>
