import re

with open('frontend/src/pages/settings/sections/AISection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add useTranslation import if not there
if "useTranslation" not in content:
    content = content.replace("import { Eye, EyeOff, RefreshCw } from 'lucide-react'", "import { Eye, EyeOff, RefreshCw } from 'lucide-react'\nimport { useTranslation } from 'react-i18next'")
    content = content.replace("export default function AISection() {", "export default function AISection() {\n    const { t } = useTranslation()")

# Replace string instances manually using regex or simple replace
replacements = [
    ("AI 智能助手", "{t('settings.ai.title', 'AI 智能助手')}"),
    ("配置用于生成例句和助记的 AI 模型", "{t('settings.ai.desc', '配置用于生成例句和助记的 AI 模型')}"),
    ("🤖 模型配置", "🤖 {t('settings.ai.modelConfig', '模型配置')}"),
    ("服务提供商", "{t('settings.ai.provider', '服务提供商')}"),
    (">阿里云百炼<", ">{t('settings.ai.providerDashscope', '阿里云百炼')}<"),
    (">DeepSeek<", ">{t('settings.ai.providerDeepseek', 'DeepSeek')}<"),
    (">Ollama (本地)<", ">{t('settings.ai.providerOllama', 'Ollama (本地)')}<"),
    (">自定义模型<", ">{t('settings.ai.providerCustom', '自定义模型')}<"),
    ("<span>API 密钥 (API Key)</span>", "<span>{t('settings.ai.apiKey', 'API 密钥 (API Key)')}</span>"),
    ("获取 API Key ↗", "{t('settings.ai.getApiKey', '获取 API Key ↗')}"),
    ("模型名称 (Model)", "{t('settings.ai.model', '模型名称 (Model)')}"),
    ("支持自动检测", "{t('settings.ai.autoDetect', '支持自动检测')}"),
    ("刷新模型列表", "{t('settings.ai.refreshModels', '刷新模型列表')}"),
    ("正在获取 Ollama 模型列表...", "{t('settings.ai.fetchingOllama', '⏳ 正在获取 Ollama 模型列表...')}"),
    ("请手动输入模型名称", "{t('settings.ai.manualInput', '请手动输入模型名称')}"),
    ("✅ 已检测到", "{t('settings.ai.detectedModels', { count: ollamaModels.length, defaultValue: '已检测到 ' + ollamaModels.length + ' 个本地模型'})}"),
    ("API 地址 (Base URL)", "{t('settings.ai.baseUrl', 'API 地址 (Base URL)')}"),
    ("默认地址为", "{t('settings.ai.defaultBaseUrl', '默认地址为')}"),
    ("保存 AI 设置", "{t('settings.ai.saveAiSettings', '保存 AI 设置')}"),
    ("正在测试...", "{t('settings.ai.testing', '正在测试...')}"),
    ("测试连接", "{t('settings.ai.testConnection', '测试连接')}"),
    ("长期记忆 (EverMemOS)", "{t('settings.ai.evermemos', '长期记忆 (EverMemOS)')}"),
    ("启用记忆增强", "{t('settings.ai.enableEvermem', '启用记忆增强')}"),
    ("云端用 https://api.evermind.ai，自部署用 http://localhost:1995", "{t('settings.ai.evermemUrlHelp', '云端用 https://api.evermind.ai，自部署用 http://localhost:1995')}"),
]

for old, new in replacements:
    content = content.replace(old, new)

# Handle dynamic placeholder
content = re.sub(
    r'placeholder={`输入 \$\{aiProvider\} 的 API Key`}',
    r'placeholder={t(\'settings.ai.enterApiKey\', { provider: aiProvider, defaultValue: `输入 ${aiProvider} 的 API Key` })}',
    content
)

with open('frontend/src/pages/settings/sections/AISection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
