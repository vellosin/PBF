import { useState, useEffect, useMemo } from 'react';
import { Upload, FileSpreadsheet, Link as LinkIcon, HelpCircle } from 'lucide-react';
import { parseExcel } from './utils/parser';
import { Dashboard } from './components/Dashboard';
import { Sidebar } from './components/Sidebar';
import { Login } from './components/Login';
import { Calendar } from './components/Calendar';
import { PatientList } from './components/PatientList';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { Tasks } from './components/Tasks';
import { AppointmentModal } from './components/AppointmentModal';
import { PaymentModal } from './components/PaymentModal';
import { Prontuarios } from './components/Prontuarios';
import { useTranslation } from 'react-i18next';
import { useAppointments } from './hooks/useAppointments';
import { useNotes } from './hooks/useNotes';
import { utils, writeFile } from 'xlsx';
import { enUS, es, ptBR } from 'date-fns/locale';
import { DebugPanel } from './components/DebugPanel';
import { debugLog, isDebugEnabled } from './utils/debug';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import { useSupabaseSession } from './hooks/useSupabaseSession';
import { useWorkspace } from './hooks/useWorkspace';
import { scopedKey } from './utils/storageKeys';
import { OnboardingTutorialModal } from './components/OnboardingTutorialModal';
import { ConfirmImportModal } from './components/ConfirmImportModal';
import { makeAppointmentKey } from './utils/notes';

