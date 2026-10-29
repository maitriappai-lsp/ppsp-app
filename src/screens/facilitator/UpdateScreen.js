// SCREEN (Facilitator): Update -- one place for the three lists a facilitator
// keeps for their OWN assigned beneficiary:
//
//   Students -- the student list
//   Books    -- the book stock at the beneficiary
//   Stock    -- the teaching-material stock at the beneficiary
//
// Each list can be added to one at a time (+) or in bulk with "Import from
// Excel" (rows already on the list are updated, new ones added), and edited,
// deleted and exported.
//
// The beneficiary is whichever one the facilitator is currently allocated to
// (Masters > Allocations, set by the Admin). The backend also refuses writes
// and imports for any other beneficiary, so this isn't only a screen rule.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { exportTable } from '../../utils/exportTable';
import { Screen, Card, Field, DateField, Select, PrimaryButton, SecondaryButton, SectionLabel } from '../../components/UI';
import { IconButton, ListHeader, AddModal, ImportFromExcel } from '../../components/MasterParts';
import MaterialPicker from '../../components/MaterialPicker';
import { colors, spacing } from '../../theme';

const SECTIONS = [
  { key: 'students', label: 'Students', icon: 'people-outline' },
  { key: 'books', label: 'Books', icon: 'book-outline' },
  { key: 'stock', label: 'Stock', icon: 'cube-outline' },
];

function benLabel(b) {
  return b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--';
}

const materialText = (m) => (m ? `${m.name}${m.type ? ' (' + m.type + ')' : ''}` : '--');
const bookText = (b) => (b ? `${b.title}${b.language ? ' (' + b.language + ')' : ''}` : '--');

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

function failed(title, e) {
  Alert.alert(title, e?.message || 'Please try again.');
}

function SaveCancel({ saving, onSave, onCancel }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <PrimaryButton title={saving ? 'Saving...' : 'Save'} onPress={onSave} disabled={saving} />
      </View>
      <View style={{ flex: 1 }}>
        <SecondaryButton title="Cancel" onPress={onCancel} />
      </View>
    </View>
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
            {students.length === 0 ? 'No students on your list yet. Tap + to add one, or import a sheet below.' : 'No students match your filter.'}
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
              <SaveCancel saving={saving} onSave={saveEdit} onCancel={() => setEditingId(null)} />
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
            style={{ marginBottom: spacing.md }}
          />
        )}

        <ImportFromExcel
          label="students"
          table="studentMaster"
          columnsHint="Student Name, Joined Date (optional), Parent Name (optional), Parent Contact (optional), Student ID (optional). Students are added to your own beneficiary"
        />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Books and Stock -- the same list for two kinds of item: how many of each
// book / teaching material the beneficiary has, its status, and remarks. One
// row per item per beneficiary.
// ---------------------------------------------------------------------------

const KINDS = {
  books: {
    title: 'Books',
    dbKey: 'bookUpdate',
    itemField: 'bookId',
    idPrefix: 'BKU',
    importLabel: 'book stock',
    importHint:
      'Book ID (or Title, and Language if two books share a title), Qty, Status (optional), Remarks (optional). Books are added to your own beneficiary; ones already listed are updated',
    emptyText: 'No books listed yet. Tap + to add one, or import a sheet below.',
    itemLabel: 'Book',
  },
  stock: {
    title: 'Stock',
    dbKey: 'stockUpdate',
    itemField: 'materialId',
    idPrefix: 'STK',
    importLabel: 'material stock',
    importHint:
      'Material ID (or Material Category, Material Name and Material Type), Qty, Status (optional), Remarks (optional). Stock is added to your own beneficiary; materials already listed are updated',
    emptyText: 'No stock listed yet. Tap + to add a material, or import a sheet below.',
    itemLabel: 'Material',
  },
};

