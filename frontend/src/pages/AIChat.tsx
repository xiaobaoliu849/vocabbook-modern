import { useState, useEffect, useRef } from 'react'
import { Send, Trash2, Brain, Sparkles, Plus, MessageSquare, Menu, Edit2, MoreHorizontal, Eraser } from 'lucide-react'
import { API_PATHS, API_BASE_URL, getClientId } from '../utils/api'
import AudioButton from '../components/AudioButton'
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

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    memoriesUsed?: number
    memorySaved?: boolean
}

interface ChatSession {
    id: string
    title: string
    messages: Message[]
    updatedAt: number
    createdAt: number
}

export default function AIChat({ isActive }: { isActive?: boolean }) {
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
                    } catch (e) {
                        console.error("Failed to load chat sessions from localStorage", e)
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
                                title: 'Migrated Chat',
                                messages: parsedMessages,
                                updatedAt: Date.now(),
                                createdAt: Date.now()
                            }]
                            loadedFromFallback = true
                        }
                    } catch (e) { }
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
                    } catch (e) { }
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
        } catch (e) { console.error("Failed to sync session to DB", e) }
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
            } catch (e) { }
        }
        setModel(modelsMap[currentProvider] || localStorage.getItem('ai_model') || '')
        setEvermemEnabled(localStorage.getItem('evermem_enabled') === 'true')
    }

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
            } catch (e) { }
        }
        const apiBase = basesMap[provider] || ''
        if (apiBase) headers['X-AI-Base'] = apiBase

        const savedKeysStr = localStorage.getItem('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch (e) { }
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

    const createNewSession = () => {
        setSessions(prev => {
            if (prev.length > 0 && prev[0].messages.length === 0 && prev[0].title === 'New Chat') {
                setTimeout(() => {
                    setActiveSessionId(prev[0].id)
                    setSidebarOpen(false)
                }, 0)
                return prev;
            }
            const newSession: ChatSession = {
                id: buildScopedSessionId(chatScope),
                title: 'New Chat',
                messages: [],
                updatedAt: Date.now(),
                createdAt: Date.now()
            }
            setTimeout(() => {
                setActiveSessionId(newSession.id)
                setSidebarOpen(false)
                saveSessionToDB(newSession)
            }, 0)
            return [newSession, ...prev]
        })
    }

    const deleteSession = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (window.confirm('Are you sure you want to delete this chat session?')) {
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
        setEditingTitle(session.title)
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
        if (window.confirm('确定要清空当前对话的所有消息吗？(上下文记忆将重置)')) {
            setSessions(prev => {
                const updated = prev.map(s => s.id === activeSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s)
                const target = updated.find(s => s.id === activeSessionId)
                if (target) saveSessionToDB(target)
                return updated
            })
        }
    }


    const handleSend = async () => {
        if (!input.trim() || loading || !activeSessionId) return

        const userContent = input.trim()

        // Auto-rename session if it's the first message
        if (activeSession && activeSession.messages.length === 0) {
            const baseTitle = userContent.length > 15 ? userContent.substring(0, 15) + '...' : userContent
            setSessions(prev => prev.map(s =>
                s.id === activeSessionId ? { ...s, title: baseTitle } : s
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
                if (s.id === activeSessionId) {
                    return { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() }
                }
                return s
            })
            // Wait to sync until bot replies, or sync user msg immediately.
            // We'll sync at the very end to avoid multiple writes, but for safety:
            const target = updated.find(s => s.id === activeSessionId)
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

            const botMsgId = generateId()
            const initialBotMsg: Message = {
                id: botMsgId,
                role: 'assistant',
                content: '',
                timestamp: Date.now()
            }

            // Initially add empty bot message and mark user message as saved (optimistic or wait for end)
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
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
                body: JSON.stringify({ messages: history })
            })

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`)
            }
            if (!response.body) {
                throw new Error(`No response body`)
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let done = false
            let botContent = ''
            let memoriesRetrieved = 0
            let memorySaved = false

            while (!done) {
                const { value, done: readerDone } = await reader.read()
                done = readerDone
                if (value) {
                    const chunkInfo = decoder.decode(value, { stream: true })
                    const lines = chunkInfo.split('\n')

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6))
                                if (data.type === 'token') {
                                    botContent += data.content
                                    // Incrementally update the UI
                                    setSessions(prev => prev.map(s => {
                                        if (s.id === activeSessionId) {
                                            const updatedMessages = s.messages.map(m =>
                                                m.id === botMsgId ? { ...m, content: botContent } : m
                                            )
                                            return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                                        }
                                        return s
                                    }))
                                    scrollToBottom()
                                } else if (data.type === 'done') {
                                    memoriesRetrieved = data.memories_retrieved || 0
                                    memorySaved = data.memory_saved || false
                                }
                            } catch (e) {
                                // Ignore incomplete chunks
                            }
                        }
                    }
                }
            }

            // Final update with metadata
            setSessions(prev => {
                const updated = prev.map(s => {
                    if (s.id === activeSessionId) {
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
                            updatedMessages[lastBotIdx] = { ...updatedMessages[lastBotIdx], memoriesUsed: memoriesRetrieved }
                        }

                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                })
                const target = updated.find(s => s.id === activeSessionId)
                if (target) saveSessionToDB(target)
                return updated
            })

            if (memoriesRetrieved > 0 || memorySaved) {
                const parts = []
                if (memoriesRetrieved > 0) parts.push(`回忆了 ${memoriesRetrieved} 条相关记忆`)
                if (memorySaved) parts.push('已记住本次对话')
                setMemoryToast(`🧠 ${parts.join('，')}`)
            }
        } catch (error: any) {
            console.error('Chat stream failed:', error)
            const errorMsg: Message = {
                id: generateId(),
                role: 'assistant',
                content: `Error: ${error.message || 'Failed to get response'}`,
                timestamp: Date.now()
            }
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    return { ...s, messages: [...s.messages, errorMsg], updatedAt: Date.now() }
                }
                return s
            }))
        } finally {
            setLoading(false)
        }
    }

    const providerLabel = provider === 'openai' ? 'OpenAI' :
        provider === 'anthropic' ? 'Claude' :
            provider === 'dashscope' ? '通义千问' :
                provider === 'gemini' ? 'Gemini' :
                    provider === 'ollama' ? 'Ollama' : provider

    return (
        <div className="h-[calc(100vh-4rem)] flex animate-fade-in relative bg-slate-50 dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
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
                                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
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
                                    <span className="truncate text-sm font-medium">{session.title}</span>
                                )}
                            </div>

                            {editingSessionId !== session.id && (
                                <div className={`relative z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${activeSessionId === session.id ? 'opacity-100' : ''}`}>
                                    <button
                                        onClick={(e) => startRenameSession(e, session)}
                                        className="p-1.5 text-slate-400 hover:text-primary-500 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                        title="Rename"
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
                                        title="Delete"
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
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative">
                {/* Header */}
                <div className="flex-none h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={sidebarOpen ? "收起历史记录" : "展开历史记录"}
                        >
                            <Menu size={20} />
                        </button>

                        <div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="hidden sm:inline">AI 语伴</span>
                                {evermemEnabled && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 dark:from-indigo-900/40 dark:to-purple-900/40 dark:text-indigo-300 rounded-full flex items-center gap-1 border border-indigo-200/60 dark:border-indigo-700/50">
                                        <Brain size={10} className="animate-pulse" />
                                        长期记忆已开启
                                    </span>
                                )}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[10px] sm:text-xs">
                                {providerLabel} <span className="opacity-50">•</span> {model || 'Default Model'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={createNewSession}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors shadow-sm shadow-primary-500/20"
                            title="新建对话 (New Chat)"
                        >
                            <Plus size={16} />
                            <span className="text-sm hidden sm:inline">新对话</span>
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
                                title="更多选项"
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
                            <span>清空当前消息</span>
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
                            <span>删除对话记录</span>
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
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <Sparkles size={48} className="mb-4 text-indigo-200 dark:text-indigo-900/50" />
                            <p className="text-base font-medium text-slate-500 dark:text-slate-400">开始和 AI 练习英语对话吧！</p>
                            {evermemEnabled && (
                                <div className="mt-6 px-5 py-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 text-center max-w-sm">
                                    <p className="text-sm text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1.5 font-bold mb-1">
                                        <Brain size={16} /> EverMemOS 记忆引挚已激活
                                    </p>
                                    <p className="text-xs text-indigo-500/80 dark:text-indigo-400/70">
                                        AI 会自动记忆关键内容，赋予每次对话延续性
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
                                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20">
                                    <Sparkles size={18} />
                                </div>
                            )}

                            <div className={`flex flex-col gap-1.5 max-w-[85%] md:max-w-[75%]`}>
                                <div className={`rounded-2xl px-5 py-3.5 shadow-sm text-[16.5px] leading-[1.7] whitespace-pre-wrap relative group/msg
                                    ${msg.role === 'user'
                                        ? 'bg-primary-500 text-white rounded-tr-sm shadow-primary-500/20'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-sm border border-slate-100 dark:border-slate-700/60'
                                    }`}
                                >
                                    {msg.content ? (
                                        msg.content
                                    ) : (
                                        msg.role === 'assistant' && loading && (
                                            <div className="flex gap-1.5 items-center h-6">
                                                {evermemEnabled ? (
                                                    <span className="text-[13px] font-medium text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5">
                                                        <Brain size={14} className="animate-pulse" />
                                                        思考中...
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

                                    {/* TTS Button for Assistant Messages */}
                                    {msg.role === 'assistant' && msg.content && (
                                        <div className="absolute -right-10 top-2 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
                                            <AudioButton
                                                text={msg.content}
                                                useTTS={true}
                                                size={16}
                                                className="!p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-full text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Memory indicators */}
                                {msg.role === 'user' && msg.memorySaved && (
                                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 self-end mr-1 font-medium">
                                        <Brain size={10} /> 已纳入长记忆
                                    </span>
                                )}
                                {msg.role === 'assistant' && (msg.memoriesUsed || 0) > 0 && (
                                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 ml-1 font-medium">
                                        <Sparkles size={10} /> 提取 {msg.memoriesUsed} 条核心记忆
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Input Area */}
                <div className="flex-none p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur border-t border-slate-200 dark:border-slate-800">
                    <div className="max-w-4xl mx-auto flex gap-3 items-end bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-2 relative focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500/50 transition-all cursor-text" onClick={() => inputRef.current?.focus()}>
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
                            placeholder="输入消息 (Enter 发送, Shift+Enter 换行)..."
                            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-3 max-h-48 min-h-[52px] resize-none text-[15px] text-slate-800 dark:text-white placeholder-slate-400 custom-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading || !activeSessionId}
                            className="p-3.5 mb-0.5 mr-0.5 rounded-xl bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all flex-shrink-0 shadow-md shadow-primary-500/20"
                        >
                            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} className="translate-x-[1px] -translate-y-[1px]" />}
                        </button>
                    </div>
                    <div className="text-center mt-2.5">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            AI 可能产生不准确的信息，请独立判断
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
