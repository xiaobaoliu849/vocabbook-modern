import { safeStorage } from '../../../utils/safeStorage'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../context/ToastContext'
import { API_BASE_URL, api, getOwnerTokenHeaders } from '../../../utils/api'
import { getDefaultModel, PROVIDER_MODEL_PRESETS } from '../../../utils/aiModels'
import MemoryManagementModal from '../../../components/MemoryManagementModal'

export default function AISection() {
    const { t } = useTranslation()
    const { toast } = useToast()
    const [aiProvider, setAiProvider] = useState('dashscope')
    const [aiApiKey, setAiApiKey] = useState('')
    const [aiModel, setAiModel] = useState('qwen3.7-flash')
    const [showApiKey, setShowApiKey] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: string } | null>(null)
    // Store API keys for each provider separately
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
    // Store Models for each provider separately
    const [aiModels, setAiModels] = useState<Record<string, string>>({})
    // Store Base URLs for each provider separately
    const [aiBases, setAiBases] = useState<Record<string, string>>({})
    const [aiBase, setAiBase] = useState('')

    // Ollama model auto-detection
    const [ollamaModels, setOllamaModels] = useState<{ name: string; size: string; parameter_size: string; family: string }[]>([])
    const [ollamaLoading, setOllamaLoading] = useState(false)
    const [ollamaError, setOllamaError] = useState('')
    // Mirrors of aiBase/aiModel so fetchOllamaModels stays identity-stable —
    // depending on the states directly made its useCallback change on every
    // keystroke in the base-URL input, and the provider effect below fired a
    // request per character typed.
    const aiBaseRef = useRef('')
    const aiModelRef = useRef(aiModel)
    const ollamaReqSeqRef = useRef(0)

    useEffect(() => {
        aiBaseRef.current = aiBase
    }, [aiBase])

    useEffect(() => {
        aiModelRef.current = aiModel
    }, [aiModel])

    // EverMemOS State
    const [evermemEnabled, setEvermemEnabled] = useState(false)
    const [evermemUrl, setEvermemUrl] = useState('')
    const [evermemKey, setEvermemKey] = useState('')
    const [showEvermemKey, setShowEvermemKey] = useState(false)
    const [memoryMgmtOpen, setMemoryMgmtOpen] = useState(false)

    const loadAiSettings = useCallback(() => {
        const provider = safeStorage.get('ai_provider') || 'dashscope'
        setAiProvider(provider)

        // Load all saved keys map
        const savedKeysStr = safeStorage.get('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch (e) {
                console.error('Failed to parse api keys map', e)
            }
        }

        // Load all saved models map
        const savedModelsStr = safeStorage.get('ai_models_map')
        let modelsMap: Record<string, string> = {}
        if (savedModelsStr) {
            try {
                modelsMap = JSON.parse(savedModelsStr)
            } catch (e) {
                console.error('Failed to parse ai models map', e)
            }
        }

        // Load all saved bases map
        const savedBasesStr = safeStorage.get('ai_bases_map')
        let basesMap: Record<string, string> = {}
        if (savedBasesStr) {
            try {
                basesMap = JSON.parse(savedBasesStr)
            } catch (e) {
                console.error('Failed to parse ai bases map', e)
            }
        }

        // Legacy support: check if there is a single key saved in 'ai_api_key'
        const legacyKey = safeStorage.get('ai_api_key')
        if (legacyKey && !keysMap[provider] && Object.keys(keysMap).length === 0) {
            // Only use legacy key if no map exists or current provider key missing
            keysMap[provider] = legacyKey
        }

        // Legacy support for model
        const legacyModel = safeStorage.get('ai_model')
        if (legacyModel && !modelsMap[provider]) {
            modelsMap[provider] = legacyModel
        }

        setApiKeys(keysMap)

        let loadedModel = modelsMap[provider] || getDefaultModel(provider)
        // Auto-migrate legacy models to qwen3.7-flash once
        if (provider === 'dashscope' && (loadedModel === 'qwen-flash' || loadedModel === 'qwen-plus' || loadedModel === 'qwen3.5-flash' || loadedModel === 'qwen-flash-latest' || !loadedModel) && !safeStorage.get('qwen37_flash_migrated_v3')) {
            loadedModel = 'qwen3.7-flash'
            modelsMap[provider] = loadedModel
            safeStorage.set('qwen37_flash_migrated_v3', 'true')
            safeStorage.set('ai_models_map', JSON.stringify(modelsMap))
            safeStorage.set('ai_model', loadedModel)
        }

        setAiModels(modelsMap)
        setAiBases(basesMap)
        setAiApiKey(keysMap[provider] || '')
        setAiModel(loadedModel)
        setAiBase(basesMap[provider] || '')

        // Load EverMem settings
        setEvermemEnabled(safeStorage.get('evermem_enabled') === 'true')
        setEvermemUrl(safeStorage.get('evermem_url') || '')
        setEvermemKey(safeStorage.get('evermem_key') || '')
    }, [])

    useEffect(() => {
        loadAiSettings()
    }, [loadAiSettings])

    const saveAiSettings = () => {
        safeStorage.set('ai_provider', aiProvider)

        // Update keys map
        const newKeysMap = { ...apiKeys, [aiProvider]: aiApiKey }
        setApiKeys(newKeysMap)
        safeStorage.set('ai_api_keys_map', JSON.stringify(newKeysMap))

        // Update models map
        const newModelsMap = { ...aiModels, [aiProvider]: aiModel }
        setAiModels(newModelsMap)
        safeStorage.set('ai_models_map', JSON.stringify(newModelsMap))

        // Update bases map
        const newBasesMap = { ...aiBases, [aiProvider]: aiBase }
        setAiBases(newBasesMap)
        safeStorage.set('ai_bases_map', JSON.stringify(newBasesMap))

        // Also save to legacy key for backward compatibility or immediate usage in other parts
        safeStorage.set('ai_api_key', aiApiKey)

        safeStorage.set('ai_model', aiModel)

        // Save EverMem settings
        safeStorage.set('evermem_enabled', String(evermemEnabled))
        safeStorage.set('evermem_url', evermemUrl)
        safeStorage.set('evermem_key', evermemKey)

        toast(t('settings.ai.saveSuccess', 'AI settings saved'), 'success')
    }

    const testConnection = async () => {
        setIsTesting(true)
        setTestResult(null)
        try {
            const response = await fetch(`${API_BASE_URL}/api/ai/test-connection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-AI-Provider': aiProvider,
                    'X-AI-Key': aiApiKey,
                    'X-AI-Model': aiModel,
                    'X-AI-Base': aiBase,
                    ...getOwnerTokenHeaders(),
                }
            })
            const data = await response.json()
            setTestResult(data)
        } catch (e) {
            setTestResult({
                success: false,
                message: t('settings.ai.backendUnavailable', 'Cannot connect to the backend server'),
                details: String(e)
            })
        } finally {
            setIsTesting(false)
        }
    }

    // Auto-set default model when provider changes to DashScope
    const handleProviderChange = (provider: string) => {
        setAiProvider(provider)
        // Switch to the key for this provider
        setAiApiKey(apiKeys[provider] || '')

        // Switch to model for this provider or default
        const savedModel = aiModels[provider]
        setAiModel(savedModel || getDefaultModel(provider))

        // Switch to base for this provider
        setAiBase(aiBases[provider] || '')
    }

    const fetchOllamaModels = useCallback(async (baseOverride?: string) => {
        const seq = ++ollamaReqSeqRef.current
        setOllamaLoading(true)
        setOllamaError('')
        try {
            const response = await api.raw('/api/ai/ollama-models', {
                headers: { 'X-AI-Base': baseOverride ?? aiBaseRef.current ?? '' },
                timeoutMs: 15_000,
            })
            if (seq !== ollamaReqSeqRef.current) return
            const data = await response.json()
            if (data.error) {
                setOllamaError(data.error)
                setOllamaModels([])
            } else {
                setOllamaModels(data.models || [])
                // Auto-select first model if current model is not in the list
                if (data.models?.length > 0 && !data.models.some((m: any) => m.name === aiModelRef.current)) {
                    setAiModel(data.models[0].name)
                    setAiModels(prev => ({ ...prev, ollama: data.models[0].name }))
                }
            }
        } catch {
            if (seq !== ollamaReqSeqRef.current) return
            setOllamaError(t('settings.ai.backendUnavailable', 'Cannot connect to the backend server'))
            setOllamaModels([])
        } finally {
            if (seq === ollamaReqSeqRef.current) {
                setOllamaLoading(false)
            }
        }
    }, [t])

    // Fetch Ollama models when provider switches to ollama. Deliberately NOT
    // keyed on aiBase/aiModel — typing in those fields must not fire requests.
    useEffect(() => {
        if (aiProvider === 'ollama') {
            void fetchOllamaModels()
        }
    }, [aiProvider, fetchOllamaModels])

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-warm-800 dark:text-white mb-2">
                    {t('settings.ai.title', 'AI 智能助手')}
                </h3>
                <p className="text-warm-500 dark:text-warm-400 text-sm">
                    {t('settings.ai.desc', '配置用于生成例句和助记的 AI 模型')}
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-warm-800 dark:text-white mb-4 flex items-center gap-2">
                    🤖 {t('settings.ai.modelSettings', 'Model Settings')}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                            {t('settings.ai.provider', 'AI Provider')}
                        </label>
                        <select
                            value={aiProvider}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="input-field w-full"
                        >
                            <option value="dashscope">{t('settings.ai.providerDashscope', 'DashScope (Qwen)')}</option>
                            <option value="openai">OpenAI (GPT-4)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="gemini">Google (Gemini)</option>
                            <option value="ollama">{t('settings.ai.providerOllama', 'Ollama (本地)')}</option>
                            <option value="custom">{t('settings.ai.providerCustom', 'Custom API')}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
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
                                placeholder={t('settings.ai.apiKeyPlaceholder', 'Enter your API key...')}
                                className="input-field w-full pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 dark:hover:text-warm-200 focus:outline-none"
                            >
                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-warm-500 mt-1">
                            {t('settings.ai.apiKeyLocalOnly', 'Your key is stored locally and will not be uploaded to the server')}
                        </p>
                    </div>

                    {/* Model selector - dynamic dropdown for Ollama, text input for others */}
                    {aiProvider !== 'custom' && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                                {t('settings.ai.modelName', 'Model Name')}
                            </label>

                            {aiProvider === 'ollama' ? (
                                <>
                                    <div className="flex gap-2">
                                        {ollamaModels.length > 0 && !ollamaError ? (
                                            <select
                                                value={aiModel}
                                                onChange={(e) => {
                                                    setAiModel(e.target.value)
                                                    setAiModels(prev => ({ ...prev, ollama: e.target.value }))
                                                }}
                                                className="input-field w-full"
                                            >
                                                {ollamaModels.map(m => (
                                                    <option key={m.name} value={m.name}>
                                                        {m.name} ({m.size}{m.parameter_size ? ` · ${m.parameter_size}` : ''})
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={aiModel}
                                                onChange={(e) => {
                                                    setAiModel(e.target.value)
                                                    setAiModels(prev => ({ ...prev, ollama: e.target.value }))
                                                }}
                                                placeholder={t('settings.ai.ollamaModelPlaceholder', 'qwen3.5:9b')}
                                                className="input-field w-full"
                                            />
                                        )}
                                        <button
                                            onClick={() => fetchOllamaModels()}
                                            disabled={ollamaLoading}
                                            className="px-3 py-2 rounded-xl bg-warm-100 dark:bg-warm-800 text-warm-600 dark:text-warm-300 hover:bg-warm-200 dark:hover:bg-warm-700 transition-all flex items-center gap-1 shrink-0"
                                            title={t('settings.ai.refreshModels', '刷新模型列表')}
                                        >
                                            <RefreshCw size={16} className={ollamaLoading ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                    {ollamaLoading && (
                                        <p className="text-xs text-primary-500 mt-1 animate-pulse">{t('settings.ai.fetchingOllama', '⏳ 正在获取 Ollama 模型列表...')}</p>
                                    )}
                                    {ollamaError && (
                                        <p className="text-xs text-amber-500 mt-1">⚠️ {ollamaError}，{t('settings.ai.manualInput', 'Please enter the model name manually')}</p>
                                    )}
                                    {!ollamaLoading && !ollamaError && ollamaModels.length > 0 && (
                                        <p className="text-xs text-green-500 mt-1">{t('settings.ai.detectedModels', { count: ollamaModels.length, defaultValue: '已检测到 ' + ollamaModels.length + ' 个本地模型'})}</p>
                                    )}
                                </>
                            ) : (
                                <div>
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
                                    {PROVIDER_MODEL_PRESETS[aiProvider] && (
                                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                            <span className="text-[11px] font-semibold text-warm-400 dark:text-warm-500 mr-1">快捷预设模型:</span>
                                            {PROVIDER_MODEL_PRESETS[aiProvider].map((preset) => {
                                                const isSelected = aiModel === preset.id
                                                return (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setAiModel(preset.id)
                                                            setAiModels(prev => ({ ...prev, [aiProvider]: preset.id }))
                                                        }}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${isSelected
                                                            ? 'bg-warm-900 text-white border-warm-900 dark:bg-white dark:text-warm-900 dark:border-white shadow-xs'
                                                            : 'bg-white/60 dark:bg-warm-800/60 text-warm-600 dark:text-warm-300 border-warm-200 dark:border-warm-700/60 hover:bg-warm-100 dark:hover:bg-warm-700/60'
                                                            }`}
                                                    >
                                                        {preset.name}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {(aiProvider === 'ollama' || aiProvider === 'custom') && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
                                {t('settings.ai.baseUrl', 'API 地址 (Base URL)')}
                            </label>
                            <input
                                type="text"
                                value={aiBase}
                                onChange={(e) => {
                                    setAiBase(e.target.value)
                                    setAiBases(prev => ({ ...prev, [aiProvider]: e.target.value }))
                                }}
                                placeholder={aiProvider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example.com/v1'}
                                className="input-field w-full"
                            />
                            {aiProvider === 'ollama' && (
                                <p className="text-xs text-warm-500 mt-1">
                                    {t('settings.ai.defaultBaseUrl', '默认地址为')} <code>http://localhost:11434/v1</code>
                                </p>
                            )}
                        </div>
                    )}

                    <div className="pt-2 flex flex-col md:flex-row gap-3">
                        <button onClick={saveAiSettings} className="btn-primary flex-1 md:flex-none">
                            {t('settings.ai.saveAiSettings', '保存 AI 设置')}
                        </button>
                        <button
                            onClick={testConnection}
                            disabled={isTesting}
                            className={`px-6 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${testResult?.success
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                : 'bg-warm-100 text-warm-700 dark:bg-warm-800 dark:text-warm-300 hover:bg-warm-200 dark:hover:bg-warm-700'
                                }`}
                        >
                            {isTesting ? t('settings.ai.testing', '正在测试...') : t('settings.ai.testConnection', '测试连接')}
                        </button>
                    </div>

                    {testResult && (
                        <div className={`p-4 rounded-xl border animate-fade-in ${testResult.success
                            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
                            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                            }`}>
                            <div className="font-bold flex items-center gap-2">
                                {testResult.success ? '✅' : '❌'} {testResult.message}
                            </div>
                            {testResult.details && (
                                <div className="mt-1 text-xs opacity-80 break-all font-mono">
                                    {testResult.details}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* EverMemOS Settings */}
            <div className="glass-card p-6 border-l-4 border-l-primary-500">
                <h3 className="text-lg font-bold text-warm-800 dark:text-white mb-4 flex items-center gap-2">
                    🧠 {t('settings.ai.evermemos', '长期记忆 (EverMemOS)')}
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-warm-700 dark:text-warm-300">
                            {t('settings.ai.enableEvermem', '启用记忆增强')}
                        </label>
                        <button
                            onClick={() => setEvermemEnabled(!evermemEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${evermemEnabled ? 'bg-primary-600' : 'bg-warm-200 dark:bg-warm-700'}`}
                        >
                            <span
                                className={`${evermemEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                            />
                        </button>
                    </div>

                    {evermemEnabled && (
                        <div className="animate-fade-in space-y-4 pt-2">
                            <div>
                                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                                    {t('settings.ai.evermemApiUrl', 'API URL')}
                                </label>
                                <input
                                    type="text"
                                    value={evermemUrl}
                                    onChange={(e) => setEvermemUrl(e.target.value)}
                                    placeholder="https://api.evermind.ai"
                                    className="input-field w-full"
                                />
                                <p className="text-xs text-warm-400 mt-1">
                                    {t('settings.ai.evermemUrlHelp', '云端用 https://api.evermind.ai，自部署用 http://127.0.0.1:8000')}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                                    {t('settings.ai.evermemApiKey', 'API Key')}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showEvermemKey ? "text" : "password"}
                                        value={evermemKey}
                                        onChange={(e) => setEvermemKey(e.target.value)}
                                        placeholder={t('settings.ai.evermemApiKeyPlaceholder', 'EverMemOS API Key')}
                                        className="input-field w-full pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowEvermemKey(!showEvermemKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 dark:hover:text-warm-200 focus:outline-none"
                                    >
                                        {showEvermemKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMemoryMgmtOpen(true)}
                                    className="flex items-center gap-2 rounded-lg bg-primary-500/10 px-3 py-2 text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-500/20 transition"
                                >
                                    🗂️ {t('settings.ai.manageMemories', 'Manage Memories')}
                                </button>
                            </div>
                            <p className="text-xs text-warm-500">
                                {t('settings.ai.evermemHelpPrefix', 'Get an API key from ')}<a href="https://console.evermind.ai" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">EverMemOS Cloud</a>{t('settings.ai.evermemHelpMiddle', ', or ')}<a href="https://github.com/EverMind-AI/EverMemOS" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">{t('settings.ai.selfHost', 'self-host it')}</a>{t('settings.ai.evermemHelpSuffix', '.')}
                            </p>
                            <MemoryManagementModal isOpen={memoryMgmtOpen} onClose={() => setMemoryMgmtOpen(false)} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
