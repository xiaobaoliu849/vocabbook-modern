export interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    attachments?: Attachment[]
    timestamp: number
    memoriesUsed?: number
    memorySaved?: boolean
    reasoningContent?: string
}

export interface Attachment {
    id: string
    name: string
    dataUrl?: string
    mediaType: string
    size: number
    objectKey?: string
    fileType?: 'image' | 'document'
    ext?: string
    file?: File
}

export interface ChatSession {
    id: string
    title: string
    messages: Message[]
    updatedAt: number
    createdAt: number
}

export interface MemoryOverview {
    enabled: boolean
    requested: boolean
    requires_auth: boolean
    available: boolean
    profile_facts: string[]
    recent_memories: Array<{
        content: string
        timestamp?: string
        bucket: 'chat' | 'review' | string
    }>
    review_focus: {
        due_count: number
        difficult_count: number
        weak_words: Array<{
            word: string
            meaning: string
            error_count: number
            easiness: number
            is_due: boolean
        }>
    }
    foresights?: Array<{
        content: string
        timestamp?: string
        memory_id?: string
    }>
    suggestions: string[]
}