function StockSection({ kind }) {
  const cfg = KINDS[kind];
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const { me, beneficiary } = useMyBeneficiary();

  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [status, setStatus] = useState('');
  const [remarks, setRemarks] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eQty, setEQty] = useState('');
  const [eStatus, setEStatus] = useState('');
  const [eRemarks, setERemarks] = useState('');

  const isStock = kind === 'stock';
  const nameOf = (id) => (isStock ? materialText(db.materialMaster.find((m) => m.id === id)) : bookText(db.bookMaster.find((b) => b.id === id)));
  const subOf = (id) => {
    if (isStock) return db.materialMaster.find((m) => m.id === id)?.category || '';
    const b = db.bookMaster.find((x) => x.id === id);
    return [b?.classification, b?.author].filter(Boolean).join(' - ');
  };

  const rows = useMemo(
    () =>
      db[cfg.dbKey]
        .filter((r) => beneficiary && r.beneficiaryId === beneficiary.id)
        .sort((a, b) => nameOf(a[cfg.itemField]).localeCompare(nameOf(b[cfg.itemField]))),
    [db[cfg.dbKey], db.materialMaster, db.bookMaster, beneficiary] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => !q || [nameOf(r[cfg.itemField]), subOf(r[cfg.itemField]), r.status, r.remarks].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [rows, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const bookOptions = useMemo(
    () => db.bookMaster.slice().sort((a, b) => (a.title || '').localeCompare(b.title || '')).map((b) => ({ value: b.id, label: bookText(b) })),
    [db.bookMaster]
  );

  if (!beneficiary) return <NotAssigned />;

  const stamp = () => ({ lastUpdatedBy: me, lastUpdatedAt: new Date().toISOString() });
  const qtyOk = (v) => /^\d+$/.test(String(v).trim());

  async function add() {
    if (!itemId) return Alert.alert('Missing fields', `Choose the ${cfg.itemLabel.toLowerCase()}.`);
    if (!qtyOk(qty)) return Alert.alert('Check the quantity', 'Enter a whole number, 0 or more.');
    if (rows.some((r) => r[cfg.itemField] === itemId)) {
      return Alert.alert('Already on your list', `${nameOf(itemId)} is already listed. Edit that row to change its quantity.`);
    }
    setSaving(true);
    try {
      await addRecord(cfg.dbKey, {
        id: nextId(cfg.idPrefix, cfg.dbKey),
        beneficiaryId: beneficiary.id,
        [cfg.itemField]: itemId,
        qty: Number(qty),
        status: status.trim(),
        remarks: remarks.trim(),
        ...stamp(),
      });
      setItemId('');
      setQty('');
      setStatus('');
      setRemarks('');
      setShowAdd(false);
    } catch (e) {
      failed('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEQty(String(r.qty ?? ''));
    setEStatus(r.status || '');
    setERemarks(r.remarks || '');
  }

  async function saveEdit() {
    if (!qtyOk(eQty)) return Alert.alert('Check the quantity', 'Enter a whole number, 0 or more.');
    setSaving(true);
    try {
      await updateRecord(cfg.dbKey, editingId, { qty: Number(eQty), status: eStatus.trim(), remarks: eRemarks.trim(), ...stamp() });
      setEditingId(null);
    } catch (e) {
      failed('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  function remove(r) {
    Alert.alert(`Remove from ${cfg.title.toLowerCase()}`, `Remove ${nameOf(r[cfg.itemField])} from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteRecord(cfg.dbKey, r.id).catch((e) => failed('Could not remove', e)) },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ fontWeight: '700', color: colors.text }}>{benLabel(beneficiary)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Your assigned beneficiary</Text>
        </Card>

        <ListHeader title={cfg.title} count={rows.length} onAdd={() => setShowAdd(true)} addLabel={`Add ${cfg.itemLabel.toLowerCase()}`} />
        <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by name, status or remarks..." />

        <AddModal visible={showAdd} title={`Add ${cfg.itemLabel.toLowerCase()}`} onClose={() => setShowAdd(false)}>
          <SectionLabel>{cfg.itemLabel}</SectionLabel>
          {isStock ? (
            <MaterialPicker materials={db.materialMaster} value={itemId} onSelect={setItemId} placeholder="Choose material..." />
          ) : (
            <Select value={itemId} onSelect={setItemId} options={bookOptions} placeholder="Choose book..." />
          )}
          <Field label="Quantity" value={qty} onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
          <Field label="Status (optional)" value={status} onChangeText={setStatus} placeholder="e.g. Good, Damaged, Missing" />
          <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />
          <PrimaryButton title={saving ? 'Saving...' : `Add ${cfg.itemLabel.toLowerCase()}`} onPress={add} disabled={saving} />
        </AddModal>

        {shown.length === 0 && (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            {rows.length === 0 ? cfg.emptyText : 'Nothing matches your filter.'}
          </Text>
        )}

        {shown.map((r) =>
          editingId === r.id ? (
            <Card key={r.id}>
              <SectionLabel>Edit {nameOf(r[cfg.itemField])}</SectionLabel>
              <Field label="Quantity" value={eQty} onChangeText={(v) => setEQty(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
              <Field label="Status (optional)" value={eStatus} onChangeText={setEStatus} placeholder="e.g. Good, Damaged, Missing" />
              <Field label="Remarks (optional)" value={eRemarks} onChangeText={setERemarks} multiline />
              <SaveCancel saving={saving} onSave={saveEdit} onCancel={() => setEditingId(null)} />
            </Card>
          ) : (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{nameOf(r[cfg.itemField])}</Text>
                  {subOf(r[cfg.itemField]) ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{subOf(r[cfg.itemField])}</Text> : null}
                  <Text style={{ color: colors.text, fontSize: 12 }}>
                    Qty: {r.qty}
                    {r.status ? ` - ${r.status}` : ''}
                  </Text>
                  {r.remarks ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r.remarks}</Text> : null}
                  {r.lastUpdatedAt ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>Updated {String(r.lastUpdatedAt).slice(0, 10)}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(r)} />
                  <IconButton name="trash-outline" color={colors.red} label="Remove" onPress={() => remove(r)} />
                </View>
              </View>
            </Card>
          )
        )}

        {rows.length > 0 && (
          <SecondaryButton
            title={`Export ${filter.trim() ? 'shown' : 'all'} ${cfg.title.toLowerCase()} to Excel`}
            onPress={() => exportTable(cfg.dbKey, shown.map((r) => r.id))}
            style={{ marginBottom: spacing.md }}
          />
        )}

        <ImportFromExcel label={cfg.importLabel} table={cfg.dbKey} columnsHint={cfg.importHint} />
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
      {section === 'books' && <StockSection kind="books" />}
      {section === 'stock' && <StockSection kind="stock" />}
    </Screen>
  );
}
