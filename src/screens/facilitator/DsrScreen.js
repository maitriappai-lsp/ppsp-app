// SCREEN (Facilitator): DSR -- the Daily Status Report.
//
// One DSR per facilitator per day. It can be SAVED as many times as needed
// (a draft), but SUBMITTED only once; after that it is read-only here (an
// Admin can still correct it from the dashboard).
//
// The report has a header and lines:
//   * Date -- always today, shown but not editable.
//   * Beneficiary -- defaults to the one the facilitator checked in at today
//     (else the one they are allocated to) and can be changed, e.g. when
//     covering another beneficiary. The student list follows the choice.
//   * Time in, child counts, RAG ratings, circle time, remarks, and the EPL
//     materials used (picked from the material master, category EPL).
//   * Lines: for each material used -- Morning or Afternoon FIRST, then the
//     material (grouped by category), its activity, and at least one student.
//
// Everything is saved through the backend's POST /api/dsr/save in one go
// (header + lines together), which enforces the rules again on the server.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Modal, SectionList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { todayLocalYMD, nowHHMM } from '../../utils/date';
import { Screen, Card, Field, Select, TimeField, Chip, RagChip, PrimaryButton, SecondaryButton, SectionLabel } from '../../components/UI';
import { AddModal, IconButton } from '../../components/MasterParts';
import { colors, spacing, ragColor } from '../../theme';

const RAGS = ['Green', 'Amber', 'Red'];
const CIRCLE_TIME = [
  'Story book',
  'Good habits',
  'Zero activity & other presentation',
  'Correction details',
  'Material name game',
  'Others',
];

function materialText(m) {
  return m ? `${m.name}${m.type ? ' (' + m.type + ')' : ''}` : '--';
}

function benLabel(b) {
  return b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--';
}

const isEpl = (m) => String(m.category || '').trim().toLowerCase() === 'epl';

function RagPicker({ label, value, onChange }) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <SectionLabel>{label}</SectionLabel>
      <View style={{ flexDirection: 'row' }}>
        {RAGS.map((r) => (
          <Chip key={r} label={r} color={ragColor(r)} active={value === r} onPress={() => onChange(value === r ? '' : r)} />
        ))}
      </View>
    </View>
  );
}

