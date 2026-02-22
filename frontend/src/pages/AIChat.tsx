import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Trash2, Brain } from 'lucide-react'
import { api, API_PATHS } from '../utils/api'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
}

export default function AIChat({ isActive }: { isActive?: boolean }) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Config state
    const [provider, setProvider] = useState('')
    const [model, setModel] = useState('')
    const [evermemEnabled, setEvermemEnabled] = useState(false)

    useEffect(() => {
        if (isActive) {
            loadConfig()
            scrollToBottom()
        }
    }, [isActive])

    useEffect(() => {
        loadConfig()
        // Load history from local storage if available?
        // For now, let's keep it ephemeral or maybe save to localStorage
        const savedMessages = localStorage.getItem('chat_history')
        if (savedMessages) {
            try {
                setMessages(JSON.parse(savedMessages))
            } catch (e) {
                console.error("Failed to load chat history", e)
            }
        }
    }, [])

    useEffect(() => {
        scrollToBottom()
        // Save history
        if (messages.length > 0) {
            localStorage.setItem('chat_history', JSON.stringify(messages))
        }
    }, [messages])

    const loadConfig = () => {
        const currentProvider = localStorage.getItem('ai_provider') || 'dashscope'
        setProvider(currentProvider)

        // Load model
        const savedModelsStr = localStorage.getItem('ai_models_map')
        let modelsMap: Record<string, string> = {}
        if (savedModelsStr) {
            try {
                modelsMap = JSON.parse(savedModelsStr)
            } catch (e) {
                console.error('Failed to parse ai models map', e)
            }
        }
        setModel(modelsMap[currentProvider] || localStorage.getItem('ai_model') || '')

        // Load EverMem settings
        setEvermemEnabled(localStorage.getItem('evermem_enabled') === 'true')
    }

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const getApiHeaders = () => {
        const headers: Record<string, string> = {}

        // AI Provider headers
        if (provider) headers['X-AI-Provider'] = provider
        if (model) headers['X-AI-Model'] = model

        // Get Key
        const savedKeysStr = localStorage.getItem('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch (e) {}
        }
        const apiKey = keysMap[provider] || localStorage.getItem('ai_api_key') || ''
        if (apiKey) headers['X-AI-Key'] = apiKey

        // EverMem headers
        if (evermemEnabled) {
            headers['X-EverMem-Enabled'] = 'true'
            const evermemUrl = localStorage.getItem('evermem_url')
            const evermemKey = localStorage.getItem('evermem_key')
            if (evermemUrl) headers['X-EverMem-Url'] = evermemUrl
            if (evermemKey) headers['X-EverMem-Key'] = evermemKey
        }

        return headers
    }

    const handleSend = async () => {
        if (!input.trim() || loading) return

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: Date.now()
        }

        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            // Prepare context (last 10 messages)
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content
            }))
            history.push({ role: userMsg.role, content: userMsg.content })

            const response = await api.post(API_PATHS.AI_CHAT, {
                messages: history
            }, {
                headers: getApiHeaders()
            })

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.response,
                timestamp: Date.now()
            }

            setMessages(prev => [...prev, botMsg])
        } catch (error: any) {
            console.error('Chat failed:', error)
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error: ${error.message || 'Failed to get response'}`,
                timestamp: Date.now()
            }
            setMessages(prev => [...prev, errorMsg])
        } finally {
            setLoading(false)
        }
    }

    const clearHistory = () => {
        if (window.confirm('确定要清空聊天记录吗？')) {
            setMessages([])
            localStorage.removeItem('chat_history')
        }
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col animate-fade-in relative">
            {/* Header */}
            <div className="flex-none mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        AI 语伴
                        {evermemEnabled && (
                            <span className="px-2 py-1 text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-full flex items-center gap-1 border border-indigo-200 dark:border-indigo-800">
                                <Brain size={12} />
                                记忆已开启
                            </span>
                        )}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 text-sm">
                        {provider === 'openai' ? 'OpenAI' :
                         provider === 'anthropic' ? 'Claude' :
                         provider === 'dashscope' ? '通义千问' :
                         provider === 'gemini' ? 'Gemini' :
                         provider === 'ollama' ? 'Ollama' : provider}
                        <span className="opacity-50">•</span>
                        {model || 'Default Model'}
                    </p>
                </div>
                <button
                    onClick={clearHistory}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="清空聊天记录"
                >
                    <Trash2 size={20} />
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar mb-4">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                        <Bot size={64} className="mb-4 text-slate-300 dark:text-slate-600" />
                        <p>开始和 AI 练习英语对话吧！</p>
                        {evermemEnabled && (
                            <p className="text-sm mt-2 text-indigo-400 flex items-center gap-1">
                                <Brain size={14} /> EverMemOS 将记住你们的对话
                            </p>
                        )}
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                            ${msg.role === 'user'
                                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                        >
                            {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                        </div>

                        <div className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm text-sm leading-relaxed whitespace-pre-wrap
                            ${msg.role === 'user'
                                ? 'bg-primary-500 text-white rounded-tr-none'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-tl-none border border-slate-100 dark:border-slate-700'
                            }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Bot size={20} />
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-none px-5 py-4 border border-slate-100 dark:border-slate-700 flex gap-1 items-center">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-none bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-2 flex gap-2 items-end">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                    placeholder="输入消息 (Enter 发送)..."
                    className="flex-1 bg-transparent border-none focus:ring-0 p-3 max-h-32 min-h-[48px] resize-none text-slate-800 dark:text-white placeholder-slate-400"
                    rows={1}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                    className="p-3 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
                >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
                </button>
            </div>
        </div>
    )
}
