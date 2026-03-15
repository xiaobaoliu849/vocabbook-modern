import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Trash2, Brain, Sparkles, Plus, MessageSquare, Menu, Edit2, MoreHorizontal, Eraser, ChevronRight } from 'lucide-react'
import { API_PATHS, API_BASE_URL, getClientId } from '../utils/api'
import AudioButton from '../components/AudioButton'
import EvermemLogo from '../assets/evermind-powered.svg'
import { useAuth } from '../context/AuthContext'

const generateId = () => {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
};

const CHAT_SCOPE_SEPARATOR = '::'

const normalizeScopeValue = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return normalized || 'guest'
}

const resolveChatScope = (token?: string | null) => {
    if (!token) return 'guest'

    try {
        const payload = token.split('.')[1]
        if (!payload) return 'guest'
        const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/')
        const decoded = JSON.parse(atob(padded))
        const sub = typeof decoded?.sub === 'string' ? decoded.sub.trim() : ''
        if (!sub) return 'guest'
        return `cloud_${normalizeScopeValue(sub)}`
    } catch {
        return 'guest'
    }
}

const getScopedStorageKey = (scope: string) => `chat_sessions_${scope}`
const buildScopedSessionId = (scope: string) => `${scope}${CHAT_SCOPE_SEPARATOR}${generateId()}`
const isSessionInScope = (sessionId: string, scope: string) => sessionId.startsWith(`${scope}${CHAT_SCOPE_SEPARATOR}`)
const DEFAULT_NEW_CHAT_TITLE = '__NEW_CHAT__'
const LEGACY_NEW_CHAT_TITLE = 'New Chat'
const LEGACY_MIGRATED_CHAT_TITLE = 'Migrated Chat'
const isDefaultNewChatTitle = (title: string) => title === DEFAULT_NEW_CHAT_TITLE || title === LEGACY_NEW_CHAT_TITLE

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    memoriesUsed?: number
    memorySaved?: boolean
    reasoningContent?: string
}

interface ChatSession {
    id: string
    title: string
    messages: Message[]
    updatedAt: number
    createdAt: number
}

