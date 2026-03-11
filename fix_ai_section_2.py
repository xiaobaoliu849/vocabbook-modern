import re

with open('frontend/src/pages/settings/sections/AISection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix nested curly braces and JSX text nodes
content = content.replace("'{t(\\'settings.ai.testing\\', \\'正在测试...\\')}'", "t('settings.ai.testing', '正在测试...')")
content = content.replace("'{t(\\'settings.ai.testConnection\\', \\'测试连接\\')}'", "t('settings.ai.testConnection', '测试连接')")
content = content.replace("{isTesting ? '{t('settings.ai.testing', '正在测试...')}' : '{t('settings.ai.testConnection', '测试连接')}'}", "{isTesting ? t('settings.ai.testing', '正在测试...') : t('settings.ai.testConnection', '测试连接')}")

with open('frontend/src/pages/settings/sections/AISection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
