// Exports to Excel (or CSV) through the backend and opens the share sheet so the
// file can be saved or sent.
//
//   exportTable(table, ids)      -- rows of a table: GET /api/export/table/:table?ids=a,b,c
//                                   (a DSR or an audit also gets its lines as a second sheet)
//   exportReport(type, params)   -- one of the named reports, e.g. 'attendance' or 'uploads',
//                                   filtered by params such as { from, to, facilitatorId }
//   exportCsv(filename, rows)    -- a small summary built on the phone: rows is [[label, value], ...]
//
// Used by the facilitator Update and Dashboard screens; the admin Search screen
// has its own copy of the same steps.
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiGet } from '../data/api';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function shareExport(path) {
  try {
    const { filename, base64 } = await apiGet(path);
    const fileUri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: XLSX_TYPE, dialogTitle: filename });
    } else {
      Alert.alert('Export ready', `Saved to ${fileUri}`);
    }
  } catch (e) {
    Alert.alert('Export failed', e.message || 'Please try again.');
  }
}

export function exportTable(table, ids) {
  return shareExport(ids ? `/api/export/table/${table}?ids=${encodeURIComponent(ids.join(','))}` : `/api/export/table/${table}`);
}

export function exportReport(type, params = {}) {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return shareExport(`/api/export/${type}${query ? '?' + query : ''}`);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(filename, rows) {
  try {
    const text = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads it as UTF-8
    const fileUri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: filename });
    } else {
      Alert.alert('Export ready', `Saved to ${fileUri}`);
    }
  } catch (e) {
    Alert.alert('Export failed', e.message || 'Please try again.');
  }
}
