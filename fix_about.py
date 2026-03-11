import re

with open('frontend/src/pages/settings/sections/AboutSection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add useTranslation
if "useTranslation" not in content:
    content = content.replace("import { RefreshCw, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'", "import { RefreshCw, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'\nimport { useTranslation } from 'react-i18next'")
    content = content.replace("export default function AboutSection() {", "export default function AboutSection() {\n    const { t } = useTranslation()")

replacements = [
    ("'检查更新失败'", "t('settings.about.checkUpdateFailed', '检查更新失败')"),
    ("'下载失败'", "t('settings.about.downloadFailed', '下载失败')"),
    ("自动更新仅在打包后的应用中可用", "{t('settings.about.updateOnlyInPackaged', '自动更新仅在打包后的应用中可用')}"),
    ("正在检查更新...", "{t('settings.about.checkingUpdate', '正在检查更新...')}"),
    ("发现新版本 v", "{t('settings.about.newVersionFound', '发现新版本 v')}"),
    ("下载更新", "{t('settings.about.downloadUpdate', '下载更新')}"),
    ("下载中...", "{t('settings.about.downloading', '下载中...')}"),
    ("更新已下载完成", "{t('settings.about.downloadComplete', '更新已下载完成')}"),
    ("立即安装并重启", "{t('settings.about.installAndRestart', '立即安装并重启')}"),
    ("当前已是最新版本", "{t('settings.about.isLatestVersion', '当前已是最新版本')}"),
    ("重新检查", "{t('settings.about.recheck', '重新检查')}"),
    ("'检查更新时出错'", "t('settings.about.checkUpdateError', '检查更新时出错')"),
    ("重试", "{t('settings.about.retry', '重试')}"),
    ("检查更新", "{t('settings.about.checkUpdate', '检查更新')}"),
    (">关于软件<", ">{t('settings.about.title', '关于软件')}<"),
    ("版本信息与软件更新", "{t('settings.about.desc', '版本信息与软件更新')}"),
    (">版本信息<", ">{t('settings.about.versionInfo', '版本信息')}<"),
    (">智能生词本 Modern<", ">{t('settings.about.appName', '智能生词本 Modern')}<"),
    (">使用 React + FastAPI + AI 构建的现代化英语学习工具<", ">{t('settings.about.appDesc', '使用 React + FastAPI + AI 构建的现代化英语学习工具')}<"),
    ("主要特性：", "{t('settings.about.features', '主要特性：')}"),
    ("SM-2 间隔重复记忆算法", "{t('settings.about.feature1', 'SM-2 间隔重复记忆算法')}"),
    ("AI 智能生成例句与助记", "{t('settings.about.feature2', 'AI 智能生成例句与助记')}"),
    ("多维词典聚合查询", "{t('settings.about.feature3', '多维词典聚合查询')}"),
    ("现代化 Glassmorphism UI 设计", "{t('settings.about.feature4', '现代化 Glassmorphism UI 设计')}"),
    ("软件更新", "{t('settings.about.softwareUpdate', '软件更新')}"),
]

for old, new in replacements:
    content = content.replace(old, new)

with open('frontend/src/pages/settings/sections/AboutSection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
