import { safeStorage } from './safeStorage'

import { api, API_PATHS } from './api'

export type MemoryType = 'episodic_memory' | 'profile' | 'agent_case' | 'agent_skill' | 'foresight' | 'event_log'

export interface MemoryItem {
    memory_id?: string
    content: string
    raw_content?: string | null
    type: string
    group_id?: string | null
    timestamp?: number | null
    role?: string | null
    sender_name?: string | null
}

export interface MemoryListResponse {
    memory_type: MemoryType
    page: number
    page_size: number
    items: MemoryItem[]
    count: number
}

export function isEvermemConfigured(): boolean {
    if (safeStorage.get('evermem_enabled') !== 'true') return false
    const key = safeStorage.get('evermem_key') || ''
    return isEvermemSelfHosted() || Boolean(key)
}

export function isEvermemSelfHosted(): boolean {
    const url = safeStorage.get('evermem_url') || ''
    return url.trim() !== '' && !url.toLowerCase().includes('evermind.ai')
}

export async function listMemoriesApi(
    memoryType: MemoryType,
    page: number,
    pageSize: number,
    groupId?: string | null,
): Promise<MemoryListResponse> {
    const params = new URLSearchParams({
        memory_type: memoryType,
        page: String(page),
        page_size: String(pageSize),
    })
    if (groupId) params.set('group_id', groupId)

    return api.get<MemoryListResponse>(`${API_PATHS.AI_MEMORIES_LIST}?${params.toString()}`)
}

export async function deleteMemoryApi(
    memoryId: string,
): Promise<{ success: boolean; memory_id: string }> {
    return api.delete<{ success: boolean; memory_id: string }>(API_PATHS.AI_MEMORY_DELETE(memoryId))
}

export async function clearMemoriesApi(
    groupId?: string | null,
): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(API_PATHS.AI_MEMORIES_CLEAR, { group_id: groupId ?? null })
}
