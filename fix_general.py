import re

with open('frontend/src/pages/settings/sections/GeneralSection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { Check, Volume2, Globe } from 'lucide-react'", "import { Check, Volume2 } from 'lucide-react'")
content = content.replace("const { t, i18n } = useTranslation()", "")
content = content.replace("import { useTranslation } from 'react-i18next'", "")

with open('frontend/src/pages/settings/sections/GeneralSection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
