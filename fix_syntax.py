with open('frontend/src/pages/settings/sections/AboutSection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("t('settings.about.checkUpdateFailed', '{t('settings.about.checkUpdate', '检查更新')}失败')", "t('settings.about.checkUpdateFailed', '检查更新失败')")
content = content.replace("{t('settings.about.checkingUpdate', '正在{t('settings.about.checkUpdate', '检查更新')}...')}", "{t('settings.about.checkingUpdate', '正在检查更新...')}")
content = content.replace("t('settings.about.checkUpdateError', '{t('settings.about.checkUpdate', '检查更新')}时出错')", "t('settings.about.checkUpdateError', '检查更新时出错')")
content = content.replace("{t('settings.about.desc', '版本信息与{t('settings.about.softwareUpdate', '软件更新')}')}", "{t('settings.about.desc', '版本信息与软件更新')}")

with open('frontend/src/pages/settings/sections/AboutSection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
