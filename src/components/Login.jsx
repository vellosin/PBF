import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export function Login({ onLogin }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('signin'); // signin | signup | reset
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const useSupabase = isSupabaseConfigured() && Boolean(supabase);
    const allowLocalAuth = String(import.meta.env.VITE_ALLOW_LOCAL_AUTH || '0') === '1';
    const allowSignup = String(import.meta.env.VITE_ALLOW_SIGNUP || '1') === '1';

    const effectiveMode = (!allowSignup && mode === 'signup') ? 'signin' : mode;

    const getAuthRedirectTo = () => {
        try {
            const forced = String(import.meta.env.VITE_AUTH_REDIRECT_TO || '').trim();
            if (forced) return forced;
        } catch {
            // ignore
        }
        return window.location.origin;
    };

    const handleLogin = (e) => {
        e.preventDefault();

        // Local-only fallback mode
        if (!useSupabase) {
            if (!allowLocalAuth) {
                setMessage(t('login_err_supabase_missing'));
                setLoading(false);
                return;
            }

            setLoading(true);
            setTimeout(() => {
                onLogin?.();
                setLoading(false);
            }, 300);
            return;
        }

        setMessage('');
        setLoading(true);

        const run = async () => {
            if (effectiveMode === 'reset') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: getAuthRedirectTo()
                });
                if (error) throw error;
                setMessage(t('login_msg_reset_sent'));
                setMode('signin');
                return;
            }

            if (effectiveMode === 'signup') {
                if (!allowSignup) throw new Error(t('login_err_signup_disabled'));
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: getAuthRedirectTo(),
                        data: {
                            onboardingCompleted: false
                        }
                    }
                });
                if (error) throw error;
                setMessage(t('login_msg_signup_created'));
                setMode('signin');
                return;
            }

            // signin
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            if (error) throw error;
            onLogin?.(); // App can ignore this if it derives auth from session
        };

        run()
            .catch((err) => {
                setMessage(err?.message || t('login_err_auth'));
            })
            .finally(() => setLoading(false));
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 p-6">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-12 w-full max-w-md border border-white/20 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex flex-col items-center mb-10">
                    <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30 mb-6">
                        <Brain size={48} />
                    </div>
                    <h1 className="text-3xl font-brand font-semibold text-slate-900 tracking-tight text-center mb-2">{t('app_title')}</h1>
                    <p className="text-slate-500 text-center font-medium">{t('login_subtitle')}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {useSupabase ? (
                        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => { setMode('signin'); setMessage(''); }}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${effectiveMode === 'signin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('login_tab_signin')}
                            </button>
                            {allowSignup ? (
                                <button
                                    type="button"
                                    onClick={() => { setMode('signup'); setMessage(''); }}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${effectiveMode === 'signup' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {t('login_tab_signup')}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => { setMode('reset'); setMessage(''); }}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${effectiveMode === 'reset' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t('login_tab_reset')}
                            </button>
                        </div>
                    ) : null}

                    {message ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            {message}
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 ml-1">{t('login_email')}</label>
                        <input
                            type="email"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
                            placeholder={t('login_email_placeholder')}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    {effectiveMode !== 'reset' ? (
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 ml-1">{t('login_password')}</label>
                            <input
                                type="password"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>
                    ) : null}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-xl shadow-indigo-500/20 transform transition-all hover:-translate-y-1 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                {mode === 'signin' ? t('login_submit_signin') : mode === 'signup' ? t('login_submit_signup') : t('login_submit_reset')}
                                <ArrowRight size={20} />
                            </>
                        )}
                    </button>

                    {!useSupabase ? (
                        <div className="text-center text-xs text-white/80">
                            {allowLocalAuth
                                ? t('login_local_mode_insecure')
                                : t('login_local_mode_disabled')}
                        </div>
                    ) : null}
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
                    {t('login_footer', { year: new Date().getFullYear() })}
                </div>
            </div>
        </div>
    );
}
