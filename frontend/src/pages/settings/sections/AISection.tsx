import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function AISection() {
    const [aiProvider, setAiProvider] = useState('dashscope')
    const [aiApiKey, setAiApiKey] = useState('')
    const [aiModel, setAiModel] = useState('qwen-plus')
    const [showApiKey, setShowApiKey] = useState(false)
    // Store API keys for each provider separately
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
    // Store Models for each provider separately
    const [aiModels, setAiModels] = useState<Record<string, string>>({})

    // EverMemOS State
    const [evermemEnabled, setEvermemEnabled] = useState(false)
    const [evermemUrl, setEvermemUrl] = useState('')
    const [evermemKey, setEvermemKey] = useState('')
    const [showEvermemKey, setShowEvermemKey] = useState(false)

    useEffect(() => {
        loadAiSettings()
    }, [])

    const loadAiSettings = () => {
        const provider = localStorage.getItem('ai_provider') || 'dashscope'
        setAiProvider(provider)

        // Load all saved keys map
        const savedKeysStr = localStorage.getItem('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch (e) {
                console.error('Failed to parse api keys map', e)
            }
        }

        // Load all saved models map
        const savedModelsStr = localStorage.getItem('ai_models_map')
        let modelsMap: Record<string, string> = {}
        if (savedModelsStr) {
            try {
                modelsMap = JSON.parse(savedModelsStr)
            } catch (e) {
                console.error('Failed to parse ai models map', e)
            }
        }

        // Legacy support: check if there is a single key saved in 'ai_api_key'
        const legacyKey = localStorage.getItem('ai_api_key')
        if (legacyKey && !keysMap[provider] && Object.keys(keysMap).length === 0) {
            // Only use legacy key if no map exists or current provider key missing
            keysMap[provider] = legacyKey
        }

        // Legacy support for model
        const legacyModel = localStorage.getItem('ai_model')
        if (legacyModel && !modelsMap[provider]) {
            modelsMap[provider] = legacyModel
        }

        setApiKeys(keysMap)
        setAiModels(modelsMap)
        
        setAiApiKey(keysMap[provider] || '')
        setAiModel(modelsMap[provider] || getDefaultModel(provider))

        // Load EverMem settings
        setEvermemEnabled(localStorage.getItem('evermem_enabled') === 'true')
        setEvermemUrl(localStorage.getItem('evermem_url') || '')
        setEvermemKey(localStorage.getItem('evermem_key') || '')
    }

    const getDefaultModel = (provider: string) => {
        switch (provider) {
            case 'dashscope': return 'qwen-plus'
            case 'openai': return 'gpt-5-mini'
            case 'anthropic': return 'claude-4.5-sonnet'
            case 'gemini': return 'gemini-3-flash-preview'
            case 'ollama': return 'llama4'
            default: return ''
        }
    }

    const saveAiSettings = () => {
        localStorage.setItem('ai_provider', aiProvider)

        // Update keys map
        const newKeysMap = { ...apiKeys, [aiProvider]: aiApiKey }
        setApiKeys(newKeysMap)
        localStorage.setItem('ai_api_keys_map', JSON.stringify(newKeysMap))

        // Update models map
        const newModelsMap = { ...aiModels, [aiProvider]: aiModel }
        setAiModels(newModelsMap)
        localStorage.setItem('ai_models_map', JSON.stringify(newModelsMap))

        // Also save to legacy key for backward compatibility or immediate usage in other parts
        localStorage.setItem('ai_api_key', aiApiKey)

        localStorage.setItem('ai_model', aiModel)

        // Save EverMem settings
        localStorage.setItem('evermem_enabled', String(evermemEnabled))
        localStorage.setItem('evermem_url', evermemUrl)
        localStorage.setItem('evermem_key', evermemKey)

        // You might want to use a toast notification here instead of alert in a real app
        alert('✅ AI 设置已保存')
    }

    // Auto-set default model when provider changes to DashScope
    const handleProviderChange = (provider: string) => {
        setAiProvider(provider)
        // Switch to the key for this provider
        setAiApiKey(apiKeys[provider] || '')
        
        // Switch to model for this provider or default
        const savedModel = aiModels[provider]
        setAiModel(savedModel || getDefaultModel(provider))
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    AI 智能助手
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    配置用于生成例句和助记的 AI 模型
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🤖模型设置
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            AI 提供商
                        </label>
                        <select
                            value={aiProvider}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="input-field w-full"
                        >
                            <option value="dashscope">DashScope (Qwen/通义千问)</option>
                            <option value="openai">OpenAI (GPT-4)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="gemini">Google (Gemini)</option>
                            <option value="ollama">Ollama (本地)</option>
                            <option value="custom">自定义 API</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            API Key
                        </label>
                        <div className="relative">
                        <input
                            type={showApiKey ? "text" : "password"}
                            value={aiApiKey}
                            onChange={(e) => {
                                setAiApiKey(e.target.value)
                                // Update the map immediately in state so switching back preserves it before saving? 
                                // Actually better to keep local state separate until save, 
                                // but user expects switching providers to work. 
                                // Let's update the map in state as they type to prevent loss on switch without save
                                setApiKeys(prev => ({ ...prev, [aiProvider]: e.target.value }))
                            }}
                            placeholder="输入你的 API Key..."
                            className="input-field w-full pr-10"
                        />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                            >
                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Key 仅存储在本地，不会上传到服务器
                        </p>
                    </div>

                    {(aiProvider === 'dashscope' || aiProvider === 'openai' || aiProvider === 'custom') && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                模型名称 (Model Name)
                            </label>
                            <input
                                type="text"
                                value={aiModel}
                                onChange={(e) => {
                                    setAiModel(e.target.value)
                                    setAiModels(prev => ({ ...prev, [aiProvider]: e.target.value }))
                                }}
                                placeholder={aiProvider === 'dashscope' ? 'e.g., qwen-plus' : '输入模型名称...'}
                                className="input-field w-full"
                            />
                        </div>
                    )}
                    {/* Ensure Gemini and Anthropic etc can also set model */}
                    {(aiProvider === 'anthropic' || aiProvider === 'gemini' || aiProvider === 'ollama') && (
                         <div className="animate-fade-in">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                模型名称 (Model Name)
                            </label>
                            <input
                                type="text"
                                value={aiModel}
                                onChange={(e) => {
                                    setAiModel(e.target.value)
                                    setAiModels(prev => ({ ...prev, [aiProvider]: e.target.value }))
                                }}
                                placeholder={getDefaultModel(aiProvider)}
                                className="input-field w-full"
                            />
                        </div>
                    )}

                    <div className="pt-2">
                        <button onClick={saveAiSettings} className="btn-primary w-full md:w-auto">
                            保存 AI 设置
                        </button>
                    </div>
                </div>
            </div>

            {/* EverMemOS Settings */}
            <div className="glass-card p-6 border-l-4 border-l-indigo-500">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🧠 长期记忆 (EverMemOS)
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            启用记忆增强
                        </label>
                        <button
                            onClick={() => setEvermemEnabled(!evermemEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${evermemEnabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                        >
                            <span
                                className={`${evermemEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                            />
                        </button>
                    </div>

                    {evermemEnabled && (
                        <div className="animate-fade-in space-y-4 pt-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    API URL
                                </label>
                                <input
                                    type="text"
                                    value={evermemUrl}
                                    onChange={(e) => setEvermemUrl(e.target.value)}
                                    placeholder="http://localhost:1995"
                                    className="input-field w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showEvermemKey ? "text" : "password"}
                                        value={evermemKey}
                                        onChange={(e) => setEvermemKey(e.target.value)}
                                        placeholder="EverMemOS API Key"
                                        className="input-field w-full pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowEvermemKey(!showEvermemKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                                    >
                                        {showEvermemKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500">
                                需要部署 EverMemOS 服务。查看 <a href="https://github.com/EverMind-AI/EverMemOS" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">项目主页</a> 获取更多信息。
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
