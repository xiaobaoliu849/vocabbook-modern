import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import zhTranslation from './locales/zh/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslation
      },
      zh: {
        translation: zhTranslation
      }
    },
    // The user requested English to be prioritized ("UI得优先使用英语").
    fallbackLng: 'en',
    // Set default lng to English. This matches "UI得优先使用英语".
    // We can just use the language detected by LanguageDetector but default to 'en'
    lng: localStorage.getItem('i18nextLng') || 'en',
    debug: false,
    interpolation: {
      escapeValue: false // React already escapes by default
    }
  });

export default i18n;
