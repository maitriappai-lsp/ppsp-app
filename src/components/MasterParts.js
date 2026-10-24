// Small building blocks shared by every Masters tab (the round "+" button,
// the row icon buttons, the list header, the bottom-sheet "Add" popup and the
// "Import from Excel" card). They used to live inside MastersScreen.js; they
// are here so the PPSP master tabs (PpspMasterTabs.js) can use the same ones.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useData } from '../data/store';
import { apiPost } from '../data/api';
import { Card, SecondaryButton, SectionLabel } from './UI';
import { colors, spacing } from '../theme';

// Round "+" button shown at the top-right of each master's list.
export function AddButton({ onPress, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text style={{ color: '#fff', fontSize: 28, lineHeight: 30, fontWeight: '600' }}>+</Text>
    </TouchableOpacity>
  );
}

// Small tappable icon used in each record row (edit / deactivate / delete).
export function IconButton({ name, color, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={{ padding: 6 }}
    >
      <Ionicons name={name} size={22} color={color} />
    </TouchableOpacity>
  );
}

// Row above each list: "Resources (5)" on the left, "+" on the right.
export function ListHeader({ title, count, onAdd, addLabel }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
        {title} ({count})
      </Text>
      <AddButton onPress={onAdd} label={addLabel} />
    </View>
  );
}

// Bottom-sheet popup that holds an "Add ..." form.
export function AddModal({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: spacing.lg,
              maxHeight: '90%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ImportFromExcel({ label, table, columnsHint }) {
  const { refresh } = useData();
  const [importing, setImporting] = useState(false);

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
      const outcome = await apiPost(`/api/import/${table}`, formData);
      await refresh();
      const errorPreview = outcome.errors?.length
        ? `\n\nFirst issue: ${outcome.errors[0]}${outcome.errors.length > 1 ? ` (+${outcome.errors.length - 1} more)` : ''}`
        : '';
      Alert.alert(
        'Import complete',
        `${outcome.inserted} added, ${outcome.updated} updated, ${outcome.skipped} skipped.${errorPreview}`
      );
    } catch (e) {
      Alert.alert('Import failed', e.message || 'Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <SectionLabel>Import {label} from Excel</SectionLabel>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
        Upload an .xlsx, one row per record. Column headers (row 1): {columnsHint}. Matching rows are updated,
        new ones are added.
      </Text>
      <SecondaryButton title={importing ? 'Importing...' : 'Choose file & import'} onPress={pick} disabled={importing} />
    </Card>
  );
}