export default function AIChat({ isActive }: { isActive?: boolean }) {
    const { t } = useTranslation()
    const { token } = useAuth()
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [isInitialized, setIsInitialized] = useState(false)
    const [chatScope, setChatScope] = useState(() => resolveChatScope(token))
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const wasActiveRef = useRef(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Config state
    const [provider, setProvider] = useState('')
    const [model, setModel] = useState('')
    const [evermemEnabled, setEvermemEnabled] = useState(false)

    // Memory activity toast
    const [memoryToast, setMemoryToast] = useState<string | null>(null)
    const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})

    const getCommonHeaders = () => {
        const headers: Record<string, string> = {
            'X-Client-Id': getClientId()
        }
        if (token) headers['Authorization'] = `Bearer ${token}`
        return headers
    }

    // Load sessions from API and fallback to local storage (scoped by current auth user)
    useEffect(() => {
        let cancelled = false
        const loadInitialData = async () => {
            let loadedSessions: ChatSession[] = []
            let loadedFromFallback = false

            setIsInitialized(false)
            setSessions([])
            setActiveSessionId(null)

            try {
                // Try to load from Backend API
                const response = await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSIONS}`, {
                    headers: getCommonHeaders()
                })
                if (response.ok) {
                    const dbSessions = await response.json()
                    if (Array.isArray(dbSessions) && dbSessions.length > 0) {
                        loadedSessions = dbSessions.filter((s: ChatSession) => isSessionInScope(s.id, chatScope))
                    }
                }
            } catch (err) {
                console.error("Failed to load chat sessions from API", err)
            }

            // Fallback to localStorage if API empty or failed
            if (loadedSessions.length === 0) {
                const savedSessions = localStorage.getItem(getScopedStorageKey(chatScope))
                if (savedSessions) {
                    try {
                        loadedSessions = JSON.parse(savedSessions)
                        loadedFromFallback = loadedSessions.length > 0
                    } catch (error) {
                        console.error("Failed to load chat sessions from localStorage", error)
                    }
                }
            }

            // Only migrate legacy shared local keys for guest scope.
            if (chatScope === 'guest' && loadedSessions.length === 0) {
                const legacySessions = localStorage.getItem('chat_sessions')
                if (legacySessions) {
                    try {
                        const parsed = JSON.parse(legacySessions)
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            loadedSessions = parsed.map((s: ChatSession) => ({
                                ...s,
                                id: isSessionInScope(s.id, chatScope) ? s.id : buildScopedSessionId(chatScope)
                            }))
                            loadedFromFallback = true
                        }
                    } catch {
                        // Ignore malformed legacy payload
                    }
                }
            }

            if (chatScope === 'guest' && loadedSessions.length === 0) {
                const oldHistory = localStorage.getItem('chat_history')
                if (oldHistory) {
                    try {
                        const parsedMessages = JSON.parse(oldHistory)
                        if (parsedMessages.length > 0) {
                            loadedSessions = [{
                                id: buildScopedSessionId(chatScope),
                                title: LEGACY_MIGRATED_CHAT_TITLE,
                                messages: parsedMessages,
                                updatedAt: Date.now(),
                                createdAt: Date.now()
                            }]
                            loadedFromFallback = true
                        }
                    } catch {
                        // Ignore malformed legacy history.
                    }
                }
            }

            if (cancelled) return

            if (loadedSessions.length > 0) {
                setSessions(loadedSessions)
                setActiveSessionId(loadedSessions[0].id)

                // Sync to DB if we loaded from LocalStorage fallback
                if (loadedFromFallback) {
                    try {
                        for (const s of loadedSessions) {
                            await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSIONS}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    ...getCommonHeaders()
                                },
                                body: JSON.stringify(s)
                            })
                        }
                    } catch {
                        // Best-effort sync only.
                    }
                }
            }

            setIsInitialized(true)
        }

        loadInitialData()
        return () => { cancelled = true }
    }, [chatScope, token])

    useEffect(() => {
        if (isActive) {
            const nextScope = resolveChatScope(token)
            if (nextScope !== chatScope) {
                wasActiveRef.current = false
                setChatScope(nextScope)
                return
            }
            loadConfig()
            scrollToBottom()
        }
    }, [isActive, chatScope, token])

    // Entering AI chat starts a fresh session for the current account scope.
    useEffect(() => {
        if (!isActive) {
            wasActiveRef.current = false
            return
        }
        if (!isInitialized || wasActiveRef.current) return
        wasActiveRef.current = true

        const active = sessions.find(s => s.id === activeSessionId)
        if (!active || active.messages.length > 0) {
            createNewSession()
        }
    }, [isActive, isInitialized, sessions, activeSessionId, chatScope])

    // Save sessions to DB (and localStorage for quick cache) whenever they change
    const saveSessionToDB = async (session: ChatSession) => {
        try {
            await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSIONS}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getCommonHeaders()
                },
                body: JSON.stringify(session)
            })
        } catch (error) {
            console.error("Failed to sync session to DB", error)
        }
    }

    useEffect(() => {
        if (!isInitialized) return
        const scopedStorageKey = getScopedStorageKey(chatScope)
        if (sessions.length > 0) {
            localStorage.setItem(scopedStorageKey, JSON.stringify(sessions))
        } else {
            localStorage.removeItem(scopedStorageKey)
        }
    }, [sessions, isInitialized, chatScope])

    // Scroll to bottom when active session or its messages change
    useEffect(() => {
        scrollToBottom()
    }, [activeSessionId, sessions.find(s => s.id === activeSessionId)?.messages.length])

    // Auto-hide memory toast
    useEffect(() => {
        if (memoryToast) {
            const t = setTimeout(() => setMemoryToast(null), 3000)
            return () => clearTimeout(t)
        }
    }, [memoryToast])

    const loadConfig = () => {
        const currentProvider = localStorage.getItem('ai_provider') || 'dashscope'
        setProvider(currentProvider)

        const savedModelsStr = localStorage.getItem('ai_models_map')
        let modelsMap: Record<string, string> = {}
        if (savedModelsStr) {
            try {
                modelsMap = JSON.parse(savedModelsStr)
            } catch {
                // Ignore malformed saved model config.
            }
        }
        setModel(modelsMap[currentProvider] || localStorage.getItem('ai_model') || '')
        setEvermemEnabled(localStorage.getItem('evermem_enabled') === 'true')
    }

    const scrollToBottom = (instant: boolean = false) => {
        messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' })
    }

    const getApiHeaders = () => {
        const headers: Record<string, string> = getCommonHeaders()
        if (provider) headers['X-AI-Provider'] = provider
        if (model) headers['X-AI-Model'] = model

        const savedBasesStr = localStorage.getItem('ai_bases_map')
        let basesMap: Record<string, string> = {}
        if (savedBasesStr) {
            try {
                basesMap = JSON.parse(savedBasesStr)
            } catch {
                // Ignore malformed saved base config.
            }
        }
        const apiBase = basesMap[provider] || ''
        if (apiBase) headers['X-AI-Base'] = apiBase

        const savedKeysStr = localStorage.getItem('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch {
                // Ignore malformed saved key config.
            }
        }
        const apiKey = keysMap[provider] || localStorage.getItem('ai_api_key') || ''
        if (apiKey) headers['X-AI-Key'] = apiKey

        if (evermemEnabled) {
            headers['X-EverMem-Enabled'] = 'true'
            const evermemUrl = localStorage.getItem('evermem_url')
            const evermemKey = localStorage.getItem('evermem_key')
            if (evermemUrl) headers['X-EverMem-Url'] = evermemUrl
            if (evermemKey) headers['X-EverMem-Key'] = evermemKey
        }
        return headers
    }

    const activeSession = sessions.find(s => s.id === activeSessionId)
    const messages = activeSession?.messages || []
    const getDisplaySessionTitle = (title: string) => {
        if (isDefaultNewChatTitle(title)) return t('chat.session.newChat')
        if (title === LEGACY_MIGRATED_CHAT_TITLE) return t('chat.session.migratedChat')
        return title
    }

    const createNewSession = () => {
        const existingEmptySession = sessions.find(
            session => session.messages.length === 0 && isDefaultNewChatTitle(session.title)
        )
        if (existingEmptySession) {
            setActiveSessionId(existingEmptySession.id)
            setSidebarOpen(false)
            return
        }

        const newSession: ChatSession = {
            id: buildScopedSessionId(chatScope),
            title: DEFAULT_NEW_CHAT_TITLE,
            messages: [],
            updatedAt: Date.now(),
            createdAt: Date.now()
        }
        setSessions(prev => [newSession, ...prev])
        setActiveSessionId(newSession.id)
        setSidebarOpen(false)
        saveSessionToDB(newSession)
    }

    const deleteSession = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (window.confirm(t('chat.confirm.deleteSession'))) {
            try {
                await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSION_DELETE(id)}`, {
                    method: 'DELETE',
                    headers: getCommonHeaders()
                })
            } catch (err) { console.error("Failed to delete session from DB", err) }

            setSessions(prev => {
                const filtered = prev.filter(s => s.id !== id)
                if (activeSessionId === id) {
                    setActiveSessionId(filtered.length > 0 ? filtered[0].id : null)
                }
                if (filtered.length === 0) {
                    setTimeout(() => createNewSession(), 0)
                }
                return filtered
            })
        }
    }

    const startRenameSession = (e: React.MouseEvent, session: ChatSession) => {
        e.preventDefault()
        e.stopPropagation()
        setEditingSessionId(session.id)
        setEditingTitle(isDefaultNewChatTitle(session.title) ? '' : getDisplaySessionTitle(session.title))
    }

    const commitRename = (id: string) => {
        if (editingTitle.trim()) {
            const updatedTitle = editingTitle.trim()
            setSessions(prev => {
                const updated = prev.map(s => s.id === id ? { ...s, title: updatedTitle, updatedAt: Date.now() } : s)
                const target = updated.find(s => s.id === id)
                if (target) saveSessionToDB(target)
                return updated
            })
        }
        setEditingSessionId(null)
    }

    const cancelRename = () => {
        setEditingSessionId(null)
    }

    const clearSession = () => {
        if (!activeSessionId) return;
        if (window.confirm(t('chat.confirm.clearSession'))) {
            setSessions(prev => {
                const updated = prev.map(s => s.id === activeSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s)
                const target = updated.find(s => s.id === activeSessionId)
                if (target) saveSessionToDB(target)
                return updated
            })
        }
    }


    const handleSend = async () => {
        if (!input.trim() || loading || !activeSessionId || !isInitialized) return

        const targetSessionId = activeSessionId
        const userContent = input.trim()
        let botMsgId: string | null = null

        // Auto-rename session if it's the first message
        if (activeSession && activeSession.messages.length === 0) {
            const baseTitle = userContent.length > 15 ? userContent.substring(0, 15) + '...' : userContent
            setSessions(prev => prev.map(s =>
                s.id === targetSessionId ? { ...s, title: baseTitle } : s
            ))
        }

        const userMsg: Message = {
            id: generateId(),
            role: 'user',
            content: userContent,
            timestamp: Date.now()
        }

        setSessions(prev => {
            const updated = prev.map(s => {
                if (s.id === targetSessionId) {
                    return { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() }
                }
                return s
            })
            // Wait to sync until bot replies, or sync user msg immediately.
            // We'll sync at the very end to avoid multiple writes, but for safety:
            const target = updated.find(s => s.id === targetSessionId)
            if (target) saveSessionToDB(target)
            return updated
        })

        setInput('')
        setLoading(true)

        try {
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content
            }))
            history.push({ role: userMsg.role, content: userMsg.content })

            botMsgId = generateId()
            const initialBotMsg: Message = {
                id: botMsgId,
                role: 'assistant',
                content: '',
                reasoningContent: '',
                timestamp: Date.now()
            }

            // Initially add empty bot message and mark user message as saved (optimistic or wait for end)
            setSessions(prev => prev.map(s => {
                if (s.id === targetSessionId) {
                    return { ...s, messages: [...s.messages, initialBotMsg], updatedAt: Date.now() }
                }
                return s
            }))

            const response = await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_STREAM}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getApiHeaders()
                },
                body: JSON.stringify({
                    messages: history,
                    session_id: targetSessionId
                })
            })

            if (!response.ok) {
                const raw = await response.text()
                let detailedMessage = t('chat.errors.api', { message: response.statusText })
                try {
                    const parsed = raw ? JSON.parse(raw) : null
                    const detail = parsed?.detail
                    if (typeof detail === 'string' && detail.trim()) {
                        detailedMessage = detail
                    } else if (detail?.message && typeof detail.message === 'string') {
                        detailedMessage = detail.message
                    } else if (raw && raw.trim()) {
                        detailedMessage = raw
                    }
                } catch {
                    if (raw && raw.trim()) {
                        detailedMessage = raw
                    }
                }
                throw new Error(detailedMessage)
            }
            if (!response.body) {
                throw new Error(`No response body`)
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let done = false
            let sseBuffer = ''
            let botContent = ''
            let botReasoning = ''
            let memoriesRetrieved = 0
            let memorySaved = false
            let streamFlushTimer: number | null = null
            const STREAM_FLUSH_MS = 120

            const applyBotStreamUpdate = () => {
                setSessions(prev => prev.map(s => {
                    if (s.id === targetSessionId) {
                        const updatedMessages = s.messages.map(m =>
                            m.id === botMsgId
                                ? {
                                    ...m,
                                    content: botContent,
                                    reasoningContent: botReasoning
                                }
                                : m
                        )
                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                }))
            }

            const scheduleBotStreamUpdate = () => {
                if (streamFlushTimer !== null) return
                streamFlushTimer = window.setTimeout(() => {
                    streamFlushTimer = null
                    applyBotStreamUpdate()
                    scrollToBottom(true)
                }, STREAM_FLUSH_MS)
            }

            const flushBotStreamUpdate = () => {
                if (streamFlushTimer !== null) {
                    window.clearTimeout(streamFlushTimer)
                    streamFlushTimer = null
                }
                applyBotStreamUpdate()
                scrollToBottom(true)
            }

            const handleSsePayload = (payload: string) => {
                if (!payload || payload === '[DONE]') return
                try {
                    const data = JSON.parse(payload)
                    if (data.type === 'token') {
                        const tokenChunk = typeof data.content === 'string' ? data.content : ''
                        botContent += tokenChunk
                        scheduleBotStreamUpdate()
                    } else if (data.type === 'reasoning') {
                        const reasoningChunk = typeof data.content === 'string' ? data.content : ''
                        botReasoning += reasoningChunk
                        scheduleBotStreamUpdate()
                    } else if (data.type === 'done') {
                        memoriesRetrieved = data.memories_retrieved || 0
                        memorySaved = data.memory_saved || false
                    }
                } catch {
                    // Ignore malformed payloads.
                }
            }

            const consumeSseBuffer = () => {
                while (true) {
                    const boundary = sseBuffer.indexOf('\n\n')
                    if (boundary < 0) break
                    const rawEvent = sseBuffer.slice(0, boundary)
                    sseBuffer = sseBuffer.slice(boundary + 2)

                    const payload = rawEvent
                        .split('\n')
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trimStart())
                        .join('\n')
                        .trim()

                    handleSsePayload(payload)
                }
            }

            while (!done) {
                const { value, done: readerDone } = await reader.read()
                done = readerDone
                if (value) {
                    sseBuffer += decoder.decode(value, { stream: true })
                    consumeSseBuffer()
                }
            }

            const tailPayload = sseBuffer
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n')
                .trim()
            handleSsePayload(tailPayload)
            flushBotStreamUpdate()

            // Final update with metadata
            setSessions(prev => {
                const updated = prev.map(s => {
                    if (s.id === targetSessionId) {
                        const updatedMessages = [...s.messages]
                        let lastUserIdx = -1;
                        let lastBotIdx = -1;

                        for (let i = updatedMessages.length - 1; i >= 0; i--) {
                            if (updatedMessages[i].role === 'user' && lastUserIdx === -1) lastUserIdx = i;
                            if (updatedMessages[i].id === botMsgId) lastBotIdx = i;
                        }

                        if (lastUserIdx >= 0) {
                            updatedMessages[lastUserIdx] = { ...updatedMessages[lastUserIdx], memorySaved }
                        }
                        if (lastBotIdx >= 0) {
                            updatedMessages[lastBotIdx] = {
                                ...updatedMessages[lastBotIdx],
                                content: botContent,
                                reasoningContent: botReasoning,
                                memoriesUsed: memoriesRetrieved
                            }
                        } else if (botContent || botReasoning) {
                            updatedMessages.push({
                                id: botMsgId || generateId(),
                                role: 'assistant',
                                content: botContent,
                                reasoningContent: botReasoning,
                                timestamp: Date.now(),
                                memoriesUsed: memoriesRetrieved
                            })
                        }

                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                })
                const target = updated.find(s => s.id === targetSessionId)
                if (target) saveSessionToDB(target)
                return updated
            })

            if (memoriesRetrieved > 0 || memorySaved) {
                if (memoriesRetrieved > 0 && memorySaved) {
                    setMemoryToast(t('chat.memory.toast.recalledAndSaved', { count: memoriesRetrieved }))
                } else if (memoriesRetrieved > 0) {
                    setMemoryToast(t('chat.memory.toast.recalled', { count: memoriesRetrieved }))
                } else {
                    setMemoryToast(t('chat.memory.toast.saved'))
                }
            }
        } catch (error: unknown) {
            console.error('Chat stream failed:', error)
            setSessions(prev => prev.map(s => {
                if (s.id === targetSessionId) {
                    const errorText = t('chat.errors.response', {
                        message: error instanceof Error ? error.message : t('chat.errors.failedResponse')
                    })
                    let replaced = false
                    const updatedMessages = s.messages.map(m => {
                        if (botMsgId && m.id === botMsgId) {
                            replaced = true
                            return { ...m, content: errorText, reasoningContent: '' }
                        }
                        return m
                    })
                    if (!replaced) {
                        updatedMessages.push({
                            id: generateId(),
                            role: 'assistant',
                            content: errorText,
                            reasoningContent: '',
                            timestamp: Date.now()
                        })
                    }
                    return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                }
                return s
            }))
        } finally {
            setLoading(false)
        }
    }

    const providerLabel = provider === 'openai' ? 'OpenAI' :
        provider === 'anthropic' ? 'Claude' :
            provider === 'dashscope' ? t('chat.providers.dashscope') :
                provider === 'gemini' ? 'Gemini' :
                    provider === 'ollama' ? 'Ollama' : provider

    return (
        <div className="h-[calc(100vh-4rem)] flex animate-fade-in relative bg-gradient-to-br from-primary-100/80 via-primary-50/40 to-white dark:from-slate-900 dark:via-slate-900 dark:to-primary-950/30 rounded-2xl overflow-hidden border border-primary-200 dark:border-primary-800/50 shadow-lg shadow-primary-500/10">
            {/* Global Sidebar Overlay */}
            <div
                className={`absolute inset-0 z-40 bg-slate-900/20 dark:bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                style={{ display: sidebarOpen ? 'block' : 'none' }}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar Drawer */}
            <div className={`
                absolute inset-y-0 left-0 z-50
                w-72 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-r border-white/20 dark:border-slate-700/50 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.4)]
                transition-transform duration-300 ease-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
                    {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
                        <div
                            key={session.id}
                            onClick={() => {
                                setActiveSessionId(session.id);
                                setSidebarOpen(false);
                            }}
                            className={`
                                group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all
                                ${activeSessionId === session.id
                                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 border-l-2 border-primary-500'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-primary-50/50 dark:hover:bg-slate-700/50'
                                }
                            `}
                        >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                <MessageSquare size={16} className="flex-shrink-0" />
                                {editingSessionId === session.id ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onBlur={() => commitRename(session.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitRename(session.id);
                                            } else if (e.key === 'Escape') {
                                                cancelRename();
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-white dark:bg-slate-900 border border-primary-500 rounded px-2 py-0.5 text-sm text-slate-800 dark:text-white outline-none"
                                    />
                                ) : (
                                    <span className="truncate text-sm font-medium">{getDisplaySessionTitle(session.title)}</span>
                                )}
                            </div>

                            {editingSessionId !== session.id && (
                                <div className={`relative z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${activeSessionId === session.id ? 'opacity-100' : ''}`}>
                                    <button
                                        onClick={(e) => startRenameSession(e, session)}
                                        className="p-1.5 text-slate-400 hover:text-primary-500 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                        title={t('chat.actions.rename')}
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            deleteSession(e, session.id)
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                        title={t('chat.actions.delete')}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
                {/* Header */}
                <div className="flex-none h-16 border-b border-primary-200/50 dark:border-primary-800/40 flex items-center justify-between px-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={sidebarOpen ? t('chat.actions.collapseHistory') : t('chat.actions.expandHistory')}
                        >
                            <Menu size={20} />
                        </button>

                        <div>
                            <h2 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent dark:from-primary-400 dark:to-primary-300 flex items-center gap-2">
                                <span className="hidden sm:inline">{t('chat.header.title')}</span>
                                {evermemEnabled && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-primary-100 to-primary-200 text-primary-700 dark:from-primary-900/40 dark:to-primary-800/40 dark:text-primary-300 rounded-full flex items-center gap-1 border border-primary-200/60 dark:border-primary-700/50">
                                        <Brain size={10} className="animate-pulse" />
                                        {t('chat.header.longTermMemoryEnabled')}
                                    </span>
                                )}

                                <div className="ml-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                                    <img src={EvermemLogo} alt="EverMemOS" className="h-5 w-5 rounded" />
                                    <span className="whitespace-nowrap">Powered by EverMemOS</span>
                                </div>
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[10px] sm:text-xs">
                                {providerLabel} <span className="opacity-50">•</span> {model || t('chat.header.defaultModel')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={createNewSession}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-primary-500/30 hover:shadow-lg hover:shadow-primary-500/40 hover:scale-[1.02] active:scale-[0.98]"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={16} />
                            <span className="text-sm hidden sm:inline">{t('chat.actions.newChat')}</span>
                        </button>

                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const dropdown = document.getElementById('chat-actions-dropdown');
                                    if (dropdown) {
                                        if (dropdown.style.display === 'block') {
                                            dropdown.style.display = 'none';
                                        } else {
                                            dropdown.style.display = 'block';
                                            dropdown.style.top = `${rect.bottom + 8}px`;
                                            dropdown.style.right = `${window.innerWidth - rect.right}px`;
                                        }
                                    }
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title={t('chat.actions.moreOptions')}
                            >
                                <MoreHorizontal size={18} />
                            </button>

                            {/* Dropdown Menu - Click Outside to Close Handled by a global listener ideally, simplified here for pure React state or vanilla if preferred */}
                        </div>
                    </div>
                </div>

                {/* Global Dropdown (Absolute to body or container) */}
                <div
                    id="chat-actions-dropdown"
                    className="hidden fixed z-50 min-w-[160px] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm"
                    style={{ display: 'none' }}
                >
                    <div className="p-1">
                        <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors text-left"
                            onClick={() => {
                                document.getElementById('chat-actions-dropdown')!.style.display = 'none';
                                clearSession();
                            }}
                        >
                            <Eraser size={14} className="text-slate-400" />
                            <span>{t('chat.actions.clearCurrentMessages')}</span>
                        </button>

                        <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>

                        <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-left font-medium"
                            onClick={(e) => {
                                document.getElementById('chat-actions-dropdown')!.style.display = 'none';
                                if (activeSessionId) deleteSession(e, activeSessionId);
                            }}
                        >
                            <Trash2 size={14} className="text-red-500" />
                            <span>{t('chat.actions.deleteSessionRecord')}</span>
                        </button>
                    </div>
                </div>

                {/* Memory Toast */}
                {memoryToast && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 animate-fade-in shadow-xl">
                        <div className="bg-indigo-600/95 backdrop-blur-md text-white text-sm px-4 py-2 rounded-full shadow-indigo-500/20 shadow-lg flex items-center gap-2 whitespace-nowrap border border-indigo-500">
                            <Brain size={14} className="animate-pulse" />
                            {memoryToast}
                        </div>
                    </div>
                )}

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar scroll-smooth">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center">
                            {/* Decorative gradient orb */}
                            <div className="relative mb-8">
                                <div className="absolute -inset-6 bg-gradient-to-br from-primary-400/20 to-primary-300/10 dark:from-primary-600/10 dark:to-primary-500/5 rounded-full blur-2xl" />
                                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
                                    <Sparkles size={36} className="text-white drop-shadow-sm" />
                                </div>
                            </div>
                            <p className="text-lg font-bold bg-gradient-to-r from-primary-700 to-primary-500 bg-clip-text text-transparent dark:from-primary-300 dark:to-primary-400 mb-1">{t('chat.empty.title')}</p>
                            <p className="text-sm text-slate-400 dark:text-slate-500">{t('chat.empty.subtitle')}</p>
                            {evermemEnabled && (
                                <div className="mt-6 px-6 py-5 bg-gradient-to-br from-primary-50 to-primary-100/60 dark:from-primary-900/30 dark:to-slate-800/40 rounded-2xl border border-primary-200/80 dark:border-primary-700/50 text-center max-w-sm shadow-md shadow-primary-500/10">
                                    <p className="text-sm text-primary-600 dark:text-primary-400 flex items-center justify-center gap-1.5 font-bold mb-1">
                                        <Brain size={16} /> {t('chat.empty.memoryTitle')}
                                    </p>
                                    <p className="text-xs text-primary-500/80 dark:text-primary-400/70">
                                        {t('chat.empty.memoryDesc')}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            {msg.role === 'assistant' && (
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/30 ring-2 ring-primary-200/50 dark:ring-primary-700/30">
                                    <Sparkles size={18} />
                                </div>
                            )}

                            <div className={`flex flex-col gap-1.5 max-w-[85%] md:max-w-[75%]`}>
                                <div className={`rounded-2xl px-5 py-3.5 shadow-sm text-[16.5px] leading-[1.7] whitespace-pre-wrap relative
                                    ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm shadow-md shadow-primary-500/30'
                                        : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-md text-slate-800 dark:text-slate-200 rounded-tl-sm border border-primary-100 dark:border-primary-800/40 shadow-sm'
                                    }`}
                                >
                                    {msg.content || (msg.reasoningContent && msg.reasoningContent.trim()) ? (
                                        <div className="space-y-2">
                                            {msg.role === 'assistant' && msg.reasoningContent && msg.reasoningContent.trim() && (
                                                <div className="rounded-xl border border-primary-200/70 dark:border-primary-700/50 bg-primary-50/70 dark:bg-primary-900/20 overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedReasoning(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-primary-100/60 dark:hover:bg-primary-800/20 transition-colors"
                                                    >
                                                        <span className="flex items-center gap-2 text-primary-700 dark:text-primary-300 text-sm font-semibold">
                                                            <ChevronRight
                                                                size={15}
                                                                className={`transition-transform duration-200 ${expandedReasoning[msg.id] ? 'rotate-90' : ''}`}
                                                            />
                                                            {t('chat.reasoning.title')}
                                                        </span>
                                                        <span className="text-[11px] text-primary-500/90 dark:text-primary-300/80">
                                                            {expandedReasoning[msg.id] ? t('chat.reasoning.collapse') : t('chat.reasoning.expand')}
                                                        </span>
                                                    </button>
                                                    <div
                                                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${expandedReasoning[msg.id] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                                    >
                                                        <div className="overflow-hidden">
                                                            {expandedReasoning[msg.id] && (
                                                                <div className="border-t border-primary-200/70 dark:border-primary-700/50 px-3 py-2 text-[13px] leading-7 whitespace-pre-wrap text-primary-700/90 dark:text-primary-200/90 max-h-[22rem] overflow-y-auto custom-scrollbar">
                                                                    {msg.reasoningContent}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {msg.content && <div>{msg.content}</div>}
                                            {msg.role === 'assistant' && msg.content && (
                                                <div className="mt-3 flex items-center justify-end border-t border-slate-200/70 dark:border-slate-700/70 pt-2">
                                                    <AudioButton
                                                        text={msg.content}
                                                        useTTS={true}
                                                        size={16}
                                                        className="!p-2.5 bg-slate-50 hover:bg-primary-50 dark:bg-slate-900/70 dark:hover:bg-primary-900/30 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-300"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        msg.role === 'assistant' && loading && (
                                            <div className="flex gap-1.5 items-center h-6">
                                                {evermemEnabled ? (
                                                    <span className="text-[13px] font-medium text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5">
                                                        <Brain size={14} className="animate-pulse" />
                                                        {t('chat.loading.thinking')}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </>
                                                )}
                                            </div>
                                        )
                                    )}

                                </div>

                                {/* Memory indicators */}
                                {msg.role === 'user' && msg.memorySaved && (
                                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 self-end mr-1 font-medium">
                                        <Brain size={10} /> {t('chat.memory.savedIndicator')}
                                    </span>
                                )}
                                {msg.role === 'assistant' && (msg.memoriesUsed || 0) > 0 && (
                                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 ml-1 font-medium">
                                        <Sparkles size={10} /> {t('chat.memory.retrievedIndicator', { count: msg.memoriesUsed })}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Input Area */}
                <div className="flex-none p-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-t border-primary-200/40 dark:border-primary-800/30">
                    <div className="max-w-4xl mx-auto flex gap-3 items-end bg-white dark:bg-slate-800 rounded-2xl shadow-md shadow-primary-500/5 border border-primary-100 dark:border-slate-700 p-2 relative focus-within:ring-2 focus-within:ring-primary-400/30 focus-within:border-primary-400/60 transition-all cursor-text" onClick={() => inputRef.current?.focus()}>
                        <textarea
                            ref={inputRef}
                            autoFocus
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder={t('chat.input.placeholder')}
                            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-3 max-h-48 min-h-[52px] resize-none text-[15px] text-slate-800 dark:text-white placeholder-slate-400 custom-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading || !activeSessionId || !isInitialized}
                            className="p-3.5 mb-0.5 mr-0.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 active:from-primary-700 active:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all flex-shrink-0 shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40 hover:scale-105 active:scale-95"
                        >
                            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} className="translate-x-[1px] -translate-y-[1px]" />}
                        </button>
                    </div>
                    <div className="text-center mt-2.5">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {t('chat.disclaimer')}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
