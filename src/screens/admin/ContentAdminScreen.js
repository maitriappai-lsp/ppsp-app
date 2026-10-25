// SCREEN (Admin): Content -- training videos and documents, organised by
// material. Each row is ONE file linked to a material (Material ID, shown with
// its category, name and type, plus the activities that material has). A
// material can have as many files as needed. The file itself goes to the
// backend's /api/files (Cloudflare R2 when configured, local disk otherwise);
// the content row stores the returned storagePath / fileUrl, the file name, the
// file type (picked automatically from the file, but changeable) and remarks.
//
// Layout: the list comes first with a round "+" at the top right. "+" and the
// edit icon open the same form in a popup. Facilitators see the same files on
// their Content screen (screens/facilitator/ContentScreen.js).
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { todayLocalYMD } from '../../utils/date';
import { Screen, Card, Field, SectionLabel, Select, PrimaryButton, SecondaryButton } from '../../components/UI';
import { IconButton, ListHeader, AddModal } from '../../components/MasterParts';
import { colors, spacing } from '../../theme';

export const FILE_TYPES = ['Video', 'Document', 'PDF', 'PPT', 'Excel', 'Audio', 'Image', 'Other'];

// Guesses the type from the file extension. It's only a starting point: the
// form lets the admin change it (e.g. a PDF that is really a training document).
export function detectFileType(fileName) {
  const ext = (String(fileName || '').split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (['ppt', 'pptx'].includes(ext)) return 'PPT';
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'Document';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Excel';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) return 'Audio';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) return 'Video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Image';
  return 'Other';
}

export function materialTitle(m) {
  if (!m) return '--';
  return `${m.name}${m.type ? ' (' + m.type + ')' : ''}`;
}

// The selected material's category, name, type and activities.
export function MaterialInfo({ material }) {
  if (!material) return null;
  const acts = material.activities || [];
  return (
    <Card style={{ backgroundColor: colors.chipBg }}>
      <Text style={{ fontWeight: '700', color: colors.text }}>{materialTitle(material)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {material.id} - Category: {material.category}
        {material.type ? ` - Type: ${material.type}` : ''}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Activities: {acts.length ? acts.join(', ') : 'none'}</Text>
    </Card>
  );
}

export default function ContentAdminScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();

  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = adding
  const [saving, setSaving] = useState(false);

  const [materialId, setMaterialId] = useState('');
  const [activity, setActivity] = useState('');
  const [fileType, setFileType] = useState('Video');
  const [fileName, setFileName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [picked, setPicked] = useState(null);

  const materialOptions = useMemo(
    () =>
      db.materialMaster
        .slice()
        .sort(
          (a, b) =>
            (a.category || '').localeCompare(b.category || '') ||
            (a.name || '').localeCompare(b.name || '') ||
            (a.type || '').localeCompare(b.type || '')
        )
        .map((m) => ({ value: m.id, label: `${m.category} / ${materialTitle(m)}` })),
    [db.materialMaster]
  );
  const selectedMaterial = db.materialMaster.find((m) => m.id === materialId);
  const editingRow = editingId ? db.content.find((c) => c.id === editingId) : null;

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return db.content
      .filter((c) => {
        if (!q) return true;
        const m = db.materialMaster.find((x) => x.id === c.materialId);
        return [c.fileName || c.title, c.fileType, c.activity, c.remarks, m?.category, m?.name, m?.type, (m?.activities || []).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice()
      .sort((a, b) => {
        const ma = db.materialMaster.find((x) => x.id === a.materialId);
        const mb = db.materialMaster.find((x) => x.id === b.materialId);
        return (
          (ma?.category || '~').localeCompare(mb?.category || '~') ||
          (ma?.name || '~').localeCompare(mb?.name || '~') ||
          (b.date || '').localeCompare(a.date || '')
        );
      });
  }, [db.content, db.materialMaster, filter]);

  function openAdd() {
    setEditingId(null);
    setMaterialId('');
    setActivity('');
    setFileType('Video');
    setFileName('');
    setRemarks('');
    setPicked(null);
    setShowForm(true);
  }

  function openEdit(c) {
    setEditingId(c.id);
    setMaterialId(c.materialId || '');
    setActivity(c.activity || '');
    setFileType(c.fileType || 'Other');
    setFileName(c.fileName || c.title || '');
    setRemarks(c.remarks || '');
    setPicked(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setPicked(null);
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;
    setPicked(file);
    setFileName(file.name); // the admin can still rename it below
    setFileType(detectFileType(file.name));
  }

  async function save() {
    if (!materialId) return Alert.alert('Choose a material', 'Content is attached to a material -- pick one first.');
    if (!editingId && !picked) return Alert.alert('Choose a file', 'Pick the video or document to upload.');
    if (!fileName.trim()) return Alert.alert('File name', 'Enter a file name.');

    setSaving(true);
    try {
      let storagePath;
      let fileUrl;
      if (picked) {
        const formData = new FormData();
        formData.append('file', { uri: picked.uri, name: picked.name, type: picked.mimeType || 'application/octet-stream' });
        const uploaded = await apiPost('/api/files', formData);
        storagePath = uploaded.storagePath;
        fileUrl = uploaded.url;
      }

      if (editingId) {
        await updateRecord('content', editingId, {
          materialId,
          activity,
          fileType,
          fileName: fileName.trim(),
          remarks: remarks.trim(),
          ...(picked ? { storagePath, fileUrl } : {}),
        });
      } else {
        await addRecord('content', {
          id: nextId('CNT', 'content'),
          materialId,
          activity,
          fileType,
          fileName: fileName.trim(),
          remarks: remarks.trim(),
          uploadedBy: currentUser?.id,
          date: todayLocalYMD(),
          storagePath,
          fileUrl,
        });
      }
      closeForm();
    } catch (e) {
      Alert.alert(editingId ? 'Could not save' : 'Publish failed', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>Content</Text>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ListHeader title="Published" count={db.content.length} onAdd={openAdd} addLabel="Add content" />
        <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by material, category, file name, type..." />

        <AddModal visible={showForm} title={editingId ? 'Edit content' : 'Add content'} onClose={closeForm}>
          <SectionLabel>Material</SectionLabel>
          <Select
            value={materialId}
            onSelect={(v) => {
              if (v !== materialId) setActivity(''); // the activity list belongs to the material
              setMaterialId(v);
            }}
            options={materialOptions}
            placeholder="Choose material..."
          />
          {db.materialMaster.length === 0 && (
            <Text style={{ color: colors.amber, fontSize: 12, marginBottom: spacing.sm }}>
              There are no materials yet. Add them under Masters, then the Materials tab, first.
            </Text>
          )}
          <MaterialInfo material={selectedMaterial} />
          {selectedMaterial ? (
            (selectedMaterial.activities || []).length > 0 ? (
              <>
                <SectionLabel>Activity (optional)</SectionLabel>
                <Select
                  value={activity}
                  onSelect={setActivity}
                  options={[
                    { value: '', label: 'No specific activity' },
                    ...selectedMaterial.activities.map((a) => ({ value: a, label: a })),
                  ]}
                />
              </>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
                This material has no activities, so there is nothing to pick here. Activities are set under Masters, then Materials.
              </Text>
            )
          ) : null}

          <SectionLabel>File</SectionLabel>
          <SecondaryButton
            title={picked ? `Selected: ${picked.name}` : editingId ? 'Replace file (optional)' : 'Choose a file (video or document)'}
            onPress={pickFile}
            style={{ marginBottom: spacing.md }}
          />
          {editingId && !picked && editingRow?.fileUrl ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
              The current file stays unless you choose a new one.
            </Text>
          ) : null}

          <SectionLabel>File type</SectionLabel>
          <Select value={fileType} onSelect={setFileType} options={FILE_TYPES.map((t) => ({ value: t, label: t }))} />
          <Field label="File name" value={fileName} onChangeText={setFileName} placeholder="Name shown to facilitators" />
          <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />

          <PrimaryButton
            title={saving ? 'Saving...' : editingId ? 'Save changes' : 'Publish content'}
            onPress={save}
            disabled={saving}
          />
        </AddModal>

        {rows.length === 0 && (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            {db.content.length === 0 ? 'Nothing published yet. Tap + to add a video or document.' : 'No content matches your filter.'}
          </Text>
        )}

        {rows.map((c) => {
          const m = db.materialMaster.find((x) => x.id === c.materialId);
          return (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{c.fileName || c.title || c.id}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {c.fileType || '--'} - {c.date}
                  </Text>
                  {c.activity ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Activity: {c.activity}</Text> : null}
                  {m ? (
                    <>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {materialTitle(m)} - {m.category}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: colors.amber, fontSize: 12 }}>No material linked -- tap edit to link one.</Text>
                  )}
                  {c.remarks ? <Text style={{ color: colors.text, fontSize: 12, marginTop: 2 }}>{c.remarks}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {c.fileUrl ? (
                    <IconButton name="open-outline" color={colors.primary} label="View" onPress={() => Linking.openURL(c.fileUrl)} />
                  ) : null}
                  <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => openEdit(c)} />
                  <IconButton
                    name="trash-outline"
                    color={colors.red}
                    label="Remove"
                    onPress={() =>
                      Alert.alert('Remove content', `Unpublish ${c.fileName || c.title || 'this file'}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => deleteRecord('content', c.id).catch((e) => Alert.alert('Could not remove', e.message || 'Please try again.')),
                        },
                      ])
                    }
                  />
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
