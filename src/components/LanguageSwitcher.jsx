import React from 'react';
import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
    const { i18n } = useTranslation();

    const languages = [
        { code: 'pt', label: 'PT' },
        { code: 'en', label: 'EN' },
        { code: 'es', label: 'ES' }
    ];

    return (
        <div className="inline-flex items-center gap-1 bg-white/40 backdrop-blur-md rounded-full p-1 border border-white/50 shadow-sm whitespace-nowrap">
            {languages.map((lang) => (
                <button
                    key={lang.code}
                    onClick={() => i18n.changeLanguage(lang.code)}
                    className={`
            px-3 py-1 text-xs font-bold rounded-full transition-all duration-300 leading-none
            ${i18n.language === lang.code
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-white/50'}
          `}
                    aria-pressed={i18n.language === lang.code}
                >
                    {lang.label}
                </button>
            ))}
        </div>
    );
}
