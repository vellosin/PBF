import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, LayoutDashboard, Calendar, Users, FileSpreadsheet, FileText, LogOut, Settings, ListTodo, HelpCircle } from 'lucide-react';

export function Sidebar({ currentView, setView, onLogout, onOpenTutorial }) {
    const { t } = useTranslation();
    const [mobileExpanded, setMobileExpanded] = useState(false);

    const menuItems = useMemo(
        () => [
            { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
            { id: 'calendar', label: t('calendar'), icon: Calendar },
            { id: 'tasks', label: t('tasks'), icon: ListTodo },
            { id: 'patients', label: t('patients'), icon: Users },
            { id: 'prontuarios', label: t('prontuarios'), icon: FileText },
            { id: 'files', label: t('files'), icon: FileSpreadsheet },
        ],
        [t]
    );

    const isExpanded = mobileExpanded;
    const handleNavigate = (id) => {
        setView(id);
        setMobileExpanded(false);
    };

    return (
        <aside
            className={
                `bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 border-r border-white/10 text-slate-100 flex flex-col h-screen sticky top-0 z-20 transition-all duration-300 shrink-0 ` +
                `w-16 ${isExpanded ? 'w-56' : ''} lg:w-72`
            }
        >
            <div className="h-24 flex items-center justify-center lg:justify-start lg:px-8 border-b border-white/10 relative">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-900/30 shrink-0">
                    <span className="font-extrabold text-[11px] tracking-[0.28em]">{t('app_short')}</span>
                </div>
                <span className={`ml-3 font-brand font-semibold text-[22px] text-white tracking-tight ${isExpanded ? 'block' : 'hidden'} lg:block`}>
                    {t('app_title')}
                </span>

                <button
                    type="button"
                    onClick={() => setMobileExpanded((v) => !v)}
                    aria-label={isExpanded ? t('sidebar_collapse') : t('sidebar_expand')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 lg:hidden w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors flex items-center justify-center"
                >
                    {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
            </div>

            <nav className="flex-1 py-8 px-4 space-y-2">
                {menuItems.map(item => {
                    const isActive = currentView === item.id;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => handleNavigate(item.id)}
                            className={`w-full flex items-center p-3.5 rounded-xl transition-all duration-200 group relative
                                ${isActive ? 'bg-white/10 text-white shadow-sm' : 'text-slate-300 hover:bg-white/5 hover:text-white'}
                            `}
                        >
                            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className={`shrink-0 ${isActive ? 'text-blue-300' : 'text-slate-300 group-hover:text-white'}`} />
                            <span
                                className={
                                    `ml-3 font-medium truncate ` +
                                    `${isExpanded ? 'block text-sm' : 'hidden'} lg:block lg:text-base ` +
                                    `${isActive ? 'font-semibold' : ''}`
                                }
                            >
                                {item.label}
                            </span>
                            {isActive && (
                                <div className="absolute right-0 w-1.5 h-8 bg-blue-400 rounded-l-full" />
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10 space-y-2">
                <button
                    type="button"
                    onClick={() => onOpenTutorial?.()}
                    className="w-full flex items-center p-3 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                    <HelpCircle size={24} />
                    <span className={`ml-3 font-medium truncate ${isExpanded ? 'block text-sm' : 'hidden'} lg:block lg:text-base`}>
                        {t('tutorial')}
                    </span>
                </button>
                <button className="w-full flex items-center p-3 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                    <Settings size={24} />
                    <span className={`ml-3 font-medium truncate ${isExpanded ? 'block text-sm' : 'hidden'} lg:block lg:text-base`}>
                        {t('settings')}
                    </span>
                </button>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center p-3 rounded-xl text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                    <LogOut size={24} />
                    <span className={`ml-3 font-bold truncate ${isExpanded ? 'block text-sm' : 'hidden'} lg:block lg:text-base`}>
                        {t('logout')}
                    </span>
                </button>
            </div>
        </aside>
    );
}
