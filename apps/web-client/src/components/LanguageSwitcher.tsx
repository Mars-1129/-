// =============================================================================
// TikStream AI — Language Switcher (7 locales)
// =============================================================================

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLocale = SUPPORTED_LOCALES.find(
    (locale) => locale.code === i18n.language
  ) || SUPPORTED_LOCALES[0];

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 切换语言
  const handleLanguageChange = (localeCode: string) => {
    i18n.changeLanguage(localeCode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-700 rounded-lg bg-slate-900 text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="text-base">{currentLocale.flag}</span>
        <span className="hidden sm:inline">{currentLocale.name}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 animate-fadeIn">
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale.code}
              onClick={() => handleLanguageChange(locale.code)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors duration-100 ${
                locale.code === i18n.language
                  ? 'bg-cyan-600/20 text-cyan-400'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              role="option"
              aria-selected={locale.code === i18n.language}
            >
              <span className="text-lg">{locale.flag}</span>
              <span className="flex-1">{locale.name}</span>
              {locale.code === i18n.language && (
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 添加淡入动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.15s ease-out;
  }
`;
if (!document.head.querySelector('#language-switcher-styles')) {
  style.id = 'language-switcher-styles';
  document.head.appendChild(style);
}
