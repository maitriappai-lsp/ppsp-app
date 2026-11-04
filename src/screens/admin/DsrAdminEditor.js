// SCREEN (Admin, from the dashboard's DSR tab): add or correct a DSR for anyone.
//
// Same report as the facilitator fills in -- header, then the materials used with
// their students -- but the admin chooses WHO it is for, can write it for any
// date up to today, and can correct one that is already submitted. Saved through
// POST /api/dsr/admin-save.
//
// "Save and Submit only for today": a DRAFT can only be saved for today's date;
// a DSR for an earlier date is saved as Submitted (the status picker offers
// only Submitted then).
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { todayLocalYMD } from '../../utils/date';
import { Screen, Card, Chip, Field, Select, DateField, TimeField, PrimaryButton, SecondaryButton, SectionLabel } from '../../components/UI';
import { AddModal, IconButton } from '../../components/MasterParts';
import MaterialPicker from '../../components/MaterialPicker';
import MultiSelect from '../../components/MultiSelect';
import { RagPicker, CIRCLE_TIME } from '../facilitator/DsrScreen';
import { colors, spacing } from '../../theme';

const materialText = (m) => (m ? `${m.name}${m.type ? ' (' + m.type + ')' : ''}` : '--');
const benLabel = (b) => (b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--');
const numText = (v) => (v === null || v === undefined ? '' : String(v));
const isEpl = (m) => String(m.category || '').trim().toLowerCase() === 'epl';

export default function DsrAdminEditor({ id, onClose, defaults = {} }) {
  const { db, refresh } = useData();
  const today = todayLocalYMD();
  const existing = id ? db.dsr.find((d) => d.id === id) : null;

  const [f, setF] = useState(() => {
    if (existing) {
      return {
        resourceId: existing.resourceId || '',
        beneficiaryId: existing.beneficiaryId || '',
        dsrDate: existing.dsrDate || today,
        status: existing.status || 'Submitted',
        timeIn: existing.timeIn || '',
        childrenMorning: numText(existing.childrenMorning),
        childrenAfternoon: numText(existing.childrenAfternoon),
        stockRag: existing.stockRag || '',
        stockRemarks: existing.stockRemarks || '',
        bookRag: existing.bookRag || '',
        overallRag: existing.overallRag || '',
        circleTime: existing.circleTimeActivities || [],
        epl: existing.eplMaterialsUsed || [],
        remarks: existing.remarks || '',
        lines: db.dsrDetail
          .filter((l) => l.dsrId === existing.id)
          .map((l) => ({
            key: l.id,
            materialId: l.materialId,
            materialActivity: l.materialActivity || '',
            sessionPeriod: l.sessionPeriod,
            studentIds: db.dsrDetailStudents.filter((x) => x.dsrDetailId === l.id).map((x) => x.studentId),
          })),
      };
    }
    return {
      resourceId: defaults.resourceId || '',
      beneficiaryId: defaults.beneficiaryId || '',
      dsrDate: today,
      status: 'Submitted',
      timeIn: '',
      childrenMorning: '',
      childrenAfternoon: '',
      stockRag: '',
      stockRemarks: '',
      bookRag: '',
      overallRag: '',
      circleTime: [],
      epl: [],
      remarks: '',
      lines: [],
    };
  });
  const [saving, setSaving] = useState(false);
  const patch = (p) => setF((cur) => ({ ...cur, ...p }));

  const facilitatorOptions = useMemo(
    () =>
      db.resources
        .filter((r) => (r.role === 'Facilitator' || r.role === 'Audit Facilitator') && (r.active !== false || r.id === f.resourceId))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((r) => ({ value: r.id, label: r.name })),
    [db.resources, f.resourceId]
  );
  const beneficiaryOptions = useMemo(
    () => db.beneficiaries.slice().sort((a, b) => benLabel(a).localeCompare(benLabel(b))).map((b) => ({ value: b.id, label: benLabel(b) })),
    [db.beneficiaries]
  );
  const eplOptions = db.materialMaster.filter(isEpl).map((m) => ({ value: m.id, label: materialText(m) }));
  const students = useMemo(
    () => db.studentMaster.filter((s) => s.beneficiaryId === f.beneficiaryId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [db.studentMaster, f.beneficiaryId]
  );

  // A draft is only for today; any earlier date is a Submitted record.
  const isToday = f.dsrDate === today;
  const statusOptions = isToday ? ['Draft', 'Submitted'] : ['Submitted'];

  function changeDate(v) {
    patch({ dsrDate: v, status: v === today ? f.status : 'Submitted' });
  }

  function changeBeneficiary(bid) {
    if (bid === f.beneficiaryId) return;
    const apply = () => patch({ beneficiaryId: bid, lines: f.lines.map((l) => ({ ...l, studentIds: [] })) });
    if (!f.lines.some((l) => l.studentIds.length)) return apply();
    Alert.alert('Change beneficiary?', 'Each beneficiary has its own students, so the students picked on the material lines will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change', onPress: apply },
    ]);
  }

  // ---- the materials-used line editor -----------------------------------
  const [showLine, setShowLine] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [lPeriod, setLPeriod] = useState('');
  const [lMaterialId, setLMaterialId] = useState('');
  const [lActivity, setLActivity] = useState('');
  const [lStudents, setLStudents] = useState([]);
  const lMaterial = db.materialMaster.find((m) => m.id === lMaterialId);

  function openLine(line) {
    setEditingKey(line ? line.key : null);
    setLPeriod(line ? line.sessionPeriod : '');
    setLMaterialId(line ? line.materialId : '');
    setLActivity(line ? line.materialActivity : '');
    setLStudents(line ? line.studentIds : []);
    setShowLine(true);
  }

  function saveLine() {
    if (!lPeriod) return Alert.alert('Morning or afternoon', 'Choose morning or afternoon first.');
    if (!lMaterialId) return Alert.alert('Choose a material', 'Pick the material that was used.');
    if (lStudents.length === 0) return Alert.alert('Choose students', 'Select at least one student.');
    const line = { key: editingKey || `new-${Date.now()}`, materialId: lMaterialId, materialActivity: lActivity, sessionPeriod: lPeriod, studentIds: lStudents };
    setF((cur) => ({ ...cur, lines: editingKey ? cur.lines.map((l) => (l.key === editingKey ? line : l)) : [...cur.lines, line] }));
    setShowLine(false);
  }

  // ---- save ----------------------------------------------------------------
  function problem() {
    if (!f.resourceId) return 'Choose the facilitator.';
    if (!f.beneficiaryId) return 'Choose the beneficiary.';
    if (!f.dsrDate) return 'Choose the date.';
    if (f.dsrDate > today) return "A DSR can't be for a future date.";
    if (f.status === 'Submitted') {
      const missing = [];
      if (!f.timeIn) missing.push('time in');
      if (f.childrenMorning === '') missing.push('children at 9.30 am');
      if (f.childrenAfternoon === '') missing.push('active children 12.30 to 2 pm');
      if (!f.stockRag) missing.push('stock RAG');
      if (!f.bookRag) missing.push('book RAG');
      if (!f.overallRag) missing.push('overall RAG');
      if (missing.length) return `To save as submitted, fill in: ${missing.join(', ')}.`;
    }
    return null;
  }

  async function save() {
    const p = problem();
    if (p) return Alert.alert('Check the DSR', p);
    setSaving(true);
    try {
      await apiPost('/api/dsr/admin-save', {
        id: id || undefined,
        resourceId: f.resourceId,
        beneficiaryId: f.beneficiaryId,
        date: f.dsrDate,
        status: f.status,
        header: {
          timeIn: f.timeIn,
          childrenMorning: f.childrenMorning,
          childrenAfternoon: f.childrenAfternoon,
          stockRag: f.stockRag,
          stockRemarks: f.stockRemarks,
          bookRag: f.bookRag,
          overallRag: f.overallRag,
          circleTimeActivities: f.circleTime,
          eplMaterialsUsed: f.epl,
          remarks: f.remarks,
        },
        lines: f.lines.map((l) => ({ materialId: l.materialId, materialActivity: l.materialActivity, sessionPeriod: l.sessionPeriod, studentIds: l.studentIds })),
      });
      await refresh();
      Alert.alert('Saved', 'The DSR has been saved.');
      onClose();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <TouchableOpacity onPress={onClose} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '700' }}>Back to dashboard</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>{existing ? 'Edit DSR' : 'Add DSR'}</Text>

        <Card>
          <SectionLabel>Facilitator</SectionLabel>
          <Select value={f.resourceId} onSelect={(v) => patch({ resourceId: v })} options={facilitatorOptions} placeholder="Choose facilitator..." />
          <SectionLabel>Beneficiary</SectionLabel>
          <Select value={f.beneficiaryId} onSelect={changeBeneficiary} options={beneficiaryOptions} placeholder="Choose beneficiary..." />
          <DateField label="DSR date (today or earlier)" value={f.dsrDate} onChange={changeDate} />
          <SectionLabel>Status</SectionLabel>
          <Select value={f.status} onSelect={(v) => patch({ status: v })} options={statusOptions.map((s) => ({ value: s, label: s }))} />
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {isToday ? "Today's DSR can be saved as a draft or submitted." : 'A DSR for an earlier date is saved as submitted (a draft is for today only).'}
          </Text>
        </Card>

        <Card>
          <SectionLabel>The report</SectionLabel>
          <TimeField label="Facilitator time in" value={f.timeIn} onChange={(v) => patch({ timeIn: v })} />
          <Field label="Number of children at 9.30 am" value={f.childrenMorning} onChangeText={(v) => patch({ childrenMorning: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" />
          <Field label="No. of active children 12.30 to 2 pm" value={f.childrenAfternoon} onChangeText={(v) => patch({ childrenAfternoon: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" />
          <RagPicker label="Stock RAG rating" value={f.stockRag} onChange={(v) => patch({ stockRag: v })} />
          <Field label="Stock remarks (optional)" value={f.stockRemarks} onChangeText={(v) => patch({ stockRemarks: v })} multiline />
          <RagPicker label="Book RAG rating" value={f.bookRag} onChange={(v) => patch({ bookRag: v })} />
          <RagPicker label="Overall day RAG rating" value={f.overallRag} onChange={(v) => patch({ overallRag: v })} />
          <SectionLabel>Circle time activities</SectionLabel>
          <MultiSelect title="Circle time activities" options={CIRCLE_TIME.map((a) => ({ value: a, label: a }))} values={f.circleTime} onChange={(v) => patch({ circleTime: v })} placeholder="Choose activities..." />
          <SectionLabel>EPL materials used</SectionLabel>
          <MultiSelect title="EPL materials used" options={eplOptions} values={f.epl} onChange={(v) => patch({ epl: v })} placeholder="Choose EPL materials..." emptyText="There are no EPL materials yet (category EPL in Masters, Materials)." />
          <Field label="Remarks (optional)" value={f.remarks} onChangeText={(v) => patch({ remarks: v })} multiline />
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>Materials used ({f.lines.length})</Text>
            <SecondaryButton title="+ Add material" onPress={() => openLine(null)} />
          </View>
          {f.lines.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No materials added.</Text>}
          {f.lines.map((l) => {
            const m = db.materialMaster.find((x) => x.id === l.materialId);
            const names = l.studentIds.map((sid) => db.studentMaster.find((s) => s.id === sid)?.name).filter(Boolean);
            return (
              <View key={l.key} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flex: 1, paddingRight: spacing.xs }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {l.sessionPeriod === 'M' ? 'Morning' : 'Afternoon'} - {materialText(m)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {m?.category}
                    {l.materialActivity ? ` - ${l.materialActivity}` : ''}
                  </Text>
                  <Text style={{ color: names.length ? colors.textMuted : colors.red, fontSize: 12 }}>Students: {names.length ? names.join(', ') : 'none selected -- edit this line'}</Text>
                </View>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => openLine(l)} />
                <IconButton name="trash-outline" color={colors.red} label="Remove" onPress={() => setF((cur) => ({ ...cur, lines: cur.lines.filter((x) => x.key !== l.key) }))} />
              </View>
            );
          })}
        </Card>

        <PrimaryButton title={saving ? 'Saving...' : 'Save DSR'} onPress={save} disabled={saving} />
      </ScrollView>

      <AddModal visible={showLine} title={editingKey ? 'Edit material' : 'Add material'} onClose={() => setShowLine(false)}>
        <SectionLabel>1. Morning or afternoon</SectionLabel>
        <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
          <Chip label="Morning" active={lPeriod === 'M'} onPress={() => setLPeriod('M')} />
          <Chip label="Afternoon" active={lPeriod === 'A'} onPress={() => setLPeriod('A')} />
        </View>
        <SectionLabel>2. Material</SectionLabel>
        <MaterialPicker
          materials={db.materialMaster}
          value={lMaterialId}
          disabled={!lPeriod}
          placeholder={lPeriod ? 'Choose material...' : 'Choose morning or afternoon first'}
          onSelect={(mid) => {
            if (mid !== lMaterialId) setLActivity('');
            setLMaterialId(mid);
          }}
        />
        {lMaterial && (lMaterial.activities || []).length > 0 ? (
          <>
            <SectionLabel>Activity</SectionLabel>
            <Select value={lActivity} onSelect={setLActivity} options={[{ value: '', label: 'No specific activity' }, ...lMaterial.activities.map((a) => ({ value: a, label: a }))]} />
          </>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>3. Students ({lStudents.length} selected) - at least one</SectionLabel>
          {students.length > 0 && (
            <TouchableOpacity onPress={() => setLStudents(lStudents.length === students.length ? [] : students.map((s) => s.id))}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{lStudents.length === students.length ? 'Clear all' : 'Select all'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {!f.beneficiaryId ? (
          <Text style={{ color: colors.red, fontSize: 12, marginBottom: spacing.sm }}>Choose the beneficiary first; the students come from it.</Text>
        ) : students.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>There are no students on that beneficiary's list yet (Masters, Students).</Text>
        ) : null}
        {students.map((s) => {
          const checked = lStudents.includes(s.id);
          return (
            <TouchableOpacity key={s.id} onPress={() => setLStudents((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm }}>
                {checked && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{'\u2713'}</Text>}
              </View>
              <Text style={{ color: colors.text }}>{s.name}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: spacing.md }} />
        <PrimaryButton title={editingKey ? 'Update material' : 'Add material'} onPress={saveLine} />
      </AddModal>
    </Screen>
  );
}
