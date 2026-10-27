// ---------------------------------------------------------------------------
// Thin wrapper around fetch() for talking to the backend in ../../backend.
// AuthContext calls setAuthToken() after login/logout; every other request
// (store.js) picks that token up automatically.
// ---------------------------------------------------------------------------
import { API_BASE_URL } from '../config';

let authToken = null;

// Long enough for a sleeping free-tier server to wake up (~1 min), short enough
// not to hang forever on a dead connection.
const REQUEST_TIMEOUT_MS = 60000;

export function setAuthToken(token) {
  authToken = token;
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // A request that can't reach the server (no signal, or no answer within
  // REQUEST_TIMEOUT_MS) throws an error flagged isNetworkError, so callers can
  // tell "you're offline" apart from "the server refused this" (which carries
  // the HTTP status). The offline DSR queue relies on that difference.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal: controller.signal });
  } catch (e) {
    const err = new Error('No connection to the server. Check your internet and try again.');
    err.isNetworkError = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message = (body && body.error) || `Request failed: ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return body;
}

export function apiGet(path) {
  return apiFetch(path, { method: 'GET' });
}

export function apiPost(path, data) {
  const isForm = data instanceof FormData;
  return apiFetch(path, { method: 'POST', body: isForm ? data : JSON.stringify(data) });
}

export function apiPatch(path, data) {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(data) });
}

export function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}
