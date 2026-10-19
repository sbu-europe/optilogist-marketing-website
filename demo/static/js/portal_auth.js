/**
 * Portal API auth — bridge Django admin session login to JWT for SSR portal pages.
 *
 * Tenant admins typically authenticate via /admin/login/ (session cookie).
 * Portal pages (e.g. /vendors/) call REST APIs with Bearer tokens in localStorage.
 */
'use strict';

async function dfmsIssuePortalTokenFromSession() {
  try {
    const res = await fetch('/api/v1/auth/portal-token/', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    if (data.access) {
      localStorage.setItem('dfms_access', data.access);
    }
    if (data.refresh) {
      localStorage.setItem('dfms_refresh', data.refresh);
    }
    return !!data.access;
  } catch (err) {
    return false;
  }
}

async function dfmsRefreshAccessToken() {
  const refresh = localStorage.getItem('dfms_refresh');
  if (!refresh) {
    return false;
  }
  try {
    const res = await fetch('/api/v1/auth/token/refresh/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      localStorage.removeItem('dfms_access');
      localStorage.removeItem('dfms_refresh');
      return false;
    }
    const data = await res.json();
    if (data.access) {
      localStorage.setItem('dfms_access', data.access);
    }
    if (data.refresh) {
      localStorage.setItem('dfms_refresh', data.refresh);
    }
    return !!data.access;
  } catch (err) {
    return false;
  }
}

async function dfmsRecoverAuth() {
  localStorage.removeItem('dfms_access');
  if (await dfmsIssuePortalTokenFromSession()) {
    return true;
  }
  return dfmsRefreshAccessToken();
}

async function dfmsEnsurePortalJwt() {
  if (await dfmsIssuePortalTokenFromSession()) {
    return true;
  }
  if (localStorage.getItem('dfms_access')) {
    return true;
  }
  return dfmsRefreshAccessToken();
}

async function dfmsAuthenticatedFetch(url, extra) {
  const opts =
    typeof dfmsFetchOptions === 'function'
      ? dfmsFetchOptions(extra)
      : Object.assign({ credentials: 'same-origin' }, extra || {});
  let res = await fetch(url, opts);
  if (res.status !== 401) {
    return res;
  }
  const recovered = await dfmsRecoverAuth();
  if (!recovered) {
    return res;
  }
  const retryOpts =
    typeof dfmsFetchOptions === 'function'
      ? dfmsFetchOptions(extra)
      : Object.assign({ credentials: 'same-origin' }, extra || {});
  return fetch(url, retryOpts);
}

function dfmsAuthHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('dfms_access');
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  if (typeof getCsrfToken === 'function') {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRFToken'] = csrf;
    }
  }
  return headers;
}

function dfmsFetchOptions(extra) {
  if (!extra || typeof extra !== 'object') {
    return { credentials: 'same-origin', headers: dfmsAuthHeaders() };
  }
  const { headers: extraHeaders, ...fetchExtra } = extra;
  const headers = Object.assign(dfmsAuthHeaders(), extraHeaders || {});
  if (fetchExtra.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return Object.assign({ credentials: 'same-origin', headers }, fetchExtra);
}

async function dfmsPortalLoginRedirect() {
  const next = window.location.pathname + window.location.search;
  window.location.href = '/login/?next=' + encodeURIComponent(next);
}
