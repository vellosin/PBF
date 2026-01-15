const STORAGE_KEY = 'seicologia_debug_log';
const LAST_ERROR_KEY = 'seicologia_last_error';
const DEBUG_FLAG_KEY = 'seicologia_debug';

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const isDebugEnabled = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      localStorage.setItem(DEBUG_FLAG_KEY, '1');
      return true;
    }
    return localStorage.getItem(DEBUG_FLAG_KEY) === '1';
  } catch {
    return false;
  }
};

export const setDebugEnabled = (enabled) => {
  try {
    localStorage.setItem(DEBUG_FLAG_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
};

export const getDebugLog = () => {
  try {
    return safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
  } catch {
    return [];
  }
};

export const clearDebugLog = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const getLastError = () => {
  try {
    return safeJsonParse(localStorage.getItem(LAST_ERROR_KEY), null);
  } catch {
    return null;
  }
};

export const clearLastError = () => {
  try {
    localStorage.removeItem(LAST_ERROR_KEY);
  } catch {
    // ignore
  }
};

export const debugLog = (category, payload) => {
  if (!isDebugEnabled()) return;

  const entry = {
    t: new Date().toISOString(),
    category: String(category || 'log'),
    payload: payload ?? null
  };

  try {
    const prev = getDebugLog();
    const next = [...prev, entry].slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }

  try {
    // Keep console output concise and readable.
    // eslint-disable-next-line no-console
    console.debug(`[debug] ${entry.category}`, entry.payload);
  } catch {
    // ignore
  }
};

let handlersInstalled = false;
export const installGlobalErrorHandlers = () => {
  if (handlersInstalled) return;
  handlersInstalled = true;

  if (!isDebugEnabled()) return;

  const persistLastError = (data) => {
    try {
      localStorage.setItem(LAST_ERROR_KEY, JSON.stringify({
        t: new Date().toISOString(),
        ...data
      }));
    } catch {
      // ignore
    }
  };

  window.addEventListener('error', (event) => {
    const data = {
      type: 'error',
      message: event?.message,
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
      stack: event?.error?.stack
    };
    debugLog('window.error', data);
    persistLastError(data);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const data = {
      type: 'unhandledrejection',
      message: reason?.message || String(reason),
      stack: reason?.stack
    };
    debugLog('window.unhandledrejection', data);
    persistLastError(data);
  });
};
