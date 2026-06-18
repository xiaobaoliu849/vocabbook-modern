import { API_BASE_URL, API_PATHS, getClientId, getOwnerTokenHeaders } from './api'

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

export function buildEvermemHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        'X-Client-Id': getClientId(),
        ...getOwnerTokenHeaders(),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const enabled = localStorage.getItem('evermem_enabled') === 'true'
    headers['X-EverMem-Enabled'] = enabled ? 'true' : 'false'
    if (enabled) {
        const url = localStorage.getItem('evermem_url')
        const key = localStorage.getItem('evermem_key')
        if (url) headers['X-EverMem-Url'] = url
        if (key) headers['X-EverMem-Key'] = key
    }
    return headers
}

export function isEvermemConfigured(): boolean {
    if (localStorage.getItem('evermem_enabled') !== 'true') return false
    const key = localStorage.getItem('evermem_key') || ''
    return isEvermemSelfHosted() || Boolean(key)
}

export function isEvermemSelfHosted(): boolean {
    const url = localStorage.getItem('evermem_url') || ''
    return url.trim() !== '' && !url.toLowerCase().includes('evermind.ai')
}

export async function listMemoriesApi(
    token: string | null,
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

    const resp = await fetch(`${API_BASE_URL}${API_PATHS.AI_MEMORIES_LIST}?${params.toString()}`, {
        method: 'GET',
        headers: buildEvermemHeaders(token),
    })
    if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`list memories failed (${resp.status}): ${text || resp.statusText}`)
    }
    return resp.json() as Promise<MemoryListResponse>
}

export async function deleteMemoryApi(
    token: string | null,
    memoryId: string,
): Promise<{ success: boolean; memory_id: string }> {
    const resp = await fetch(`${API_BASE_URL}${API_PATHS.AI_MEMORY_DELETE(memoryId)}`, {
        method: 'DELETE',
        headers: buildEvermemHeaders(token),
    })
    if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`delete memory failed (${resp.status}): ${text || resp.statusText}`)
    }
    return resp.json() as Promise<{ success: boolean; memory_id: string }>
}

export async function clearMemoriesApi(
    token: string | null,
    groupId?: string | null,
): Promise<{ success: boolean }> {
    const resp = await fetch(`${API_BASE_URL}${API_PATHS.AI_MEMORIES_CLEAR}`, {
        method: 'POST',
        headers: {
            ...buildEvermemHeaders(token),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ group_id: groupId ?? null }),
    })
    if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`clear memories failed (${resp.status}): ${text || resp.statusText}`)
    }
    return resp.json() as Promise<{ success: boolean }>
}
