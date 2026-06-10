// =============================================================================
// TikStream AI — i18n 初始化
// 支持 7 种语言，覆盖 TikTok Shop 核心市场
// =============================================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import idID from './locales/id-ID.json';
import thTH from './locales/th-TH.json';
import viVN from './locales/vi-VN.json';
import jaJP from './locales/ja-JP.json';
import koKR from './locales/ko-KR.json';

export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'id-ID', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'th-TH', name: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'vi-VN', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ja-JP', name: '日本語', flag: '🇯🇵' },
  { code: 'ko-KR', name: '한국어', flag: '🇰🇷' },
] as const;

// 语言代码到支持的语言的映射
const LANGUAGE_MAPPING: Record<string, string> = {
  // 精确匹配
  'zh': 'zh-CN',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-CN',
  'zh-HK': 'zh-CN',
  'en': 'en-US',
  'en-US': 'en-US',
  'en-GB': 'en-US',
  'id': 'id-ID',
  'id-ID': 'id-ID',
  'th': 'th-TH',
  'th-TH': 'th-TH',
  'vi': 'vi-VN',
  'vi-VN': 'vi-VN',
  'ja': 'ja-JP',
  'ja-JP': 'ja-JP',
  'ko': 'ko-KR',
  'ko-KR': 'ko-KR',
};

/**
 * 检测浏览器语言并映射到支持的语言
 * @returns 支持的语言代码，如果浏览器语言不在支持列表中则返回 null
 */
export function detectBrowserLocale(): string | null {
  // 优先从 localStorage 获取用户保存的语言设置
  const savedLocale = localStorage.getItem('i18nextLng');
  if (savedLocale && SUPPORTED_LOCALES.some(locale => locale.code === savedLocale)) {
    return savedLocale;
  }

  // 获取浏览器语言
  const browserLanguages = navigator.languages || [navigator.language];

  for (const lang of browserLanguages) {
    // 尝试完整匹配 (如 zh-CN, en-US)
    if (LANGUAGE_MAPPING[lang]) {
      return LANGUAGE_MAPPING[lang];
    }
    // 尝试匹配语言前缀 (如 zh, en)
    const prefix = lang.split('-')[0].toLowerCase();
    if (LANGUAGE_MAPPING[prefix]) {
      return LANGUAGE_MAPPING[prefix];
    }
  }

  return null;
}

// 获取初始语言
const getInitialLanguage = (): string => {
  const detectedLocale = detectBrowserLocale();
  return detectedLocale || 'zh-CN';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
      'id-ID': { translation: idID },
      'th-TH': { translation: thTH },
      'vi-VN': { translation: viVN },
      'ja-JP': { translation: jaJP },
      'ko-KR': { translation: koKR },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  });

export default i18n;
