import re

with open('frontend/src/pages/settings/sections/AISection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix nested curly braces and JSX text nodes
content = content.replace("'{t(\\'settings.ai.testing\\', \\'正在测试...\\')}'", "t('settings.ai.testing', '正在测试...')")
content = content.replace("'{t(\\'settings.ai.testConnection\\', \\'测试连接\\')}'", "t('settings.ai.testConnection', '测试连接')")
content = content.replace("title=\"{t('settings.ai.refreshModels', '刷新模型列表')}\"", "title={t('settings.ai.refreshModels', '刷新模型列表')}")
content = content.replace("⏳ {t('settings.ai.fetchingOllama', '⏳ 正在获取 Ollama 模型列表...')}", "{t('settings.ai.fetchingOllama', '⏳ 正在获取 Ollama 模型列表...')}")
content = content.replace("{t('settings.ai.detectedModels', { count: ollamaModels.length, defaultValue: '已检测到 ' + ollamaModels.length + ' 个本地模型'})} {ollamaModels.length} 个本地模型", "{t('settings.ai.detectedModels', { count: ollamaModels.length, defaultValue: '已检测到 ' + ollamaModels.length + ' 个本地模型'})}")

with open('frontend/src/pages/settings/sections/AISection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