// A material dropdown whose list is grouped under its category headings
// (Sensorial, Language Tamil, ...), with a search box.
function MaterialPicker({ materials, value, onSelect, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = materials.find((m) => m.id === value);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = {};
    materials.forEach((m) => {
      if (needle && !`${m.category} ${m.name} ${m.type || ''}`.toLowerCase().includes(needle)) return;
      const cat = m.category || '(no category)';
      (map[cat] = map[cat] || []).push(m);
    });
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((cat) => ({
        title: cat,
        data: map[cat].sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.type || '').localeCompare(b.type || '')),
      }));
  }, [materials, q]);

  function close() {
    setOpen(false);
    setQ('');
  }

  return (
    <>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: 10,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.sm,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ flex: 1, color: selected ? colors.text : colors.textMuted }} numberOfLines={2}>
          {selected ? `${selected.category} / ${materialText(selected)}` : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Choose material</Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <Field placeholder="Search materials..." value={q} onChangeText={setQ} />
            <SectionList
              sections={sections}
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled
              ListEmptyComponent={<Text style={{ color: colors.textMuted, paddingVertical: spacing.md }}>No materials match.</Text>}
              renderSectionHeader={({ section }) => (
                <View style={{ backgroundColor: colors.chipBg, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: 6, marginTop: spacing.xs }}>
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 12 }}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item.id);
                    close();
                  }}
                  style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Text style={{ color: item.id === value ? colors.primary : colors.text, fontWeight: item.id === value ? '800' : '500' }}>
                    {materialText(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// Read-only view of a DSR (today's once submitted, and the history list).
function DsrSummary({ dsr, db }) {
  const lines = db.dsrDetail.filter((l) => l.dsrId === dsr.id);
  const muted = { color: colors.textMuted, fontSize: 12 };
  const row = (label, value) => (
    <Text style={{ color: colors.text, fontSize: 12, marginBottom: 2 }}>
      <Text style={{ color: colors.textMuted }}>{label}: </Text>
      {value === null || value === undefined || value === '' ? '--' : value}
    </Text>
  );
  const eplNames = (dsr.eplMaterialsUsed || []).map((id) => materialText(db.materialMaster.find((m) => m.id === id))).join(', ');
  return (
    <View>
      {row('Beneficiary', benLabel(db.beneficiaries.find((b) => b.id === dsr.beneficiaryId)))}
      {row('Facilitator time in', dsr.timeIn)}
      {row('Children at 9.30 am', dsr.childrenMorning)}
      {row('Active children 12.30 to 2 pm', dsr.childrenAfternoon)}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginVertical: 4 }}>
        <Text style={muted}>Stock </Text>
        {dsr.stockRag ? <RagChip rag={dsr.stockRag} /> : <Text style={muted}>--</Text>}
        <Text style={muted}>   Books </Text>
        {dsr.bookRag ? <RagChip rag={dsr.bookRag} /> : <Text style={muted}>--</Text>}
        <Text style={muted}>   Overall </Text>
        {dsr.overallRag ? <RagChip rag={dsr.overallRag} /> : <Text style={muted}>--</Text>}
      </View>
      {dsr.stockRemarks ? row('Stock remarks', dsr.stockRemarks) : null}
      {row('Circle time', (dsr.circleTimeActivities || []).join(', '))}
      {row('EPL materials used', eplNames)}
      {dsr.remarks ? row('Remarks', dsr.remarks) : null}

      <Text style={{ fontWeight: '700', color: colors.text, marginTop: spacing.sm }}>Materials used ({lines.length})</Text>
      {lines.length === 0 ? <Text style={muted}>None recorded.</Text> : null}
      {lines.map((l) => {
        const names = db.dsrDetailStudents
          .filter((x) => x.dsrDetailId === l.id)
          .map((x) => db.studentMaster.find((s) => s.id === x.studentId)?.name)
          .filter(Boolean);
        const m = db.materialMaster.find((x) => x.id === l.materialId);
        return (
          <View key={l.id} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
              {l.sessionPeriod === 'M' ? 'Morning' : 'Afternoon'} - {materialText(m)}
              {l.materialActivity ? ` - ${l.materialActivity}` : ''}
            </Text>
            <Text style={muted}>Students: {names.length ? names.join(', ') : '--'}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function DsrScreen() {
  const { currentUser } = useAuth();
  const { db, refresh } = useData();
  const me = currentUser?.id;
  const today = todayLocalYMD();

  const allocation = db.allocations.find((a) => a.active !== false && (a.resource1Id === me || a.resource2Id === me));
  const todaysDsr = db.dsr.find((d) => d.resourceId === me && d.dsrDate === today);
  const submitted = todaysDsr?.status === 'Submitted';

  // Where the facilitator checked in today (latest check-in), else their allocation.
  const checkedInBeneficiary = useMemo(() => {
    const recs = db.attendance.filter((a) => a.facilitatorId === me && a.date === today && a.beneficiaryId);
    recs.sort((a, b) => String(b.timeIn || '').localeCompare(String(a.timeIn || '')));
    return recs[0]?.beneficiaryId || '';
  }, [db.attendance, me, today]);
  const defaultBeneficiaryId = checkedInBeneficiary || allocation?.beneficiaryId || '';

  const timeInToday = useMemo(
    () => db.attendance.filter((a) => a.facilitatorId === me && a.date === today && a.timeIn).map((a) => a.timeIn).sort()[0] || '',
    [db.attendance, me, today]
  );

  const beneficiaryOptions = useMemo(
    () =>
      db.beneficiaries
        .slice()
        .sort((a, b) => benLabel(a).localeCompare(benLabel(b)))
        .map((b) => ({ value: b.id, label: benLabel(b) })),
    [db.beneficiaries]
  );
  const eplMaterials = useMemo(
    () => db.materialMaster.filter(isEpl).sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.type || '').localeCompare(b.type || '')),
    [db.materialMaster]
  );

  // ---- the form --------------------------------------------------------
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [childrenMorning, setChildrenMorning] = useState('');
  const [childrenAfternoon, setChildrenAfternoon] = useState('');
  const [stockRag, setStockRag] = useState('');
  const [stockRemarks, setStockRemarks] = useState('');
  const [bookRag, setBookRag] = useState('');
  const [overallRag, setOverallRag] = useState('');
  const [circleTime, setCircleTime] = useState([]);
  const [epl, setEpl] = useState([]); // ids of EPL materials
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState([]); // { key, materialId, materialActivity, sessionPeriod, studentIds }
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [expandedPrev, setExpandedPrev] = useState(null);

  const students = useMemo(
    () => db.studentMaster.filter((s) => s.beneficiaryId === beneficiaryId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [db.studentMaster, beneficiaryId]
  );
  const beneficiary = db.beneficiaries.find((b) => b.id === beneficiaryId);

  // Fill the form from today's saved DSR when it first becomes known (and
  // again if its status changes) -- but never overwrite what is being typed
  // just because the background refresh ran.
  const hydratedKey = useRef(null);
  useEffect(() => {
    const key = todaysDsr ? `${todaysDsr.id}:${todaysDsr.status}` : 'new';
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;
    if (!todaysDsr) return;
    setBeneficiaryId(todaysDsr.beneficiaryId || '');
    setTimeIn(todaysDsr.timeIn || '');
    setChildrenMorning(todaysDsr.childrenMorning === null || todaysDsr.childrenMorning === undefined ? '' : String(todaysDsr.childrenMorning));
    setChildrenAfternoon(todaysDsr.childrenAfternoon === null || todaysDsr.childrenAfternoon === undefined ? '' : String(todaysDsr.childrenAfternoon));
    setStockRag(todaysDsr.stockRag || '');
    setStockRemarks(todaysDsr.stockRemarks || '');
    setBookRag(todaysDsr.bookRag || '');
    setOverallRag(todaysDsr.overallRag || '');
    setCircleTime(todaysDsr.circleTimeActivities || []);
    setEpl(todaysDsr.eplMaterialsUsed || []);
    setRemarks(todaysDsr.remarks || '');
    setLines(
      db.dsrDetail
        .filter((l) => l.dsrId === todaysDsr.id)
        .map((l) => ({
          key: l.id,
          materialId: l.materialId,
          materialActivity: l.materialActivity || '',
          sessionPeriod: l.sessionPeriod,
          studentIds: db.dsrDetailStudents.filter((x) => x.dsrDetailId === l.id).map((x) => x.studentId),
        }))
    );
  }, [todaysDsr?.id, todaysDsr?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // A brand-new report starts with the beneficiary the facilitator checked in
  // at and the time-in from today's attendance.
  useEffect(() => {
    if (todaysDsr) return;
    if (!beneficiaryId && defaultBeneficiaryId) setBeneficiaryId(defaultBeneficiaryId);
    if (!timeIn && timeInToday) setTimeIn(timeInToday);
  }, [todaysDsr, beneficiaryId, defaultBeneficiaryId, timeIn, timeInToday]);

  function changeBeneficiary(id) {
    if (id === beneficiaryId) return;
    const hasStudents = lines.some((l) => l.studentIds.length > 0);
    const apply = () => {
      setBeneficiaryId(id);
      // each beneficiary has its own students, so the picks on existing lines no longer apply
      setLines((prev) => prev.map((l) => ({ ...l, studentIds: [] })));
    };
    if (!hasStudents) return apply();
    Alert.alert('Change beneficiary?', "The students you picked on your material lines belong to the current beneficiary, so they'll be cleared and you'll need to pick them again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change', onPress: apply },
    ]);
  }

  // ---- line editor -----------------------------------------------------
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
    if (!lPeriod) return Alert.alert('Morning or afternoon', 'Choose whether this was in the morning or the afternoon first.');
    if (!lMaterialId) return Alert.alert('Choose a material', 'Pick the material that was used.');
    if (lStudents.length === 0) return Alert.alert('Choose students', 'Select at least one student who worked on this material.');
    const line = { key: editingKey || `new-${Date.now()}`, materialId: lMaterialId, materialActivity: lActivity, sessionPeriod: lPeriod, studentIds: lStudents };
    setLines((prev) => (editingKey ? prev.map((l) => (l.key === editingKey ? line : l)) : [...prev, line]));
    setShowLine(false);
  }

  function toggleStudent(id) {
    setLStudents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // ---- save / submit ---------------------------------------------------
  function missingForSubmit() {
    const missing = [];
    if (!beneficiaryId) missing.push('Beneficiary');
    if (!timeIn) missing.push('Facilitator time in');
    if (childrenMorning === '') missing.push('Children at 9.30 am');
    if (childrenAfternoon === '') missing.push('Active children 12.30 to 2 pm');
    if (!stockRag) missing.push('Stock RAG rating');
    if (!bookRag) missing.push('Book RAG rating');
    if (!overallRag) missing.push('Overall day RAG rating');
    return missing;
  }

  async function send(submit) {
    if (!beneficiaryId) return Alert.alert('Choose the beneficiary', 'Pick the beneficiary this DSR is for.');
    setSaving(true);
    try {
      await apiPost('/api/dsr/save', {
        date: today,
        submit,
        header: {
          beneficiaryId,
          timeIn,
          childrenMorning,
          childrenAfternoon,
          stockRag,
          stockRemarks,
          bookRag,
          overallRag,
          circleTimeActivities: circleTime,
          eplMaterialsUsed: epl,
          remarks,
        },
        lines: lines.map((l) => ({
          materialId: l.materialId,
          materialActivity: l.materialActivity,
          sessionPeriod: l.sessionPeriod,
          studentIds: l.studentIds,
        })),
      });
      await refresh();
      if (submit) Alert.alert('Submitted', "Today's DSR has been submitted. It can't be changed now.");
      else setSavedAt(nowHHMM());
    } catch (e) {
      Alert.alert(submit ? 'Could not submit' : 'Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    const missing = missingForSubmit();
    if (missing.length) return Alert.alert('Almost there', `Please fill in: ${missing.join(', ')}.`);
    Alert.alert('Submit DSR?', "You can only submit once a day, and you won't be able to edit it afterwards.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', style: 'default', onPress: () => send(true) },
    ]);
  }

  const previous = useMemo(
    () =>
      db.dsr
        .filter((d) => d.resourceId === me && d.id !== todaysDsr?.id)
        .sort((a, b) => (b.dsrDate || '').localeCompare(a.dsrDate || ''))
        .slice(0, 30),
    [db.dsr, me, todaysDsr?.id]
  );

  // ---- render ----------------------------------------------------------
  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.xs }}>DSR</Text>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {submitted ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              <Text style={{ color: colors.green, fontWeight: '700', marginLeft: spacing.xs, flex: 1 }}>
                Submitted for {today}. Today's DSR can't be edited. Ask your admin if something needs correcting.
              </Text>
            </View>
            <DsrSummary dsr={todaysDsr} db={db} />
          </Card>
        ) : (
          <>
            <Card>
              <SectionLabel>Date</SectionLabel>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.chipBg,
                  borderRadius: 10,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  marginBottom: spacing.sm,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{today}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  Today only
                  {savedAt ? ` - draft saved ${savedAt}` : todaysDsr ? ' - draft saved' : ''}
                </Text>
              </View>

              <SectionLabel>Beneficiary</SectionLabel>
              <Select value={beneficiaryId} onSelect={changeBeneficiary} options={beneficiaryOptions} placeholder="Choose beneficiary..." />
              {checkedInBeneficiary && beneficiaryId === checkedInBeneficiary ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm }}>Where you checked in today. You can change it.</Text>
              ) : null}
            </Card>

            <Card>
              <SectionLabel>Today's report</SectionLabel>
              <TimeField label="Facilitator time in" value={timeIn} onChange={setTimeIn} />
              <Field
                label="Number of children at 9.30 am"
                value={childrenMorning}
                onChangeText={(v) => setChildrenMorning(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
              />
              <Field
                label="No. of active children 12.30 to 2 pm"
                value={childrenAfternoon}
                onChangeText={(v) => setChildrenAfternoon(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
              />
              <RagPicker label="Stock RAG rating" value={stockRag} onChange={setStockRag} />
              <Field label="Stock remarks (optional)" value={stockRemarks} onChangeText={setStockRemarks} multiline />
              <RagPicker label="Book RAG rating" value={bookRag} onChange={setBookRag} />
              <RagPicker label="Overall day RAG rating" value={overallRag} onChange={setOverallRag} />

              <SectionLabel>Circle time activities</SectionLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
                {CIRCLE_TIME.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    active={circleTime.includes(a)}
                    onPress={() => setCircleTime((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))}
                  />
                ))}
              </View>

              <SectionLabel>EPL materials used</SectionLabel>
              {eplMaterials.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
                  There are no EPL materials yet. Ask your admin to add materials with the category EPL.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
                  {eplMaterials.map((m) => (
                    <Chip
                      key={m.id}
                      label={materialText(m)}
                      active={epl.includes(m.id)}
                      onPress={() => setEpl((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))}
                    />
                  ))}
                </View>
              )}

              <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline />
            </Card>

            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>Materials used ({lines.length})</Text>
                <SecondaryButton title="+ Add material" onPress={() => openLine(null)} />
              </View>
              {lines.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No materials added yet.</Text>}
              {lines.map((l) => {
                const m = db.materialMaster.find((x) => x.id === l.materialId);
                const names = l.studentIds.map((id) => students.find((s) => s.id === id)?.name).filter(Boolean);
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
                      <Text style={{ color: names.length ? colors.textMuted : colors.red, fontSize: 12 }}>
                        Students: {names.length ? names.join(', ') : 'none selected -- edit this line'}
                      </Text>
                    </View>
                    <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => openLine(l)} />
                    <IconButton name="trash-outline" color={colors.red} label="Remove" onPress={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} />
                  </View>
                );
              })}
            </Card>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton title={saving ? 'Saving...' : 'Save draft'} onPress={() => send(false)} disabled={saving} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton title="Submit DSR" onPress={submit} disabled={saving} />
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
              Save as often as you like. Submit once, at the end of the day. After that it can't be edited.
            </Text>
          </>
        )}

        {previous.length > 0 && (
          <>
            <Text style={{ fontWeight: '700', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm }}>Previous DSRs</Text>
            {previous.map((d) => {
              const open = expandedPrev === d.id;
              return (
                <Card key={d.id}>
                  <TouchableOpacity onPress={() => setExpandedPrev(open ? null : d.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{d.dsrDate}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {benLabel(db.beneficiaries.find((b) => b.id === d.beneficiaryId))} - {d.status === 'Submitted' ? 'Submitted' : 'Draft (never submitted)'}
                      </Text>
                    </View>
                    {d.overallRag ? <RagChip rag={d.overallRag} /> : null}
                  </TouchableOpacity>
                  {open && (
                    <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                      <DsrSummary dsr={d} db={db} />
                    </View>
                  )}
                </Card>
              );
            })}
          </>
        )}
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
          onSelect={(id) => {
            if (id !== lMaterialId) setLActivity(''); // the activity list belongs to the material
            setLMaterialId(id);
          }}
        />
        {lMaterial ? (
          (lMaterial.activities || []).length > 0 ? (
            <>
              <SectionLabel>Activity</SectionLabel>
              <Select
                value={lActivity}
                onSelect={setLActivity}
                options={[{ value: '', label: 'No specific activity' }, ...lMaterial.activities.map((a) => ({ value: a, label: a }))]}
              />
            </>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>This material has no activities to choose from.</Text>
          )
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>3. Students ({lStudents.length} selected) - at least one</SectionLabel>
          {students.length > 0 && (
            <TouchableOpacity onPress={() => setLStudents(lStudents.length === students.length ? [] : students.map((s) => s.id))}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{lStudents.length === students.length ? 'Clear all' : 'Select all'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {!beneficiary ? (
          <Text style={{ color: colors.red, fontSize: 12, marginBottom: spacing.sm }}>Choose the beneficiary on the DSR first. The student list comes from it.</Text>
        ) : students.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
            There are no students on {benLabel(beneficiary)}'s list yet. Add them under Update, Students first.
          </Text>
        ) : null}
        {students.map((s) => {
          const checked = lStudents.includes(s.id);
          return (
            <TouchableOpacity key={s.id} onPress={() => toggleStudent(s.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
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
                  marginRight: spacing.sm,
                }}
              >
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
