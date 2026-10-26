// Exports rows of a table to Excel through the backend's generic
// GET /api/export/table/:table?ids=a,b,c and opens the share sheet so the
// file can be saved or sent. Used by the facilitator "Update" screen; the
// admin Search screen has its own copy of the same steps.
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiGet } from '../data/api';

export async function exportTable(table, ids) {
  try {
    const path = ids ? `/api/export/table/${table}?ids=${encodeURIComponent(ids.join(','))}` : `/api/export/table/${table}`;
    const { filename, base64 } = await apiGet(path);
    const fileUri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: filename,
      });
    } else {
      Alert.alert('Export ready', `Saved to ${fileUri}`);
    }
  } catch (e) {
    Alert.alert('Export failed', e.message || 'Please try again.');
  }
}
