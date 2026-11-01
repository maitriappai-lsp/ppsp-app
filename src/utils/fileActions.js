// View or download a file stored in the cloud (an upload, or published content).
//   viewFile(url)               -- opens it in the phone's viewer / browser
//   downloadFile({ fileUrl, fileName, id }) -- saves it and opens the share sheet
//                                   so it can be kept or sent on
import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function extensionOf(url) {
  const clean = String(url || '').split('?')[0];
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1) : '';
  return /^[A-Za-z0-9]{1,5}$/.test(ext) ? ext : '';
}

// A safe local file name, with the right extension even if the display name has none.
export function localFileName(file) {
  const base = String(file.fileName || file.title || file.id || 'file').replace(/[^\w.\- ]+/g, '_');
  const ext = extensionOf(file.fileUrl);
  return ext && !base.toLowerCase().endsWith('.' + ext.toLowerCase()) ? `${base}.${ext}` : base;
}

export async function viewFile(url) {
  if (!url) return Alert.alert('Not available', 'This item has no file attached.');
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert('Could not open', e.message || 'Please try again.');
  }
}

export async function downloadFile(file) {
  if (!file.fileUrl) {
    Alert.alert('Not available', 'This item has no file attached.');
    return false;
  }
  const name = localFileName(file);
  try {
    const result = await FileSystem.downloadAsync(file.fileUrl, FileSystem.documentDirectory + name);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { dialogTitle: name });
    } else {
      Alert.alert('Downloaded', `Saved to ${result.uri}`);
    }
    return true;
  } catch (e) {
    Alert.alert('Download failed', `${name}: ${e.message || 'Please try again.'}`);
    return false;
  }
}
