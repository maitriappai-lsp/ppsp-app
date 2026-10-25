// PPSP master tabs for the Admin Masters screen: Allocations, Students,
// Materials and Books. Each follows the same pattern as the existing tabs in
// MastersScreen.js: the existing records first, a round "+" at the top right
// to add, and edit / delete icons on each row. Materials, Students and Books
// also have "Import from Excel".
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useData } from '../../data/store';
import { useAuth } from '../../context/AuthContext';
import { todayLocalYMD } from '../../utils/date';
import { Card, Chip, Field, Select, PrimaryButton, SecondaryButton, SectionLabel, DateField, TimeField } from '../../components/UI';
import { IconButton, ListHeader, AddModal, ImportFromExcel } from '../../components/MasterParts';
import { colors, spacing } from '../../theme';

// ---- small shared helpers --------------------------------------------------

function benLabel(b) {
  if (!b) return '--';
  return `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}`;
}

function resName(db, id) {
  return db.resources.find((r) => r.id === id)?.name || (id ? `(unknown: ${id})` : '--');
}

function dateOnly(ts) {
  return ts ? String(ts).slice(0, 10) : '--';
}

function showError(title, e) {
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

function confirmDelete(title, message, onConfirm) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => onConfirm().catch((e) => showError('Could not delete', e)) },
  ]);
}

// =============================================================================
// MATERIALS
// =============================================================================

