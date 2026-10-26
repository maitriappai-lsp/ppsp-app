// SCREEN (Facilitator): Update -- one place for the three lists a facilitator
// keeps for their OWN assigned beneficiary:
//
//   Students  -- the student list (add, edit, delete)          [built]
//   Books     -- the book stock at the beneficiary             [next]
//   Stock     -- the teaching-material stock at the beneficiary [next]
//
// The beneficiary is whichever one the facilitator is currently allocated to
// (Masters > Allocations, set by the Admin). The backend also refuses writes
// to any other beneficiary's records, so this isn't only a screen rule.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { exportTable } from '../../utils/exportTable';
import { Screen, Card, Field, DateField, PrimaryButton, SecondaryButton, SectionLabel } from '../../components/UI';
import { IconButton, ListHeader, AddModal } from '../../components/MasterParts';
import { colors, spacing } from '../../theme';

const SECTIONS = [
  { key: 'students', label: 'Students', icon: 'people-outline' },
  { key: 'books', label: 'Books', icon: 'book-outline' },
  { key: 'stock', label: 'Stock', icon: 'cube-outline' },
];

function benLabel(b) {
  return b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--';
}

// The facilitator's current beneficiary, or null if they have no active allocation.
function useMyBeneficiary() {
  const { currentUser } = useAuth();
  const { db } = useData();
  const me = currentUser?.id;
  const allocation = db.allocations.find((a) => a.active !== false && (a.resource1Id === me || a.resource2Id === me));
  const beneficiary = allocation ? db.beneficiaries.find((b) => b.id === allocation.beneficiaryId) : null;
  return { me, beneficiary };
}

function NotAssigned() {
  return (
    <Card>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: spacing.xs }}>You aren't assigned to a beneficiary yet</Text>
      <Text style={{ color: colors.textMuted }}>Ask your admin to add you under Masters, Allocations. Then you can keep your lists here.</Text>
    </Card>
  );
}

function ComingNext({ title }) {
  return (
    <Card>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: spacing.xs }}>{title}</Text>
      <Text style={{ color: colors.textMuted }}>This list is coming in the next update.</Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