function App() {
  const { t, i18n } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [, setTutorialCompleted] = useState(false);

  const calendarLanguage = useMemo(() => {
    const raw = String(i18n?.language || 'pt');
    return raw.split('-')[0] || 'pt';
  }, [i18n?.language]);

  const calendarLocale = useMemo(() => {
    if (calendarLanguage === 'en') return enUS;
    if (calendarLanguage === 'es') return es;
    return ptBR;
  }, [calendarLanguage]);

  const useSupabase = isSupabaseConfigured() && Boolean(supabase);
  const { loading: authLoading, session } = useSupabaseSession();
  const isAuthed = useSupabase ? Boolean(session) : isAuthenticated;

  const {
    loading: wsLoading,
    error: wsError,
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    selectWorkspace,
    createWorkspace,
    refresh: refreshWorkspaces,
  } = useWorkspace(session);

  // Single-user pivot: if the account has no workspace yet, create one automatically.
  // This removes the join/create workspace screen from the UX.
  const [autoWorkspaceCreating, setAutoWorkspaceCreating] = useState(false);
  const [workspaceInitError, setWorkspaceInitError] = useState('');

  useEffect(() => {
    if (!useSupabase) return;
    if (!isAuthed) return;
    if (wsLoading) return;
    if (wsError) return;
    if (selectedWorkspace?.id) return;

    // Once we have a selected workspace, clear any previous init error.
    if (workspaceInitError) setWorkspaceInitError('');

    // If memberships exist, useWorkspace already auto-selects the first one,
    // but we also cover the edge case where selectedWorkspaceId is set yet
    // selectedWorkspace isn't hydrated.
    if (Array.isArray(workspaces) && workspaces.length > 0) {
      const first = workspaces[0];
      if (first?.id) selectWorkspace(first.id);
      return;
    }

    if (autoWorkspaceCreating) return;
    setAutoWorkspaceCreating(true);
    createWorkspace('Principal')
      .catch((err) => {
        const msg = err?.message ? String(err.message) : 'Falha ao criar workspace automaticamente.';
        setWorkspaceInitError(msg);
      })
      .finally(() => setAutoWorkspaceCreating(false));
  }, [
    autoWorkspaceCreating,
    createWorkspace,
    isAuthed,
    selectWorkspace,
    selectedWorkspace?.id,
    workspaceInitError,
    useSupabase,
    workspaces,
    wsError,
    wsLoading
  ]);

  const storageWorkspaceId = useSupabase ? (selectedWorkspace?.id || '') : '';

  const normalizeText = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  // Temporary migration policy (requested): legacy "Quinzenal" becomes "Quinzenal (Ímpar)".
  // Keep existing "Quinzenal (Par)" and "Quinzenal (Ímpar)" as-is.
  const normalizeFrequency = (freqRaw) => {
    const f = normalizeText(freqRaw);
    if (f === 'quinzenal') return 'Quinzenal (Ímpar)';
    return freqRaw;
  };

  // Helper defined early to be used in initialization
  const sanitizePatient = (p, fallbackId) => {
    const sanitized = { ...p };

    // Ensure stable, non-falsy id for rendering/updates (important when id is 0 or missing)
    if (sanitized.id === undefined || sanitized.id === null || sanitized.id === '') {
      sanitized.id = fallbackId;
    }
    sanitized.id = String(sanitized.id);

    sanitized.rate = parseFloat(sanitized.rate) || 0;
    sanitized.duration = parseInt(sanitized.duration) || 50;

    // Migration: coerce legacy biweekly values.
    if (sanitized.frequency !== undefined && sanitized.frequency !== null) {
      sanitized.frequency = normalizeFrequency(String(sanitized.frequency).trim());
    }

    // Clear weekdayIdx to ensure parser recalculates it from the potentially new dayOfWeek string
    delete sanitized.weekdayIdx;
    return sanitized;
  };

  const dbPatientToApp = (row) => {
    if (!row) return null;
    return sanitizePatient(
      {
        id: String(row.id),
        name: row.name,
        rate: row.rate ?? 0,
        duration: row.duration ?? 50,
        frequency: normalizeFrequency(row.frequency || 'Semanal'),
        dayOfWeek: row.day_of_week || 'segunda-feira',
        time: row.time || '09:00',
        startDate: row.start_date || '',
        lastAdjustment: row.last_adjustment || '',
        endDate: row.end_date || '',
        active: row.active ? 'Sim' : 'Não',
        payDay: row.pay_day ?? '5',
        payRecurrence: row.pay_recurrence ?? 'Mensal',
        mode: row.mode || 'Online',
        isSocial: row.is_social ? 'Sim' : 'Não'
      },
      String(row.id)
    );
  };

  const appPatientToDb = (p) => {
    const active = String(p?.active || '').trim().toLowerCase() === 'sim';
    const isSocial = String(p?.isSocial || '').trim().toLowerCase() === 'sim';
    return {
      workspace_id: selectedWorkspaceId,
      name: String(p?.name || '').trim(),
      // Single-psychologist-per-login pivot: no psychologist field persisted.
      psychologist: null,
      rate: Number(p?.rate) || 0,
      duration: parseInt(p?.duration, 10) || 50,
      frequency: String(p?.frequency || '').trim() || null,
      day_of_week: String(p?.dayOfWeek || '').trim() || null,
      time: String(p?.time || '').trim() || null,
      start_date: p?.startDate || null,
      last_adjustment: p?.lastAdjustment || null,
      end_date: p?.endDate || null,
      active,
      pay_day: p?.payDay ?? null,
      pay_recurrence: p?.payRecurrence ?? null,
      mode: String(p?.mode || '').trim() || null,
      is_social: isSocial
    };
  };

  // Initialize from LocalStorage if available (scoped by workspace when using Supabase).
  // Note: on first render in Supabase mode, selectedWorkspace may not be known yet;
  // we also rehydrate on workspace changes below.
  const [data, setData] = useState(() => {
    try {
      const key = scopedKey('seicologia_patients', storageWorkspaceId);
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.map((p, idx) => sanitizePatient(p, `legacy-${idx}`)) : null;
    } catch {
      return null;
    }
  });

  // Rehydrate local cache whenever the effective workspace changes.
  // This prevents "empty" state on refresh while Supabase loads (or when Supabase is temporarily unavailable).
  useEffect(() => {
    if (useSupabase && !storageWorkspaceId) return;

    try {
      const key = scopedKey('seicologia_patients', storageWorkspaceId);
      const saved = localStorage.getItem(key);
      if (!saved) {
        setData(null);
        return;
      }

      const parsed = JSON.parse(saved);
      const next = Array.isArray(parsed) ? parsed.map((p, idx) => sanitizePatient(p, `cache-${idx}`)) : null;
      setData(next);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageWorkspaceId, useSupabase]);

  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState('');

  // Supabase mode: load patients for the selected workspace
  useEffect(() => {
    if (!useSupabase || !supabase) return;
    if (!selectedWorkspace?.id) return;

    let cancelled = false;
    const load = async () => {
      setPatientsLoading(true);
      setPatientsError('');
      const { data: rows, error } = await supabase
        .from('patients')
        .select('*')
        .eq('workspace_id', selectedWorkspace.id)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        const msg = error?.message ? String(error.message) : 'Falha ao carregar pacientes.';
        setPatientsError(msg);
        if (isDebugEnabled()) {
          debugLog('supabase.patients.load.error', {
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code,
            workspaceId: selectedWorkspace.id
          });
        }
        setPatientsLoading(false);
        return;
      }

      // App-side migration (immediate UX): legacy "Quinzenal" shows as "Quinzenal (Ímpar)".
      setData((rows || []).map(dbPatientToApp).filter(Boolean));

      // DB migration (requested): update existing rows in this workspace so it persists.
      // Safe: only touches rows whose frequency is exactly "Quinzenal".
      const hasLegacyQuinzenal = (rows || []).some((r) => normalizeText(r?.frequency) === 'quinzenal');
      if (hasLegacyQuinzenal) {
        supabase
          .from('patients')
          .update({ frequency: 'Quinzenal (Ímpar)' })
          .eq('workspace_id', selectedWorkspace.id)
          .eq('frequency', 'Quinzenal')
          .then(() => {})
          .catch(() => {});
      }
      setPatientsLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSupabase, selectedWorkspace?.id]);

  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');

  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState(null);

  const visiblePatients = data;

  const tutorialStorageKey = useMemo(() => {
    if (!useSupabase) return 'pbf_tutorial_done_local';
    const uid = session?.user?.id;
    return uid ? `pbf_tutorial_done_${uid}` : 'pbf_tutorial_done_unknown';
  }, [session?.user?.id, useSupabase]);

  // Decide whether to auto-open onboarding tutorial.
  useEffect(() => {
    if (!isAuthed) return;
    if (useSupabase && (!selectedWorkspace?.id || wsLoading)) return;

    // Read persisted completion state.
    let done = false;
    try {
      done = localStorage.getItem(tutorialStorageKey) === '1';
    } catch {
      done = false;
    }

    // Supabase user metadata takes precedence when available.
    const metaDone = Boolean(session?.user?.user_metadata?.onboardingCompleted);
    const hasAnyData = Array.isArray(data) && data.length > 0;

    const completed = metaDone || done;
    setTutorialCompleted(completed);

    // Only auto-open for accounts that look fresh (no data yet).
    if (!completed && !hasAnyData) {
      setIsTutorialOpen(true);
    }
  }, [
    data,
    isAuthed,
    selectedWorkspace?.id,
    session?.user?.user_metadata?.onboardingCompleted,
    tutorialStorageKey,
    useSupabase,
    wsLoading
  ]);

  const markTutorialCompleted = async () => {
    setTutorialCompleted(true);
    try {
      localStorage.setItem(tutorialStorageKey, '1');
    } catch {
      // ignore
    }

    if (!useSupabase || !supabase) return;
    try {
      await supabase.auth.updateUser({
        data: {
          ...(session?.user?.user_metadata || {}),
          onboardingCompleted: true
        }
      });
    } catch {
      // ignore
    }
  };

  // Use Custom Hook for Logic
  const {
    currentDate,
    setCurrentDate,
    displayAppointments,
    handleUpdateAppointment,
    handleAddAppointment,
    handleUpdatePayment
  } = useAppointments(visiblePatients, {
    workspaceId: selectedWorkspace?.id || '',
    useSupabase,
    supabase,
    // Avoid generating tasks/events before the account existed.
    minDate: useSupabase ? (session?.user?.created_at || null) : null
  });

  const notesWorkspaceId = useSupabase ? (selectedWorkspace?.id || '') : 'local';
  const {
    notes,
    notesByKey,
    loading: notesLoading,
    error: notesError,
    limit: notesLimit,
    refresh: refreshNotes,
    upsertNote,
    deleteAllNotes,
    deleteNoteByKey
  } = useNotes({
    workspaceId: notesWorkspaceId,
    useSupabase,
    supabase,
    limit: 50
  });

  const visibleAppointments = useMemo(() => {
    const list = Array.isArray(displayAppointments) ? displayAppointments : [];
    return list.map((evt) => {
      if ((evt?.kind || 'session') !== 'session') return evt;
      const appointmentKey = makeAppointmentKey(evt);
      if (!appointmentKey) return evt;
      const note = notesByKey?.get(appointmentKey);
      const hasNote = Boolean(note);
      const content = String(note?.content || '');
      return {
        ...evt,
        appointmentKey,
        noteId: note?.id ?? null,
        noteContent: content,
        notesDone: hasNote && content.trim().length > 0
      };
    });
  }, [displayAppointments, notesByKey]);

  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    debugLog('nav.view', { currentView });
  }, [currentView]);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    if (!selectedCalendarEvent) return;
    debugLog('calendar.openEvent', {
      kind: selectedCalendarEvent?.kind || 'session',
      id: selectedCalendarEvent?.id,
      patientId: selectedCalendarEvent?.patientId,
      name: selectedCalendarEvent?.name,
      date: selectedCalendarEvent?.date,
      originalDate: selectedCalendarEvent?.originalDate,
      time: selectedCalendarEvent?.time,
      status: selectedCalendarEvent?.status
    });
  }, [selectedCalendarEvent]);

  const debugSnapshot = useMemo(() => {
    if (!isDebugEnabled()) return null;

    const supabaseUrl = (() => {
      try {
        return String(import.meta.env.VITE_SUPABASE_URL || '') || null;
      } catch {
        return null;
      }
    })();

    const supabaseProjectRef = (() => {
      try {
        if (!supabaseUrl) return null;
        const u = new URL(supabaseUrl);
        const host = String(u.hostname || '');
        // <ref>.supabase.co
        return host.split('.')[0] || host;
      } catch {
        return null;
      }
    })();

    return {
      currentView,
      env: {
        useSupabase,
        persistSession: String(import.meta.env.VITE_SUPABASE_PERSIST_SESSION || '0') === '1',
        supabaseProjectRef,
        authRedirectTo: (() => {
          try {
            return String(import.meta.env.VITE_AUTH_REDIRECT_TO || '') || null;
          } catch {
            return null;
          }
        })()
      },
      auth: {
        userId: session?.user?.id || null,
        email: session?.user?.email || null
      },
      workspace: {
        loading: wsLoading,
        error: wsError || null,
        count: Array.isArray(workspaces) ? workspaces.length : 0,
        items: Array.isArray(workspaces)
          ? workspaces.map((w) => ({ id: w?.id || null, name: w?.name || null }))
          : null,
        selectedWorkspaceId: selectedWorkspace?.id || null,
        selectedWorkspaceName: selectedWorkspace?.name || null
      },
      patients: {
        loading: patientsLoading,
        error: patientsError || null,
        count: Array.isArray(data) ? data.length : null
      },
      selectedCalendarEvent: selectedCalendarEvent
        ? {
            kind: selectedCalendarEvent?.kind || 'session',
            id: selectedCalendarEvent?.id,
            patientId: selectedCalendarEvent?.patientId,
            name: selectedCalendarEvent?.name,
            date: selectedCalendarEvent?.date,
            originalDate: selectedCalendarEvent?.originalDate,
            time: selectedCalendarEvent?.time,
            status: selectedCalendarEvent?.status
          }
        : null
    };
  }, [
    currentView,
    data,
    patientsError,
    patientsLoading,
    selectedCalendarEvent,
    selectedWorkspace?.id,
    selectedWorkspace?.name,
    session?.user?.email,
    session?.user?.id,
    useSupabase,
    workspaces,
    wsError,
    wsLoading
  ]);

  // Persist data cache whenever it changes.
  // In Supabase mode, the DB is the source of truth; this is only a local cache per workspace.
  useEffect(() => {
    try {
      if (data) localStorage.setItem(scopedKey('seicologia_patients', storageWorkspaceId), JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [data, storageWorkspaceId]);

  const handleFile = async (file, options = {}) => {
    if (!file) return;

    const hasExisting = Array.isArray(data) && data.length > 0;
    const confirmed = Boolean(options?.confirmed);

    if (hasExisting && !confirmed) {
      setPendingImportFile(file);
      setConfirmImportOpen(true);
      return;
    }

    setLoading(true);
    try {
      const patients = await parseExcel(file);
      const sanitized = patients.map((p, idx) => sanitizePatient(p, `import-${Date.now()}-${idx}`));

      if (useSupabase && supabase && selectedWorkspaceId) {
        // Replace workspace patients with the imported sheet
        await supabase.from('patients').delete().eq('workspace_id', selectedWorkspaceId);
        const payload = sanitized.map(appPatientToDb);
        const { data: inserted, error } = await supabase.from('patients').insert(payload).select('*');
        if (error) throw error;
        setData((inserted || []).map(dbPatientToApp).filter(Boolean));
      } else {
        setData(sanitized);
      }
      setCurrentView('dashboard');
    } catch (error) {
      console.error(error);
      alert("Erro ao ler o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!sheetUrl) return;
    setLoading(true);
    try {
      let fetchUrl = sheetUrl;
      if (sheetUrl.includes('docs.google.com/spreadsheets') && !fetchUrl.includes('output=xlsx')) {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'output=xlsx';
      }
      const response = await fetch(fetchUrl);
      const blob = await response.blob();
      await handleFile(new File([blob], "sheet.xlsx"));
    } catch (error) {
      console.error(error);
      alert("Erro ao baixar planilha.");
    } finally {
      setLoading(false);
    }
  };
  const handleAddPatient = async (newPatient) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const base = sanitizePatient(newPatient, `tmp-${Date.now()}`);
    const p = {
      ...base,
      endDate: base.active === 'Não' ? (base.endDate || todayIso) : ''
    };

    if (useSupabase && supabase && selectedWorkspaceId) {
      const payload = appPatientToDb(p);
      const { data: row, error } = await supabase.from('patients').insert([payload]).select('*').single();
      if (error) throw error;
      const mapped = dbPatientToApp(row);
      setData(prev => (prev ? [...prev, mapped] : [mapped]));
      return;
    }

    const id = Date.now().toString();
    setData(prev => (prev ? [...prev, { ...p, id }] : [{ ...p, id }]));
  };

  const handleUpdatePatient = async (updatedPatient) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const pClean = sanitizePatient(updatedPatient, updatedPatient?.id);

    const existing = (data || []).find((p) => p.id === pClean.id);
    const wasActive = existing?.active === 'Sim';
    const nowActive = pClean.active === 'Sim';

    let endDate = pClean.endDate;
    if (wasActive && !nowActive) endDate = todayIso;
    else if (!wasActive && nowActive) endDate = '';

    const merged = { ...pClean, endDate };

    if (useSupabase && supabase && selectedWorkspaceId) {
      const payload = appPatientToDb(merged);
      const { data: row, error } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', merged.id)
        .eq('workspace_id', selectedWorkspaceId)
        .select('*')
        .single();
      if (error) throw error;
      const mapped = dbPatientToApp(row);
      setData(prev => prev.map(p => (p.id === mapped.id ? mapped : p)));
      return;
    }

    setData(prev => prev.map(p => (p.id === merged.id ? merged : p)));
  };

  const handleDownload = () => {
    const safe = Array.isArray(data) ? data : [];

    const exportDateIso = new Date().toISOString().split('T')[0];
    const filename = `PBF_Dados_${exportDateIso}.xlsx`;

    const toPtBrDate = (v) => {
      if (!v) return '';

      if (v instanceof Date && !Number.isNaN(v.getTime())) {
        const yyyy = v.getFullYear();
        const mm = String(v.getMonth() + 1).padStart(2, '0');
        const dd = String(v.getDate()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy}`;
      }

      const s = String(v).trim();
      if (!s) return '';

      // ISO date (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [yyyy, mm, dd] = s.slice(0, 10).split('-');
        return `${dd}/${mm}/${yyyy}`;
      }

      // Already PT-BR
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

      return s;
    };

    const columns = [
      { header: 'Pacientes', get: (p) => p?.name ?? '' },
      { header: 'Receita Sessão(R$)', get: (p) => p?.rate ?? 0 },
      { header: 'Tempo de Sessão(m)', get: (p) => p?.duration ?? 50 },
      { header: 'Semanal/Quinzenal', get: (p) => p?.frequency ?? '' },
      { header: 'Dia da Semana', get: (p) => p?.dayOfWeek ?? '' },
      { header: 'Horario', get: (p) => p?.time ?? '' },
      { header: 'Data de ingresso', get: (p) => toPtBrDate(p?.startDate) },
      { header: 'Paciente Ativo', get: (p) => p?.active ?? '' },
      { header: 'Dia de pagamento', get: (p) => p?.payDay ?? '' },
      { header: 'Recorrencia de pagamento', get: (p) => p?.payRecurrence ?? '' },
      { header: 'Data de Saida', get: (p) => toPtBrDate(p?.endDate) },
      { header: 'Paciente Social', get: (p) => p?.isSocial ?? '' },
      { header: 'Data Ultimo Reajuste', get: (p) => toPtBrDate(p?.lastAdjustment) },
      { header: 'Presencial/Online', get: (p) => p?.mode ?? '' }
    ];

    const templateExamples = [
      {
        name: 'Paciente Exemplo 1',
        rate: 180,
        duration: 50,
        frequency: 'Semanal',
        dayOfWeek: 'segunda-feira',
        time: '09:00',
        startDate: new Date(),
        active: 'Sim',
        payDay: '5',
        payRecurrence: 'Mensal',
        endDate: '',
        isSocial: 'Não',
        lastAdjustment: '',
        mode: 'Online'
      },
      {
        name: 'Paciente Exemplo 2',
        rate: 150,
        duration: 50,
        frequency: 'Quinzenal (Ímpar)',
        dayOfWeek: 'quarta-feira',
        time: '18:00',
        startDate: new Date(),
        active: 'Sim',
        payDay: '10',
        payRecurrence: 'Mensal',
        endDate: '',
        isSocial: 'Não',
        lastAdjustment: '',
        mode: 'Presencial'
      }
    ];

    const rows = safe.length > 0 ? safe : templateExamples;

    const aoa = [
      columns.map((c) => c.header),
      ...rows.map((p) => columns.map((c) => c.get(p)))
    ];

    const ws = utils.aoa_to_sheet(aoa);
    ws['!cols'] = columns.map(() => ({ wch: 22 }));

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Pacientes');
    writeFile(wb, filename);
  };


  if (useSupabase && authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Auth gate: don't attempt workspace initialization until authenticated.
  if (!isAuthed) return <Login onLogin={() => setIsAuthenticated(true)} />;

  // Workspace resolution gate (Supabase mode)
  if (useSupabase && (wsLoading || autoWorkspaceCreating)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (useSupabase && !selectedWorkspace?.id) {
    const hint =
      'Não foi possível inicializar seu workspace.\n\n' +
      'Dicas:\n' +
      '• Confirme que você executou o arquivo supabase/schema.sql no Supabase SQL Editor\n' +
      '• Confirme que a RPC create_workspace existe e está com GRANT para authenticated\n' +
      '• Abra o Console do navegador para ver detalhes';

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-xl p-6">
          <h1 className="text-lg font-extrabold text-slate-900">Erro ao iniciar</h1>
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{hint}</p>

          {workspaceInitError ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 whitespace-pre-line">
              {workspaceInitError}
            </div>
          ) : null}

          {wsError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 whitespace-pre-line">
              <div className="font-extrabold">Erro ao carregar workspaces</div>
              <div className="mt-1">{wsError}</div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={async () => {
                try {
                  setWorkspaceInitError('');
                  await refreshWorkspaces?.();
                  await createWorkspace('Principal');
                } catch (err) {
                  const msg = err?.message ? String(err.message) : 'Falha ao criar workspace.';
                  setWorkspaceInitError(msg);
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors"
            >
              Tentar novamente
            </button>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      </div>
    );
  }

  const knownViews = new Set(['dashboard', 'calendar', 'tasks', 'patients', 'prontuarios', 'files']);

  const renderFilesView = () => (
    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto w-full">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <Upload size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t('upload_title')}</h2>
            <p className="text-sm text-slate-500">{t('upload_offline_subtitle')}</p>
          </div>
        </div>

        <div
          className={`flex flex-col items-center justify-center h-52 border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer
                    ${isDragOver ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]' : 'border-slate-300 bg-slate-50/30 hover:border-indigo-400 hover:bg-slate-50'}
                    ${loading ? 'opacity-50 pointer-events-none' : ''}
                `}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
        >
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full mb-3">
            <Upload size={24} />
          </div>
          <p className="font-semibold text-slate-700">{t('upload_drop_title')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('upload_drop_sub')}</p>
          <input type="file" className="hidden" accept=".xlsx" onChange={(e) => handleFile(e.target.files[0])} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-lg shadow-slate-200/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
            <LinkIcon size={20} />
          </div>
          <h3 className="font-semibold text-slate-800">{t('sync_google_sheets_title')}</h3>
        </div>

        <div className="flex gap-3">
          <input
            className="flex-1 p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-slate-50 focus:bg-white transition-colors"
            placeholder={t('sync_google_sheets_placeholder')}
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <button
            onClick={handleUrlSubmit}
            disabled={loading || !sheetUrl}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-md shadow-indigo-200"
          >
            {loading ? '...' : t('btn_connect')}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
          <HelpCircle size={12} />
          {t('sync_google_sheets_help')}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent font-sans flex flex-row text-slate-900">
      <DebugPanel snapshot={debugSnapshot} />
      <Sidebar
        currentView={currentView}
        setView={setCurrentView}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onLogout={async () => {
          if (useSupabase && supabase) {
            await supabase.auth.signOut();
            return;
          }
          setIsAuthenticated(false);
        }}
      />

      <OnboardingTutorialModal
        open={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onComplete={markTutorialCompleted}
        onDownloadTemplate={handleDownload}
        onGoToView={(view) => {
          if (typeof view === 'string' && view) setCurrentView(view);
          setIsTutorialOpen(false);
        }}
      />

      <ConfirmImportModal
        open={confirmImportOpen}
        hasExistingData={Array.isArray(data) && data.length > 0}
        onCancel={() => {
          setConfirmImportOpen(false);
          setPendingImportFile(null);
        }}
        onDownloadOld={handleDownload}
        onContinue={() => {
          const f = pendingImportFile;
          setConfirmImportOpen(false);
          setPendingImportFile(null);
          if (f) handleFile(f, { confirmed: true });
        }}
      />

      <main className="flex-1 w-0 flex flex-col transition-all duration-300 min-h-screen">
        {/* Header Container */}
        <div className="sticky top-0 z-10 bg-white/20 backdrop-blur-md px-8 py-6 lg:px-12 lg:py-8 border-b border-white/30 mb-6">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-600">{t('app_short')}</div>
              <h1 className="text-3xl font-bold text-slate-900 capitalize tracking-tight">{t(currentView)}</h1>
            </div>
            <div className="flex gap-4 items-center">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-3 py-2 bg-white/60 text-indigo-700 rounded-xl font-semibold hover:bg-white/80 transition-colors border border-white/60 shadow-sm"
                aria-label={t('btn_export')}
                title={t('btn_export')}
                data-tutorial="export"
              >
                <FileSpreadsheet size={18} />
                <span className="hidden md:inline">{t('btn_export')}</span>
              </button>
              <LanguageSwitcher />
              <div className="w-10 h-10 rounded-full bg-white/70 border border-white/60 shadow-sm flex items-center justify-center text-indigo-700 font-bold">
                L
              </div>
            </div>
          </div>
        </div>

        {useSupabase && patientsError ? (
          <div className="px-8 lg:px-12">
            <div className="max-w-6xl mx-auto rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 whitespace-pre-line">
              <div className="font-extrabold">Falha ao carregar dados do Supabase</div>
              <div className="mt-1">{patientsError}</div>
              <div className="mt-2 text-xs text-amber-800">
                Dica: abra com <span className="font-mono">?debug=1</span> para ver o workspace selecionado e o projeto do Supabase.
              </div>
            </div>
          </div>
        ) : null}

        {/* Main Content Container */}
        <div className="px-8 lg:px-12 pb-12 flex-1">
          <div className="max-w-6xl mx-auto animate-in fade-in duration-500 space-y-8">
            {!knownViews.has(currentView) && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-2xl font-extrabold text-slate-800">{t('view_not_found_title')}</h2>
                <p className="text-slate-500 mt-2">{t('view_not_found_desc')}</p>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setCurrentView('tasks')}
                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
                  >
                    {t('go_to_tasks')}
                  </button>
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                  >
                    {t('back_to_dashboard')}
                  </button>
                </div>
              </div>
            )}

            {currentView === 'dashboard' && (data ?
              <Dashboard
                patients={visiblePatients}
                appointments={visibleAppointments}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
              /> : renderFilesView())}

            {currentView === 'calendar' && (data ?
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl shadow-slate-200/50">
                <Calendar
                  currentDate={currentDate}
                  appointments={visibleAppointments}
                  onAppointmentClick={(evt) => setSelectedCalendarEvent(evt)}
                  onDateChange={setCurrentDate}
                  locale={calendarLocale}
                  language={calendarLanguage}
                />

                {selectedCalendarEvent ? (
                  selectedCalendarEvent?.kind === 'payment' ? (
                    <PaymentModal
                      paymentEvent={selectedCalendarEvent}
                      onClose={() => setSelectedCalendarEvent(null)}
                      onUpdatePayment={handleUpdatePayment}
                    />
                  ) : (
                    <AppointmentModal
                      appointment={selectedCalendarEvent}
                      onClose={() => setSelectedCalendarEvent(null)}
                      onUpdate={(appt, newObj) => {
                        // If user reschedules a single occurrence, create an extra session for the new slot.
                        if (newObj?.status === 'rescheduled' && newObj?.newDate && newObj?.newTime) {
                          const nowIso = new Date().toISOString();

                          const fromDateRaw = appt?.originalDate ?? appt?.date;
                          const fromDateObj = fromDateRaw instanceof Date ? fromDateRaw : new Date(fromDateRaw);
                          const fromDateIso = Number.isNaN(fromDateObj.getTime())
                            ? ''
                            : `${fromDateObj.getFullYear()}-${String(fromDateObj.getMonth() + 1).padStart(2, '0')}-${String(fromDateObj.getDate()).padStart(2, '0')}`;

                          // Mark original as rescheduled (persist the target + timestamp for future analytics)
                          handleUpdateAppointment(appt, {
                            status: 'rescheduled',
                            rescheduledAt: nowIso,
                            rescheduledTo: { date: String(newObj.newDate), time: String(newObj.newTime) }
                          });

                          // Parse YYYY-MM-DD as LOCAL date (new Date('YYYY-MM-DD') is UTC and can shift a day)
                          const parts = String(newObj.newDate).split('-').map((x) => parseInt(x, 10));
                          const y = parts[0];
                          const m = parts[1];
                          const d = parts[2];
                          const date = (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d))
                            ? new Date(y, m - 1, d)
                            : new Date(String(newObj.newDate));

                          if (!Number.isNaN(date.getTime())) {
                            handleAddAppointment({
                              ...appt,
                              date,
                              originalDate: date,
                              time: String(newObj.newTime),
                              status: 'scheduled',
                              isExtra: true,
                              rescheduledAt: nowIso,
                              rescheduledFrom: {
                                patientId: String(appt?.patientId ?? appt?.id ?? ''),
                                date: fromDateIso,
                                time: String(appt?.time || '')
                              }
                            });
                          }

                          setSelectedCalendarEvent(null);
                          return;
                        }

                        handleUpdateAppointment(appt, newObj);
                      }}
                      onUpsertNote={upsertNote}
                    />
                  )
                ) : null}
              </div>
              : renderFilesView())}

            {currentView === 'tasks' && (
              <Tasks
                appointments={visibleAppointments}
                onUpdateAppointment={handleUpdateAppointment}
                onUpdatePayment={handleUpdatePayment}
                onUpsertNote={upsertNote}
              />
            )}

            {currentView === 'patients' && (
              <PatientList
                patients={patientsLoading ? null : visiblePatients}
                onAddPatient={handleAddPatient}
                onUpdatePatient={handleUpdatePatient}
              />
            )}

            {currentView === 'prontuarios' && (
              <Prontuarios
                notes={notes}
                patients={visiblePatients}
                limit={notesLimit}
                loading={notesLoading}
                error={notesError}
                onRefresh={refreshNotes}
                onUpsert={upsertNote}
                onDeleteAll={deleteAllNotes}
                onDeleteOne={deleteNoteByKey}
              />
            )}
            {currentView === 'files' && renderFilesView()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
