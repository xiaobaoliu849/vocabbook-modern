with open('frontend/src/pages/settings/sections/AboutSection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the duplicate translations that might have happened
content = content.replace("{t('settings.about.title', '{t('settings.about.title', '关于软件')}')}", "{t('settings.about.title', '关于软件')}")
content = content.replace("t('settings.about.title', '关于软件')与{t('settings.about.softwareUpdate', '软件更新')}", "{t('settings.about.desc', '版本信息与软件更新')}")

with open('frontend/src/pages/settings/sections/AboutSection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
