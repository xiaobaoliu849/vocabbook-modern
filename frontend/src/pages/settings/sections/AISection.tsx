import { useState, useEffect } from 'react'

export default function AISection() {
    const [aiProvider, setAiProvider] = useState('dashscope')
    const [aiApiKey, setAiApiKey] = useState('')
    const [aiModel, setAiModel] = useState('qwen-plus')

    useEffect(() => {
        loadAiSettings()
    }, [])

    const loadAiSettings = () => {
        setAiProvider(localStorage.getItem('ai_provider') || 'dashscope')
        setAiApiKey(localStorage.getItem('ai_api_key') || '')
        setAiModel(localStorage.getItem('ai_model') || 'qwen-plus')
    }

    const saveAiSettings = () => {
        localStorage.setItem('ai_provider', aiProvider)
        localStorage.setItem('ai_api_key', aiApiKey)
        localStorage.setItem('ai_model', aiModel)
        // You might want to use a toast notification here instead of alert in a real app
        alert('✅ AI 设置已保存')
    }

    // Auto-set default model when provider changes to DashScope
    const handleProviderChange = (provider: string) => {
        setAiProvider(provider)
        if (provider === 'dashscope' && !aiModel) {
            setAiModel('qwen-plus')
        }
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
                        <input
                            type="password"
                            value={aiApiKey}
                            onChange={(e) => setAiApiKey(e.target.value)}
                            placeholder="输入你的 API Key..."
                            className="input-field w-full"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Key 仅存储在本地，不会上传到服务器
                        </p>
                    </div>

                    {(aiProvider === 'dashscope' || aiProvider === 'openai' || aiProvider === 'custom') && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                模型名称 (Model Name)
                            </label>
                            <input
                                type="text"
                                value={aiModel}
                                onChange={(e) => setAiModel(e.target.value)}
                                placeholder={aiProvider === 'dashscope' ? 'e.g., qwen-plus' : '输入模型名称...'}
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
        </div>
    )
}
