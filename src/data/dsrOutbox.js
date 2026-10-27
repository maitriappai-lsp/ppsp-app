// ---------------------------------------------------------------------------
// Offline support for the facilitator DSR.
//
// Two things are kept on the phone (AsyncStorage):
//
//  1. DRAFTS -- whatever is typed into a DSR form, saved as you go, one per
//     (facilitator, date, beneficiary), so nothing is lost if the app closes
//     or there is no signal.
//
//  2. THE OUTBOX -- DSRs that were saved or submitted while offline, waiting
//     to be uploaded. There is at most one entry per DSR; a newer save
//     replaces it, and a Submit replaces any earlier draft entry.
//
// syncOutbox() uploads the queue through POST /api/dsr/save, which is safe to
// repeat (saving the same draft twice just rewrites it). What happens to each
// entry:
//   * uploaded            -> removed from the queue
//   * no connection       -> stays queued; we stop and try again later
//   * "already submitted" -> removed (the server already has it)
//   * rejected by the server for any other reason (e.g. a student that no
//     longer exists) -> kept, marked with the message, and handed back to the
//     facilitator to fix and save again. It is not retried until they do.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost } from './api';

const OUTBOX_KEY = 'ppsp-dsr-outbox-v1';
const DRAFT_PREFIX = 'ppsp-dsr-draft-v1:';

let items = null; // the queue, loaded once
let syncing = false;
const listeners = new Set();

async function load() {
  if (items) return items;
  try {
    items = JSON.parse((await AsyncStorage.getItem(OUTBOX_KEY)) || '[]');
  } catch {
    items = [];
  }
  return items;
}

async function persist() {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } finally {
    listeners.forEach((fn) => fn(items));
  }
}

export async function getOutbox() {
  return load();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// entry: { key, resourceId, date, beneficiaryId, submit, queuedAt, body }
export async function enqueue(entry) {
  await load();
  items = items.filter((i) => i.key !== entry.key);
  items.push(entry);
  await persist();
}

export async function removeEntry(key) {
  await load();
  const before = items.length;
  items = items.filter((i) => i.key !== key);
  if (items.length !== before) await persist();
}

async function markRejected(key, message) {
  await load();
  items = items.map((i) => (i.key === key ? { ...i, error: message } : i));
  await persist();
}

// Uploads everything that is waiting. Returns how many were uploaded.
export async function syncOutbox(onUploaded) {
  if (syncing) return { uploaded: 0, offline: false, busy: true };
  syncing = true;
  let uploaded = 0;
  let offline = false;
  try {
    await load();
    for (const entry of [...items]) {
      if (entry.error) continue; // waiting for the facilitator to fix it
      try {
        await apiPost('/api/dsr/save', entry.body);
        await removeEntry(entry.key);
        uploaded += 1;
      } catch (e) {
        if (e.isNetworkError) {
          offline = true;
          break; // still no connection -- try again later
        }
        if (e.status === 409 && /already been submitted/i.test(e.message || '')) {
          await removeEntry(entry.key); // the server already has this one
          uploaded += 1;
        } else if (e.status === 409) {
          continue; // a clash that should clear on its own -- retry next time
        } else {
          await markRejected(entry.key, e.message || 'The server rejected this DSR.');
        }
      }
    }
    if (uploaded > 0 && onUploaded) await onUploaded();
    return { uploaded, offline, busy: false };
  } finally {
    syncing = false;
  }
}

export function useDsrOutbox() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    getOutbox().then((l) => live && setList([...l]));
    const off = subscribe((l) => setList([...l]));
    return () => {
      live = false;
      off();
    };
  }, []);
  return list;
}

// ---- drafts ---------------------------------------------------------------

export async function loadLocalDraft(key) {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_PREFIX + key);
    return raw ? JSON.parse(raw) : null; // { savedAt, form }
  } catch {
    return null;
  }
}

export async function saveLocalDraft(key, form) {
  try {
    await AsyncStorage.setItem(DRAFT_PREFIX + key, JSON.stringify({ savedAt: Date.now(), form }));
  } catch {
    /* best effort */
  }
}

export async function clearLocalDraft(key) {
  try {
    await AsyncStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    /* best effort */
  }
}