function parseActivities(text) {
  const seen = new Set();
  return String(text || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

function materialKey(category, name, type) {
  return [category, name, type].map((x) => String(x || '').trim().toLowerCase()).join('|');
}

// Tap-to-reuse list of the categories already in use, so "Sensorial" doesn't
// end up typed three slightly different ways.
function CategoryChips({ categories, value, onPick }) {
  if (categories.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
      {categories.map((c) => (
        <Chip key={c} label={c} active={c.toLowerCase() === String(value || '').trim().toLowerCase()} onPress={() => onPick(c)} />
      ))}
    </View>
  );
}

export function MaterialsTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [activities, setActivities] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eCategory, setECategory] = useState('');
  const [eName, setEName] = useState('');
  const [eType, setEType] = useState('');
  const [eActivities, setEActivities] = useState('');

  const categories = useMemo(
    () => [...new Set(db.materialMaster.map((m) => m.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [db.materialMaster]
  );

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return db.materialMaster
      .filter((m) => !q || [m.id, m.category, m.name, m.type, (m.activities || []).join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice()
      .sort(
        (a, b) =>
          (a.category || '').localeCompare(b.category || '') ||
          (a.name || '').localeCompare(b.name || '') ||
          (a.type || '').localeCompare(b.type || '')
      );
  }, [db.materialMaster, filter]);

  function isDuplicate(c, n, t, ignoreId) {
    const key = materialKey(c, n, t);
    return db.materialMaster.some((m) => m.id !== ignoreId && materialKey(m.category, m.name, m.type) === key);
  }

  async function add() {
    if (!category.trim() || !name.trim()) return Alert.alert('Missing fields', 'Category and name are required.');
    if (isDuplicate(category, name, type)) {
      return Alert.alert('Already exists', 'A material with this Category, Name and Type already exists.');
    }
    setSaving(true);
    try {
      await addRecord('materialMaster', {
        id: nextId('MAT', 'materialMaster'),
        category: category.trim(),
        name: name.trim(),
        type: type.trim(),
        activities: parseActivities(activities),
      });
      Alert.alert('Saved', 'Material added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setName('');
      setType('');
      setActivities('');
    } catch (e) {
      showError('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m) {
    setEditingId(m.id);
    setECategory(m.category || '');
    setEName(m.name || '');
    setEType(m.type || '');
    setEActivities((m.activities || []).join(', '));
  }

  async function saveEdit() {
    if (!eCategory.trim() || !eName.trim()) return Alert.alert('Missing fields', 'Category and name are required.');
    if (isDuplicate(eCategory, eName, eType, editingId)) {
      return Alert.alert('Already exists', 'A material with this Category, Name and Type already exists.');
    }
    setSaving(true);
    try {
      await updateRecord('materialMaster', editingId, {
        category: eCategory.trim(),
        name: eName.trim(),
        type: eType.trim(),
        activities: parseActivities(eActivities),
      });
      setEditingId(null);
    } catch (e) {
      showError('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <ListHeader title="Materials" count={db.materialMaster.length} onAdd={() => setShowAdd(true)} addLabel="Add material" />
      <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by category, name, type or activity..." />

      <AddModal visible={showAdd} title="Add material" onClose={() => setShowAdd(false)}>
        <Field label="Material category" value={category} onChangeText={setCategory} placeholder="e.g. Sensorial" />
        <CategoryChips categories={categories} value={category} onPick={setCategory} />
        <Field label="Material name" value={name} onChangeText={setName} placeholder="e.g. Pink Tower" />
        <Field label="Material type (optional)" value={type} onChangeText={setType} placeholder="e.g. Sand paper" />
        <Field
          label="Material activities (optional)"
          value={activities}
          onChangeText={setActivities}
          autoCapitalize="characters"
          placeholder="Comma separated, e.g. P, M1, M2"
        />
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
          Category + name + type must be unique. The activities are what a facilitator can pick for this material in a DSR.
        </Text>
        <PrimaryButton title={saving ? 'Saving...' : 'Add material'} onPress={add} disabled={saving} />
      </AddModal>

      {rows.length === 0 && (
        <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
          {db.materialMaster.length === 0 ? 'No materials yet. Tap + to add one, or import a sheet below.' : 'No materials match your filter.'}
        </Text>
      )}

      {rows.map((m) =>
        editingId === m.id ? (
          <Card key={m.id}>
            <SectionLabel>Edit material {m.id}</SectionLabel>
            <Field label="Material category" value={eCategory} onChangeText={setECategory} />
            <CategoryChips categories={categories} value={eCategory} onPick={setECategory} />
            <Field label="Material name" value={eName} onChangeText={setEName} />
            <Field label="Material type (optional)" value={eType} onChangeText={setEType} />
            <Field label="Material activities (optional)" value={eActivities} onChangeText={setEActivities} autoCapitalize="characters" placeholder="Comma separated, e.g. P, M1, M2" />
            <SaveCancel saving={saving} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          </Card>
        ) : (
          <Card key={m.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>
                  {m.name}
                  {m.type ? ` (${m.type})` : ''}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {m.id} - {m.category}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Activities: {(m.activities || []).length ? m.activities.join(', ') : 'none'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(m)} />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() => confirmDelete('Delete material', `Remove ${m.name}${m.type ? ' (' + m.type + ')' : ''}?`, () => deleteRecord('materialMaster', m.id))}
                />
              </View>
            </View>
          </Card>
        )
      )}

      <ImportFromExcel
        label="materials"
        table="materialMaster"
        columnsHint="Material Category, Material Name, Material Type (optional), Material Activities (optional, comma separated), Material ID (optional)"
      />
    </ScrollView>
  );
}

// =============================================================================
// STUDENTS
// =============================================================================

export function StudentsTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const { currentUser } = useAuth();
  const benOptions = db.beneficiaries.map((b) => ({ value: b.id, label: benLabel(b) }));

  const [filter, setFilter] = useState('');
  const [filterBen, setFilterBen] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [benId, setBenId] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentContact, setParentContact] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eBenId, setEBenId] = useState('');
  const [eName, setEName] = useState('');
  const [eJoined, setEJoined] = useState('');
  const [eParentName, setEParentName] = useState('');
  const [eParentContact, setEParentContact] = useState('');

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return db.studentMaster
      .filter((s) => !filterBen || s.beneficiaryId === filterBen)
      .filter(
        (s) =>
          !q ||
          [s.id, s.name, s.parentName, s.parentContact, benLabel(db.beneficiaries.find((b) => b.id === s.beneficiaryId))]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
      )
      .slice()
      .sort((a, b) => benLabel(db.beneficiaries.find((x) => x.id === a.beneficiaryId)).localeCompare(benLabel(db.beneficiaries.find((x) => x.id === b.beneficiaryId))) || (a.name || '').localeCompare(b.name || ''));
  }, [db.studentMaster, db.beneficiaries, filter, filterBen]);

  function stamp() {
    return { updatedBy: currentUser?.id || '', updatedAt: new Date().toISOString() };
  }

  async function add() {
    if (!benId) return Alert.alert('Missing fields', 'Choose the beneficiary.');
    if (!name.trim()) return Alert.alert('Missing fields', 'Student name is required.');
    setSaving(true);
    try {
      await addRecord('studentMaster', {
        id: nextId('STU', 'studentMaster'),
        beneficiaryId: benId,
        name: name.trim(),
        joinedDate: joined,
        parentName: parentName.trim(),
        parentContact: parentContact.trim(),
        ...stamp(),
      });
      Alert.alert('Saved', 'Student added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setName('');
      setJoined('');
      setParentName('');
      setParentContact('');
    } catch (e) {
      showError('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEBenId(s.beneficiaryId || '');
    setEName(s.name || '');
    setEJoined(s.joinedDate || '');
    setEParentName(s.parentName || '');
    setEParentContact(s.parentContact || '');
  }

  async function saveEdit() {
    if (!eBenId) return Alert.alert('Missing fields', 'Choose the beneficiary.');
    if (!eName.trim()) return Alert.alert('Missing fields', 'Student name is required.');
    setSaving(true);
    try {
      await updateRecord('studentMaster', editingId, {
        beneficiaryId: eBenId,
        name: eName.trim(),
        joinedDate: eJoined,
        parentName: eParentName.trim(),
        parentContact: eParentContact.trim(),
        ...stamp(),
      });
      setEditingId(null);
    } catch (e) {
      showError('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <ListHeader title="Students" count={db.studentMaster.length} onAdd={() => setShowAdd(true)} addLabel="Add student" />
      <Select value={filterBen} onSelect={setFilterBen} options={[{ value: '', label: 'All beneficiaries' }, ...benOptions]} />
      <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by name, ID or parent..." />

      <AddModal visible={showAdd} title="Add student" onClose={() => setShowAdd(false)}>
        <SectionLabel>Beneficiary</SectionLabel>
        <Select value={benId} onSelect={setBenId} options={benOptions} placeholder="Choose beneficiary..." />
        <Field label="Student name" value={name} onChangeText={setName} placeholder="Full name" />
        <DateField label="Joined date (optional)" value={joined} onChange={setJoined} />
        <Field label="Parent name (optional)" value={parentName} onChangeText={setParentName} />
        <Field label="Parent contact (optional)" value={parentContact} onChangeText={setParentContact} keyboardType="phone-pad" />
        <PrimaryButton title={saving ? 'Saving...' : 'Add student'} onPress={add} disabled={saving} />
      </AddModal>

      {rows.length === 0 && (
        <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
          {db.studentMaster.length === 0 ? 'No students yet. Tap + to add one, or import a sheet below.' : 'No students match your filter.'}
        </Text>
      )}

      {rows.map((s) => {
        const ben = db.beneficiaries.find((b) => b.id === s.beneficiaryId);
        return editingId === s.id ? (
          <Card key={s.id}>
            <SectionLabel>Edit student {s.id}</SectionLabel>
            <SectionLabel>Beneficiary</SectionLabel>
            <Select value={eBenId} onSelect={setEBenId} options={benOptions} />
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
                  {s.id} - {benLabel(ben)}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Joined: {s.joinedDate || '--'}
                  {s.parentName ? ` - Parent: ${s.parentName}` : ''}
                  {s.parentContact ? ` (${s.parentContact})` : ''}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  Updated {dateOnly(s.updatedAt)} by {s.updatedBy ? resName(db, s.updatedBy) : '--'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(s)} />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() => confirmDelete('Delete student', `Remove ${s.name}? They will also drop out of any DSR lines they were part of.`, () => deleteRecord('studentMaster', s.id))}
                />
              </View>
            </View>
          </Card>
        );
      })}

      <ImportFromExcel
        label="students"
        table="studentMaster"
        columnsHint="Beneficiary ID (or School, Class, Section), Student Name, Student ID (optional), Joined Date (optional), Parent Name (optional), Parent Contact (optional)"
      />
    </ScrollView>
  );
}

// =============================================================================
// BOOKS
// =============================================================================

export function BooksTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('');
  const [classification, setClassification] = useState('');
  const [author, setAuthor] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eTitle, setETitle] = useState('');
  const [eLanguage, setELanguage] = useState('');
  const [eClassification, setEClassification] = useState('');
  const [eAuthor, setEAuthor] = useState('');

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return db.bookMaster
      .filter((b) => !q || [b.id, b.title, b.language, b.classification, b.author].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [db.bookMaster, filter]);

  async function add() {
    if (!title.trim()) return Alert.alert('Missing fields', 'Title is required.');
    setSaving(true);
    try {
      await addRecord('bookMaster', {
        id: nextId('BK', 'bookMaster'),
        title: title.trim(),
        language: language.trim(),
        classification: classification.trim(),
        author: author.trim(),
      });
      Alert.alert('Saved', 'Book added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setTitle('');
      setLanguage('');
      setClassification('');
      setAuthor('');
    } catch (e) {
      showError('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(b) {
    setEditingId(b.id);
    setETitle(b.title || '');
    setELanguage(b.language || '');
    setEClassification(b.classification || '');
    setEAuthor(b.author || '');
  }

  async function saveEdit() {
    if (!eTitle.trim()) return Alert.alert('Missing fields', 'Title is required.');
    setSaving(true);
    try {
      await updateRecord('bookMaster', editingId, {
        title: eTitle.trim(),
        language: eLanguage.trim(),
        classification: eClassification.trim(),
        author: eAuthor.trim(),
      });
      setEditingId(null);
    } catch (e) {
      showError('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <ListHeader title="Books" count={db.bookMaster.length} onAdd={() => setShowAdd(true)} addLabel="Add book" />
      <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by title, language, author..." />

      <AddModal visible={showAdd} title="Add book" onClose={() => setShowAdd(false)}>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Book title" />
        <Field label="Language" value={language} onChangeText={setLanguage} placeholder="e.g. Tamil, English" />
        <Field label="Classification" value={classification} onChangeText={setClassification} placeholder="e.g. Comedy, Story, Cartoon" />
        <Field label="Author (optional)" value={author} onChangeText={setAuthor} />
        <PrimaryButton title={saving ? 'Saving...' : 'Add book'} onPress={add} disabled={saving} />
      </AddModal>

      {rows.length === 0 && (
        <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
          {db.bookMaster.length === 0 ? 'No books yet. Tap + to add one, or import a sheet below.' : 'No books match your filter.'}
        </Text>
      )}

      {rows.map((b) =>
        editingId === b.id ? (
          <Card key={b.id}>
            <SectionLabel>Edit book {b.id}</SectionLabel>
            <Field label="Title" value={eTitle} onChangeText={setETitle} />
            <Field label="Language" value={eLanguage} onChangeText={setELanguage} />
            <Field label="Classification" value={eClassification} onChangeText={setEClassification} />
            <Field label="Author (optional)" value={eAuthor} onChangeText={setEAuthor} />
            <SaveCancel saving={saving} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          </Card>
        ) : (
          <Card key={b.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{b.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {b.id} - {b.language || '--'} - {b.classification || '--'}
                </Text>
                {b.author ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Author: {b.author}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(b)} />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() => confirmDelete('Delete book', `Remove ${b.title}?`, () => deleteRecord('bookMaster', b.id))}
                />
              </View>
            </View>
          </Card>
        )
      )}

      <ImportFromExcel
        label="books"
        table="bookMaster"
        columnsHint="Title, Language, Classification, Author (optional), Book ID (optional)"
      />
    </ScrollView>
  );
}

// =============================================================================
// BENEFICIARY RESOURCE ALLOCATION
// One resource can be in only ONE active allocation (as resource 1 or 2).
// The database enforces that; the checks here just give a clear message
// before the save is attempted.
// =============================================================================

export function AllocationsTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const { currentUser } = useAuth();

  const benOptions = db.beneficiaries.map((b) => ({ value: b.id, label: benLabel(b) }));
  const resOptions = db.resources
    .filter((r) => r.active !== false)
    .map((r) => ({ value: r.id, label: `${r.name}${r.role ? ' (' + r.role + ')' : ''}` }));
  const resOptionsOptional = [{ value: '', label: 'None' }, ...resOptions];
  const activeOptions = [
    { value: 'yes', label: 'Active' },
    { value: 'no', label: 'Inactive' },
  ];

  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [benId, setBenId] = useState('');
  const [res1, setRes1] = useState('');
  const [res2, setRes2] = useState('');
  const [fromDate, setFromDate] = useState(todayLocalYMD());
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [active, setActive] = useState('yes');
  const [remarks, setRemarks] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eBenId, setEBenId] = useState('');
  const [eRes1, setERes1] = useState('');
  const [eRes2, setERes2] = useState('');
  const [eFromDate, setEFromDate] = useState('');
  const [eOpensAt, setEOpensAt] = useState('');
  const [eClosesAt, setEClosesAt] = useState('');
  const [eActive, setEActive] = useState('yes');
  const [eRemarks, setERemarks] = useState('');

  const rows = useMemo(
    () =>
      db.allocations.slice().sort((a, b) => {
        const act = Number(b.active !== false) - Number(a.active !== false);
        if (act) return act;
        const la = benLabel(db.beneficiaries.find((x) => x.id === a.beneficiaryId));
        const lb = benLabel(db.beneficiaries.find((x) => x.id === b.beneficiaryId));
        return la.localeCompare(lb);
      }),
    [db.allocations, db.beneficiaries]
  );

  // Is any chosen resource already in a different ACTIVE allocation?
  function findClash(r1, r2, isActive, ignoreId) {
    if (!isActive) return null;
    const wanted = [r1, r2].filter(Boolean);
    for (const a of db.allocations) {
      if (a.id === ignoreId || a.active === false) continue;
      const used = [a.resource1Id, a.resource2Id].filter(Boolean);
      const hit = wanted.find((w) => used.includes(w));
      if (hit) return { resourceId: hit, allocation: a };
    }
    return null;
  }

  function clashMessage(clash) {
    const where = benLabel(db.beneficiaries.find((b) => b.id === clash.allocation.beneficiaryId));
    return `${resName(db, clash.resourceId)} is already in an active allocation for ${where}. Make that allocation inactive first, or choose someone else.`;
  }

  function validate({ ben, r1, r2, from }, isActive, ignoreId) {
    if (!ben) return 'Choose the beneficiary.';
    if (!r1) return 'Choose resource 1.';
    if (r2 && r2 === r1) return 'Resource 1 and resource 2 must be different people.';
    if (!from) return 'Choose the from date.';
    const clash = findClash(r1, r2, isActive, ignoreId);
    if (clash) return clashMessage(clash);
    return null;
  }

  function stamp(remarkText) {
    return {
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.id || '',
      updateRemarks: remarkText || '',
    };
  }

  async function add() {
    const isActive = active === 'yes';
    const problem = validate({ ben: benId, r1: res1, r2: res2, from: fromDate }, isActive, null);
    if (problem) return Alert.alert('Cannot save', problem);
    setSaving(true);
    try {
      await addRecord('allocations', {
        id: nextId('ALLOC', 'allocations'),
        beneficiaryId: benId,
        resource1Id: res1,
        resource2Id: res2,
        fromDate,
        opensAt,
        closesAt,
        active: isActive,
        ...stamp(remarks),
      });
      Alert.alert('Saved', 'Allocation added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setBenId('');
      setRes1('');
      setRes2('');
      setOpensAt('');
      setClosesAt('');
      setRemarks('');
      setActive('yes');
    } catch (e) {
      showError('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(a) {
    setEditingId(a.id);
    setEBenId(a.beneficiaryId || '');
    setERes1(a.resource1Id || '');
    setERes2(a.resource2Id || '');
    setEFromDate(a.fromDate || '');
    setEOpensAt(a.opensAt || '');
    setEClosesAt(a.closesAt || '');
    setEActive(a.active === false ? 'no' : 'yes');
    setERemarks('');
  }

  async function saveEdit() {
    const isActive = eActive === 'yes';
    const problem = validate({ ben: eBenId, r1: eRes1, r2: eRes2, from: eFromDate }, isActive, editingId);
    if (problem) return Alert.alert('Cannot save', problem);
    setSaving(true);
    try {
      await updateRecord('allocations', editingId, {
        beneficiaryId: eBenId,
        resource1Id: eRes1,
        resource2Id: eRes2,
        fromDate: eFromDate,
        opensAt: eOpensAt,
        closesAt: eClosesAt,
        active: isActive,
        ...stamp(eRemarks),
      });
      setEditingId(null);
    } catch (e) {
      showError('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  function toggleActive(a) {
    const next = a.active === false; // currently inactive -> make active
    if (next) {
      const clash = findClash(a.resource1Id, a.resource2Id, true, a.id);
      if (clash) return Alert.alert('Cannot reactivate', clashMessage(clash));
    }
    Alert.alert(
      next ? 'Reactivate allocation' : 'Make allocation inactive',
      next
        ? 'These resources will be treated as assigned to this beneficiary again.'
        : 'The resources are no longer assigned to this beneficiary. The record stays for history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Reactivate' : 'Make inactive',
          style: next ? 'default' : 'destructive',
          onPress: () =>
            updateRecord('allocations', a.id, { active: next, ...stamp(next ? 'Reactivated' : 'Made inactive') }).catch((e) =>
              showError('Could not update', e)
            ),
        },
      ]
    );
  }

  const ruleNote = (
    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
      A resource can be in only one active allocation at a time. To move someone, make their old allocation inactive first.
    </Text>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <ListHeader title="Allocations" count={db.allocations.length} onAdd={() => setShowAdd(true)} addLabel="Add allocation" />

      <AddModal visible={showAdd} title="Add allocation" onClose={() => setShowAdd(false)}>
        {ruleNote}
        <SectionLabel>Beneficiary</SectionLabel>
        <Select value={benId} onSelect={setBenId} options={benOptions} placeholder="Choose beneficiary..." />
        <SectionLabel>Resource 1</SectionLabel>
        <Select value={res1} onSelect={setRes1} options={resOptions} placeholder="Choose resource..." />
        <SectionLabel>Resource 2 (optional)</SectionLabel>
        <Select value={res2} onSelect={setRes2} options={resOptionsOptional} placeholder="None" />
        <DateField label="From date" value={fromDate} onChange={setFromDate} />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TimeField label="Opens at" value={opensAt} onChange={setOpensAt} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField label="Closes at" value={closesAt} onChange={setClosesAt} />
          </View>
        </View>
        <SectionLabel>Status</SectionLabel>
        <Select value={active} onSelect={setActive} options={activeOptions} />
        <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} />
        <PrimaryButton title={saving ? 'Saving...' : 'Add allocation'} onPress={add} disabled={saving} />
      </AddModal>

      {rows.length === 0 && (
        <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>No allocations yet. Tap + to add one.</Text>
      )}

      {rows.map((a) => {
        const isActive = a.active !== false;
        const ben = db.beneficiaries.find((b) => b.id === a.beneficiaryId);
        return editingId === a.id ? (
          <Card key={a.id}>
            <SectionLabel>Edit allocation {a.id}</SectionLabel>
            {ruleNote}
            <SectionLabel>Beneficiary</SectionLabel>
            <Select value={eBenId} onSelect={setEBenId} options={benOptions} />
            <SectionLabel>Resource 1</SectionLabel>
            <Select value={eRes1} onSelect={setERes1} options={resOptions} />
            <SectionLabel>Resource 2 (optional)</SectionLabel>
            <Select value={eRes2} onSelect={setERes2} options={resOptionsOptional} placeholder="None" />
            <DateField label="From date" value={eFromDate} onChange={setEFromDate} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <TimeField label="Opens at" value={eOpensAt} onChange={setEOpensAt} />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Closes at" value={eClosesAt} onChange={setEClosesAt} />
              </View>
            </View>
            <SectionLabel>Status</SectionLabel>
            <Select value={eActive} onSelect={setEActive} options={activeOptions} />
            <Field label="Update remarks (optional)" value={eRemarks} onChangeText={setERemarks} />
            <SaveCancel saving={saving} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          </Card>
        ) : (
          <Card key={a.id} style={!isActive ? { opacity: 0.6 } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }}>{benLabel(ben)}</Text>
                  {!isActive && <Text style={{ color: colors.red, fontWeight: '700', fontSize: 11 }}>INACTIVE</Text>}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Resource 1: {resName(db, a.resource1Id)}</Text>
                {a.resource2Id ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Resource 2: {resName(db, a.resource2Id)}</Text>
                ) : null}
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  From {a.fromDate || '--'} - Opens {a.opensAt || '--'} - Closes {a.closesAt || '--'}
                </Text>
                {a.updateRemarks ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Remarks: {a.updateRemarks}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(a)} />
                <IconButton
                  name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                  color={isActive ? colors.amber : colors.green}
                  label={isActive ? 'Make inactive' : 'Reactivate'}
                  onPress={() => toggleActive(a)}
                />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() => confirmDelete('Delete allocation', `Remove this allocation for ${benLabel(ben)}?`, () => deleteRecord('allocations', a.id))}
                />
              </View>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

// =============================================================================
// AUDIT CATEGORIES (the audit visit checklist)
// The category number is the id: whole numbers ('3') are section headings and
// numbers like '3.05' are the questions under them. The number can't be
// changed once saved (audits point at it); the wording and Active flag can.
// An inactive question stays in past audits but is not offered in new ones.
// =============================================================================

const HEADING_RE = /^\d{1,3}$/;
const QUESTION_RE = /^\d{1,3}\.\d{2}$/;

function auditSortOrder(no) {
  const [a, b] = String(no).split('.');
  return Number(a) * 1000 + (b ? Number(b) : 0);
}

export function AuditCategoriesTab() {
  const { db, addRecord, updateRecord, deleteRecord } = useData();
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [eDescription, setEDescription] = useState('');

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return db.auditCategories
      .filter((c) => !q || `${c.id} ${c.description}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.sortOrder ?? auditSortOrder(a.id)) - (b.sortOrder ?? auditSortOrder(b.id)));
  }, [db.auditCategories, filter]);

  async function add() {
    const no = number.trim();
    if (!HEADING_RE.test(no) && !QUESTION_RE.test(no)) {
      return Alert.alert('Check the number', 'Use a whole number for a section heading (e.g. 6), or number.two digits for a question (e.g. 2.13).');
    }
    if (!description.trim()) return Alert.alert('Missing fields', 'Description is required.');
    if (db.auditCategories.some((c) => c.id === no)) return Alert.alert('Already exists', `Category ${no} already exists.`);
    setSaving(true);
    try {
      await addRecord('auditCategories', {
        id: no,
        description: description.trim(),
        isHeading: HEADING_RE.test(no),
        sortOrder: auditSortOrder(no),
        active: true,
      });
      Alert.alert('Saved', 'Audit category added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setNumber('');
      setDescription('');
    } catch (e) {
      showError('Could not add', e);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!eDescription.trim()) return Alert.alert('Missing fields', 'Description is required.');
    setSaving(true);
    try {
      await updateRecord('auditCategories', editingId, { description: eDescription.trim() });
      setEditingId(null);
    } catch (e) {
      showError('Could not save', e);
    } finally {
      setSaving(false);
    }
  }

  function toggleActive(c) {
    updateRecord('auditCategories', c.id, { active: c.active === false }).catch((e) => showError('Could not update', e));
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <ListHeader title="Audit categories" count={db.auditCategories.length} onAdd={() => setShowAdd(true)} addLabel="Add audit category" />
      <Field label="Filter" value={filter} onChangeText={setFilter} placeholder="Search by number or wording..." />

      <AddModal visible={showAdd} title="Add audit category" onClose={() => setShowAdd(false)}>
        <Field
          label="Category number"
          value={number}
          onChangeText={setNumber}
          keyboardType="numbers-and-punctuation"
          placeholder="e.g. 6 (heading) or 2.13 (question)"
        />
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
          A whole number is a section heading. A number with two decimals (2.13, 3.05) is a question under that section.
          It can't be changed after saving.
        </Text>
        <Field label="Description" value={description} onChangeText={setDescription} placeholder="The heading or the question" multiline />
        <PrimaryButton title={saving ? 'Saving...' : 'Add category'} onPress={add} disabled={saving} />
      </AddModal>

      {rows.length === 0 && (
        <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
          {db.auditCategories.length === 0 ? 'No audit categories yet. Tap + to add one.' : 'No categories match your filter.'}
        </Text>
      )}

      {rows.map((c) => {
        const heading = c.isHeading === true;
        const isActive = c.active !== false;
        return editingId === c.id ? (
          <Card key={c.id}>
            <SectionLabel>Edit category {c.id}</SectionLabel>
            <Field label="Description" value={eDescription} onChangeText={setEDescription} multiline />
            <SaveCancel saving={saving} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          </Card>
        ) : (
          <Card
            key={c.id}
            style={[heading ? { backgroundColor: colors.chipBg } : { marginLeft: spacing.lg }, !isActive ? { opacity: 0.6 } : null]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontWeight: heading ? '800' : '600', color: colors.text }}>
                  {c.id}  {c.description}
                </Text>
                {!isActive && <Text style={{ color: colors.red, fontWeight: '700', fontSize: 11 }}>INACTIVE</Text>}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton
                  name="create-outline"
                  color={colors.primary}
                  label="Edit"
                  onPress={() => {
                    setEditingId(c.id);
                    setEDescription(c.description || '');
                  }}
                />
                <IconButton
                  name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                  color={isActive ? colors.amber : colors.green}
                  label={isActive ? 'Make inactive' : 'Reactivate'}
                  onPress={() => toggleActive(c)}
                />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() => confirmDelete('Delete category', `Remove ${c.id}? If audits already use it, make it inactive instead.`, () => deleteRecord('auditCategories', c.id))}
                />
              </View>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