function StudentsSection() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const { me, beneficiary } = useMyBeneficiary();

  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [joined, setJoined] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentContact, setParentContact] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eName, setEName] = useState('');
  const [eJoined, setEJoined] = useState('');
  const [eParentName, setEParentName] = useState('');
  const [eParentContact, setEParentContact] = useState('');

  const students = useMemo(
    () =>
      db.studentMaster
        .filter((s) => beneficiary && s.beneficiaryId === beneficiary.id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [db.studentMaster, beneficiary]
  );

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return students.filter((s) => !q || [s.name, s.parentName, s.parentContact].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [students, filter]);

  if (!beneficiary) return <NotAssigned />;

  const stamp = () => ({ updatedBy: me, updatedAt: new Date().toISOString() });

  function failed(title, e) {
    Alert.alert(title, e?.message || 'Please try again.');
  }

  async function reallyAdd() {
    setSaving(true);
    try {
      await addRecord('studentMaster', {
        id: nextId('STU', 'studentMaster'),
        beneficiaryId: beneficiary.id,
        name: name.trim(),
        joinedDate: joined,
        parentName: parentName.trim(),
        parentContact: parentContact.trim(),
        ...stamp(),
      });
      setName('');
      setJoined('');
      setParentName('');
      setParentContact('');
      setShowAdd(false);
    } catch (e) {
      failed('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  function add() {
    if (!name.trim()) return Alert.alert('Missing fields', 'Student name is required.');
    const twin = students.some((s) => (s.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (!twin) return reallyAdd();
    Alert.alert('Same name already on your list', `${name.trim()} is already on the list. Add another student with the same name?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add anyway', onPress: reallyAdd },
    ]);
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEName(s.name || '');
    setEJoined(s.joinedDate || '');
    setEParentName(s.parentName || '');
    setEParentContact(s.parentContact || '');
  }

  async function saveEdit() {
    if (!eName.trim()) return Alert.alert('Missing fields', 'Student name is required.');
    setSaving(true);
    try {
      await updateRecord('studentMaster', editingId, {
        name: eName.trim(),
        joinedDate: eJoined,
        parentName: eParentName.trim(),
        parentContact: eParentContact.trim(),
        ...stamp(),
      });
      setEditingId(null);
    } catch (e) {
      failed('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  function remove(s) {
    Alert.alert('Delete student', `Remove ${s.name}? They will also drop out of any DSR lines they were part of.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('studentMaster', s.id).catch((e) => failed('Could not delete', e)) },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ fontWeight: '700', color: colors.text }}>{benLabel(beneficiary)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Your assigned beneficiary</Text>
        </Card>

        <ListHeader title="Students" count={students.length} onAdd={() => setShowAdd(true)} addLabel="Add student" />
        <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by name or parent..." />

        <AddModal visible={showAdd} title="Add student" onClose={() => setShowAdd(false)}>
          <Field label="Student name" value={name} onChangeText={setName} placeholder="Full name" />
          <DateField label="Joined date (optional)" value={joined} onChange={setJoined} />
          <Field label="Parent name (optional)" value={parentName} onChangeText={setParentName} />
          <Field label="Parent contact (optional)" value={parentContact} onChangeText={setParentContact} keyboardType="phone-pad" />
          <PrimaryButton title={saving ? 'Saving...' : 'Add student'} onPress={add} disabled={saving} />
        </AddModal>

        {shown.length === 0 && (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            {students.length === 0 ? 'No students on your list yet. Tap + to add one.' : 'No students match your filter.'}
          </Text>
        )}

        {shown.map((s) =>
          editingId === s.id ? (
            <Card key={s.id}>
              <SectionLabel>Edit student</SectionLabel>
              <Field label="Student name" value={eName} onChangeText={setEName} />
              <DateField label="Joined date (optional)" value={eJoined} onChange={setEJoined} />
              <Field label="Parent name (optional)" value={eParentName} onChangeText={setEParentName} />
              <Field label="Parent contact (optional)" value={eParentContact} onChangeText={setEParentContact} keyboardType="phone-pad" />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title={saving ? 'Saving...' : 'Save'} onPress={saveEdit} disabled={saving} />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton title="Cancel" onPress={() => setEditingId(null)} />
                </View>
              </View>
            </Card>
          ) : (
            <Card key={s.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{s.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Joined: {s.joinedDate || '--'}
                    {s.parentName ? ` - Parent: ${s.parentName}` : ''}
                    {s.parentContact ? ` (${s.parentContact})` : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(s)} />
                  <IconButton name="trash-outline" color={colors.red} label="Delete" onPress={() => remove(s)} />
                </View>
              </View>
            </Card>
          )
        )}

        {students.length > 0 && (
          <SecondaryButton
            title={`Export ${filter.trim() ? 'shown' : 'all'} students to Excel`}
            onPress={() => exportTable('studentMaster', shown.map((s) => s.id))}
            style={{ marginBottom: spacing.lg }}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------

export default function UpdateScreen() {
  const [section, setSection] = useState('students');

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>Update</Text>

      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        {SECTIONS.map((s, idx) => {
          const on = s.key === section;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => setSection(s.key)}
              style={{
                flex: 1,
                height: 58,
                marginRight: idx < SECTIONS.length - 1 ? spacing.sm : 0,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primary : colors.chipBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={s.icon} size={22} color={on ? '#fff' : colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 2, color: on ? '#fff' : colors.text }}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {section === 'students' && <StudentsSection />}
      {section === 'books' && <ComingNext title="Books" />}
      {section === 'stock' && <ComingNext title="Stock" />}
    </Screen>
  );
}
