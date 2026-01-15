import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useSupabaseSession() {
  const enabled = Boolean(supabase);
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    // Some Supabase email flows (confirm signup / recovery) redirect back with ?code=...
    // We must exchange it for a session.
    const maybeExchangeCode = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (!code) return;

        setLoading(true);
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!mounted) return;
        if (error) {
          setSession(null);
          setLoading(false);
          return;
        }

        // Clean the URL (remove code) after successful exchange
        url.searchParams.delete('code');
        window.history.replaceState({}, document.title, url.toString());

        setSession(data?.session || null);
        setLoading(false);
      } catch {
        // ignore and fall back to getSession
      }
    };

    maybeExchangeCode();

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(data?.session || null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession || null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [enabled]);

  return { loading, session, user: session?.user || null };
}
