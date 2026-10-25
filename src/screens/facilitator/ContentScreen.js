// SCREEN (Facilitator): Content library -- training videos and documents the
// Admin published (screens/admin/ContentAdminScreen.js), organised by
// material. Pick a material (or search) to see its category, name, type and
// activities, and every file available for it. Each file can be viewed (opens
// in the phone's viewer/browser) or downloaded (saved/shared from the share
// sheet), and several files can be ticked and downloaded one after another.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Linking, Alert, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useData } from '../../data/store';
import { Screen, Card, Field, Select, PrimaryButton } from '../../components/UI';
import { IconButton } from '../../components/MasterParts';
import { MaterialInfo } from '../admin/ContentAdminScreen';
import { colors, spacing } from '../../theme';

function extensionOf(url) {
  const clean = String(url || '').split('?')[0];
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1) : '';
  return /^[A-Za-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function localName(file) {
  const base = String(file.fileName || file.title || file.id).replace(/[^\w.\- ]+/g, '_');
  const ext = extensionOf(file.fileUrl);
  return ext && !base.toLowerCase().endsWith('.' + ext.toLowerCase()) ? `${base}.${ext}` : base;
}

export default function ContentScreen() {
  const { db } = useData();
  const [materialId, setMaterialId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // Only materials that actually have at least one file.
  const groups = useMemo(() => {
    const byMaterial = {};
    db.content.forEach((c) => {
      if (c.materialId) (byMaterial[c.materialId] = byMaterial[c.materialId] || []).push(c);
    });
    const q = query.trim().toLowerCase();
    return db.materialMaster
      .filter((m) => byMaterial[m.id])
      .filter((m) => !materialId || m.id === materialId)
      .map((m) => ({ material: m, files: byMaterial[m.id].slice().sort((a, b) => (a.activity || '').localeCompare(b.activity || '') || (a.fileName || '').localeCompare(b.fileName || '')) }))
      .filter(({ material: m, files }) => {
        if (!q) return true;
        const text = [m.category, m.name, m.type, (m.activities || []).join(' '), ...files.flatMap((f) => [f.fileName, f.fileType, f.activity, f.remarks])];
        return text.filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.material.category || '').localeCompare(b.material.category || '') || (a.material.name || '').localeCompare(b.material.name || ''));
  }, [db.content, db.materialMaster, materialId, query]);

  const materialOptions = useMemo(() => {
    const withFiles = new Set(db.content.map((c) => c.materialId).filter(Boolean));
    return [
      { value: '', label: 'All materials' },
      ...db.materialMaster
        .filter((m) => withFiles.has(m.id))
        .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''))
        .map((m) => ({ value: m.id, label: `${m.category} / ${m.name}${m.type ? ' (' + m.type + ')' : ''}` })),
    ];
  }, [db.content, db.materialMaster]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function view(file) {
    if (!file.fileUrl) return Alert.alert('Not available', 'This item has no file attached.');
    try {
      await Linking.openURL(file.fileUrl);
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Please try again.');
    }
  }

  async function download(file) {
    if (!file.fileUrl) {
      Alert.alert('Not available', 'This item has no file attached.');
      return false;
    }
    try {
      const result = await FileSystem.downloadAsync(file.fileUrl, FileSystem.documentDirectory + localName(file));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { dialogTitle: localName(file) });
      } else {
        Alert.alert('Downloaded', `Saved to ${result.uri}`);
      }
      return true;
    } catch (e) {
      Alert.alert('Download failed', `${localName(file)}: ${e.message || 'Please try again.'}`);
      return false;
    }
  }

  async function downloadSelected() {
    const files = db.content.filter((c) => selected.has(c.id));
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const f of files) {
        await download(f);
      }
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>Content</Text>

      <Select value={materialId} onSelect={setMaterialId} options={materialOptions} placeholder="All materials" />
      <Field placeholder="Search by material, category, activity or file" value={query} onChangeText={setQuery} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {groups.length === 0 && (
          <Text style={{ color: colors.textMuted }}>
            {db.content.length === 0 ? 'No content has been published yet.' : 'Nothing matches. Try another material or search.'}
          </Text>
        )}

        {groups.map(({ material, files }) => (
          <View key={material.id} style={{ marginBottom: spacing.md }}>
            <MaterialInfo material={material} />
            {files.map((f) => {
              const checked = selected.has(f.id);
              return (
                <Card key={f.id} style={{ paddingVertical: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => toggle(f.id)} style={{ padding: 4, marginRight: spacing.sm }}>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          borderWidth: 2,
                          borderColor: checked ? colors.primary : colors.border,
                          backgroundColor: checked ? colors.primary : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {checked && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{'\u2713'}</Text>}
                      </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{f.fileName || f.title || f.id}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{f.fileType || '--'}</Text>
                      {f.activity ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Activity: {f.activity}</Text> : null}
                      {f.remarks ? <Text style={{ color: colors.text, fontSize: 12 }}>{f.remarks}</Text> : null}
                    </View>
                    <IconButton name="eye-outline" color={colors.primary} label="View" onPress={() => view(f)} />
                    <IconButton name="download-outline" color={colors.primary} label="Download" onPress={() => download(f)} />
                  </View>
                </Card>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {selected.size > 0 && (
        <PrimaryButton
          title={busy ? 'Downloading...' : `Download selected (${selected.size})`}
          onPress={downloadSelected}
          disabled={busy}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </Screen>
  );
}
