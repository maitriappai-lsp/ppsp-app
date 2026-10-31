// SCREEN (Audit Facilitator): Audit visits.
//
// Only an Audit Facilitator sees this tab; they can also do everything a normal
// Facilitator can. An audit visit is a header (beneficiary, date, times, the
// facilitator(s) there, remarks, a visit number) plus the checklist: for each
// question a status (Yes / No / N/A / Unknown to me -- blank until answered), a
// rating 1 to 4 (1 very bad, 2 bad, 3 OK, 4 very good), and remarks.
//
//   * SAVE as often as you like (a draft); SUBMIT once. A submitted audit is
//     read-only and nothing here deletes an audit -- the Admin corrects those.
//   * The visit number (1, 2, 3 ... per beneficiary) is given by the server when
//     the audit is first saved.
//   * Everything saves through POST /api/audit/save (header + answers together).
//   * What you type is also kept on the phone as you go, so a closed app or a
//     dropped connection doesn't lose a long checklist.
//
// "Mine" lists the audits you recorded; "All" lets you read the others'.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { loadLocalDraft, saveLocalDraft, clearLocalDraft } from '../../data/dsrOutbox';
import { todayLocalYMD, nowHHMM } from '../../utils/date';
import { Screen, Card, Chip, Field, Select, DateField, TimeField, PrimaryButton, SecondaryButton, SectionLabel } from '../../components/UI';
import { colors, spacing } from '../../theme';

const FLAGS = [
  { value: 'Y', label: 'Yes', color: colors.green },
  { value: 'N', label: 'No', color: colors.red },
  { value: 'NA', label: 'N/A', color: colors.textMuted },
  { value: 'UN', label: 'Unknown', color: colors.amber },
];
const FLAG_NAMES = { Y: 'Yes', N: 'No', NA: 'Not applicable', UN: 'Unknown to me' };
const RATING_NAMES = { 1: 'Very bad', 2: 'Bad', 3: 'OK', 4: 'Very good' };

function benLabel(b) {
  return b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--';
}

// "10:30" / "9:30 AM" -> minutes, so times compare correctly whatever the format.
function minutes(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(String(t || ''));
  if (!m) return null;
  let hh = Number(m[1]);
  const ap = m[3] && m[3].toLowerCase();
  if (ap === 'pm' && hh !== 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  return hh * 60 + Number(m[2]);
}

function StatusBadge({ status }) {
  const submitted = status === 'Submitted';
  return <Text style={{ color: submitted ? colors.green : colors.amber, fontWeight: '800', fontSize: 11 }}>{String(status || '').toUpperCase()}</Text>;
}

// ---------------------------------------------------------------------------
// One checklist question. Defined at the top level (not inside the editor) so
// typing in its remarks box doesn't remount it and drop the keyboard.
// ---------------------------------------------------------------------------
function Question({ category, answer, onChange, readOnly }) {
  const a = answer || { statusFlag: '', rating: '', remarks: '' };
  const [showRemark, setShowRemark] = useState(!!a.remarks);
  const unanswered = !a.statusFlag && !a.rating && !a.remarks;

  const title = (
    <Text style={{ color: colors.text, fontWeight: '600', marginBottom: spacing.xs }}>
      {category.id}  {category.description}
    </Text>
  );

  if (readOnly) {
    return (
      <View style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
        {title}
        {unanswered ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Not answered</Text>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {a.statusFlag ? FLAG_NAMES[a.statusFlag] : '--'}
            {a.rating ? ` - Rating ${a.rating} (${RATING_NAMES[a.rating]})` : ''}
            {a.remarks ? ` - ${a.remarks}` : ''}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
      {title}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {FLAGS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            color={f.color}
            active={a.statusFlag === f.value}
            onPress={() => onChange({ ...a, statusFlag: a.statusFlag === f.value ? '' : f.value })}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginRight: spacing.xs }}>Rating</Text>
        {[1, 2, 3, 4].map((n) => (
          <Chip key={n} label={String(n)} active={a.rating === n} onPress={() => onChange({ ...a, rating: a.rating === n ? '' : n })} />
        ))}
        {a.rating ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{RATING_NAMES[a.rating]}</Text> : null}
      </View>
      {showRemark ? (
        <Field placeholder="Remarks" value={a.remarks} onChangeText={(v) => onChange({ ...a, remarks: v })} multiline />
      ) : (
        <TouchableOpacity onPress={() => setShowRemark(true)} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>+ Add remark</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The editor: a new audit, a saved draft, or (read-only) a submitted one.
// ---------------------------------------------------------------------------
function AuditEditor({ id, onClose, onSaved }) {
  const { currentUser } = useAuth();
  const { db, refresh } = useData();
  const me = currentUser?.id;
  const today = todayLocalYMD();

  const existing = id ? db.audits.find((a) => a.id === id) : null;
  const readOnly = !!existing && (existing.status === 'Submitted' || existing.auditorId !== me);

  const answersFromDb = () => {
    const map = {};
    db.auditDetail
      .filter((d) => d.auditId === id)
      .forEach((d) => {
        map[d.categoryNo] = { statusFlag: d.statusFlag || '', rating: d.rating || '', remarks: d.remarks || '' };
      });
    return map;
  };

  const [h, setH] = useState(() => ({
    beneficiaryId: existing?.beneficiaryId || '',
    auditDate: existing?.auditDate || today,
    timeFrom: existing?.timeFrom || (existing ? '' : nowHHMM()),
    timeTo: existing?.timeTo || '',
    facilitator1Id: existing?.facilitator1Id || '',
    facilitator2Id: existing?.facilitator2Id || '',
    visitRemarks: existing?.visitRemarks || '',
  }));
  const [answers, setAnswers] = useState(answersFromDb);
  const [open, setOpen] = useState({});
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const readyRef = useRef(false);
  const backupKey = `audit|${id || 'new'}|${me}`;

  const patch = (p) => setH((cur) => ({ ...cur, ...p }));
  const setAnswer = (categoryNo, value) => setAnswers((cur) => ({ ...cur, [categoryNo]: value }));

  // Bring back anything typed but not saved (closed app, no signal), if newer.
  useEffect(() => {
    if (readOnly) return undefined;
    let cancelled = false;
    (async () => {
      const local = await loadLocalDraft(backupKey);
      if (!cancelled && local && (!existing || local.savedAt > Date.parse(existing.updatedAt || 0))) {
        setH((cur) => ({ ...cur, ...local.form.h }));
        setAnswers(local.form.answers || {});
        setRestored(true);
      }
      readyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (readOnly || !readyRef.current) return undefined;
    const timer = setTimeout(() => saveLocalDraft(backupKey, { h, answers }), 700);
    return () => clearTimeout(timer);
  }, [h, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- choices -----------------------------------------------------------
  const beneficiaryOptions = useMemo(
    () => db.beneficiaries.slice().sort((a, b) => benLabel(a).localeCompare(benLabel(b))).map((b) => ({ value: b.id, label: benLabel(b) })),
    [db.beneficiaries]
  );
  const facilitatorOptions = useMemo(
    () =>
      db.resources
        .filter((r) => (r.role === 'Facilitator' || r.role === 'Audit Facilitator') && r.active !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((r) => ({ value: r.id, label: r.name })),
    [db.resources]
  );
  const resName = (rid) => db.resources.find((r) => r.id === rid)?.name || '--';

  // Choosing a beneficiary fills in the facilitators allocated to it (changeable).
  function chooseBeneficiary(bid) {
    const alloc = db.allocations.find((a) => a.active !== false && a.beneficiaryId === bid);
    patch({ beneficiaryId: bid, facilitator1Id: alloc?.resource1Id || '', facilitator2Id: alloc?.resource2Id || '' });
  }

  const nextVisit = useMemo(() => {
    if (!h.beneficiaryId) return null;
    const nums = db.audits.filter((a) => a.beneficiaryId === h.beneficiaryId).map((a) => a.visitNumber || 0);
    return Math.max(0, ...nums) + 1;
  }, [db.audits, h.beneficiaryId]);

  // ---- the checklist, grouped by section ---------------------------------
  const sections = useMemo(() => {
    const map = {};
    db.auditCategories.forEach((c) => {
      const major = String(c.id).split('.')[0];
      const s = (map[major] = map[major] || { major, heading: null, questions: [] });
      if (c.isHeading) s.heading = c;
      else s.questions.push(c);
    });
    const bySort = (x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0);
    return Object.values(map)
      .map((s) => ({
        ...s,
        // a retired question is only shown if it already has an answer
        questions: s.questions.filter((c) => c.active !== false || answers[c.id]).sort(bySort),
      }))
      .filter((s) => s.questions.length > 0)
      .sort((a, b) => Number(a.major) - Number(b.major));
  }, [db.auditCategories, answers]);

  const isAnswered = (a) => !!(a && a.statusFlag);
  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
  const answeredQuestions = sections.reduce((n, s) => n + s.questions.filter((c) => isAnswered(answers[c.id])).length, 0);

  // ---- save / submit -----------------------------------------------------
  function problem(submit) {
    if (!h.beneficiaryId) return 'Choose the beneficiary.';
    if (!h.auditDate) return 'Choose the audit date.';
    if (h.auditDate > today) return "The audit date can't be in the future.";
    if (submit) {
      if (!h.timeFrom || !h.timeTo) return 'Fill in the time from and time to.';
      if (!h.facilitator1Id) return 'Choose Facilitator 1.';
    }
    if (h.timeFrom && h.timeTo && minutes(h.timeTo) <= minutes(h.timeFrom)) return 'The end time must be after the start time.';
    if (h.facilitator1Id && h.facilitator1Id === h.facilitator2Id) return 'Facilitator 1 and Facilitator 2 must be different people.';
    return null;
  }

  async function send(submit) {
    setSaving(true);
    try {
      const res = await apiPost('/api/audit/save', {
        id: id || undefined,
        submit,
        header: h,
        details: Object.entries(answers).map(([categoryNo, a]) => ({ categoryNo, statusFlag: a.statusFlag, rating: a.rating, remarks: a.remarks })),
      });
      await refresh();
      await clearLocalDraft(backupKey);
      if (submit) {
        Alert.alert('Submitted', "The audit has been submitted. It can't be changed now.");
        onClose();
      } else if (!id) {
        onSaved(res.audit.id); // carry on editing the saved draft
      } else {
        Alert.alert('Saved', 'Draft saved.');
      }
    } catch (e) {
      Alert.alert(submit ? 'Could not submit' : 'Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function save(submit) {
    const p = problem(submit);
    if (p) return Alert.alert('Check the audit', p);
    if (!submit) return send(false);
    const left = totalQuestions - answeredQuestions;
    Alert.alert(
      'Submit audit?',
      `${left > 0 ? `${left} of ${totalQuestions} questions have no answer. ` : ''}Once submitted, the audit can't be changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: left > 0 ? 'Submit anyway' : 'Submit', onPress: () => send(true) },
      ]
    );
  }

  // ---- render --------------------------------------------------------------
  const row = (label, value) => (
    <Text style={{ color: colors.text, fontSize: 13, marginBottom: 3 }}>
      <Text style={{ color: colors.textMuted }}>{label}: </Text>
      {value || '--'}
    </Text>
  );

  return (
    <Screen>
      <TouchableOpacity onPress={onClose} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '700' }}>All audits</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginRight: spacing.sm }}>
            {existing ? `Audit - visit ${existing.visitNumber}` : 'New audit visit'}
          </Text>
          {existing ? <StatusBadge status={existing.status} /> : null}
        </View>

        {restored ? (
          <Text style={{ color: colors.amber, fontSize: 12, marginBottom: spacing.sm }}>Brought back what you had typed but not yet saved.</Text>
        ) : null}
        {readOnly ? (
          <Card style={{ backgroundColor: colors.chipBg }}>
            <Text style={{ color: colors.text, fontSize: 12 }}>
              {existing.status === 'Submitted'
                ? "This audit has been submitted, so it can't be changed. Ask your admin if something needs correcting."
                : `This audit was recorded by ${resName(existing.auditorId)}. You can read it but not change it.`}
            </Text>
          </Card>
        ) : null}

        {readOnly ? (
          <Card>
            {row('Beneficiary', benLabel(db.beneficiaries.find((b) => b.id === h.beneficiaryId)))}
            {row('Visit number', existing?.visitNumber)}
            {row('Audit date', h.auditDate)}
            {row('Time', `${h.timeFrom || '--'} to ${h.timeTo || '--'}`)}
            {row('Recorded by', resName(existing?.auditorId))}
            {row('Facilitator 1', h.facilitator1Id ? resName(h.facilitator1Id) : '')}
            {row('Facilitator 2', h.facilitator2Id ? resName(h.facilitator2Id) : '')}
            {row('Visit remarks', h.visitRemarks)}
          </Card>
        ) : (
          <Card>
            <SectionLabel>Beneficiary</SectionLabel>
            <Select value={h.beneficiaryId} onSelect={chooseBeneficiary} options={beneficiaryOptions} placeholder="Choose beneficiary..." />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
              Visit number: {existing ? existing.visitNumber : nextVisit ? `${nextVisit} (confirmed when you save)` : 'chosen after the beneficiary'}
            </Text>
            <DateField label="Audit date" value={h.auditDate} onChange={(v) => patch({ auditDate: v })} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <TimeField label="Time from" value={h.timeFrom} onChange={(v) => patch({ timeFrom: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Time to" value={h.timeTo} onChange={(v) => patch({ timeTo: v })} />
              </View>
            </View>
            <SectionLabel>Facilitator 1</SectionLabel>
            <Select value={h.facilitator1Id} onSelect={(v) => patch({ facilitator1Id: v })} options={facilitatorOptions} placeholder="Choose facilitator..." />
            <SectionLabel>Facilitator 2 (optional)</SectionLabel>
            <Select
              value={h.facilitator2Id}
              onSelect={(v) => patch({ facilitator2Id: v })}
              options={[{ value: '', label: 'None' }, ...facilitatorOptions]}
              placeholder="None"
            />
            <Field label="Visit remarks (optional)" value={h.visitRemarks} onChangeText={(v) => patch({ visitRemarks: v })} multiline />
          </Card>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>
            Checklist - {answeredQuestions} of {totalQuestions} answered
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={() => setOpen(Object.fromEntries(sections.map((s) => [s.major, true])))}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Expand all</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{'  |  '}</Text>
            <TouchableOpacity onPress={() => setOpen({})}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Collapse all</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!readOnly ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm }}>
            Rating: 1 Very bad, 2 Bad, 3 OK, 4 Very good. Tap an answer again to clear it.
          </Text>
        ) : null}

        {sections.length === 0 ? (
          <Text style={{ color: colors.textMuted, marginVertical: spacing.md }}>The checklist hasn't been set up yet. Ask your admin to add it under Masters, Audit Categories.</Text>
        ) : null}

        {sections.map((s) => {
          const isOpen = !!open[s.major];
          const done = s.questions.filter((c) => isAnswered(answers[c.id])).length;
          return (
            <Card key={s.major} style={{ padding: 0, overflow: 'hidden' }}>
              <TouchableOpacity
                onPress={() => setOpen((cur) => ({ ...cur, [s.major]: !isOpen }))}
                style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.chipBg }}
              >
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={{ fontWeight: '800', color: colors.text }}>
                    {s.major}  {s.heading ? s.heading.description : '(no heading)'}
                  </Text>
                  <Text style={{ color: done === s.questions.length ? colors.green : colors.textMuted, fontSize: 11 }}>
                    {done} of {s.questions.length} answered
                  </Text>
                </View>
              </TouchableOpacity>
              {isOpen &&
                s.questions.map((c) => (
                  <Question key={c.id} category={c} answer={answers[c.id]} readOnly={readOnly} onChange={(value) => setAnswer(c.id, value)} />
                ))}
            </Card>
          );
        })}

        {!readOnly ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <SecondaryButton title={saving ? 'Saving...' : 'Save draft'} onPress={() => save(false)} disabled={saving} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Submit audit" onPress={() => save(true)} disabled={saving} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// The list of audits.
// ---------------------------------------------------------------------------
function AuditList({ onOpen }) {
  const { currentUser } = useAuth();
  const { db } = useData();
  const me = currentUser?.id;
  const [scope, setScope] = useState('mine');

  const resName = (rid) => db.resources.find((r) => r.id === rid)?.name || '--';
  const activeQuestions = db.auditCategories.filter((c) => !c.isHeading && c.active !== false).length;

  const rows = useMemo(
    () =>
      db.audits
        .filter((a) => scope === 'all' || a.auditorId === me)
        .slice()
        .sort((a, b) => String(b.auditDate).localeCompare(String(a.auditDate)) || (b.visitNumber || 0) - (a.visitNumber || 0)),
    [db.audits, scope, me]
  );

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>Audit visits</Text>

      <PrimaryButton title="+ New audit visit" onPress={() => onOpen(null)} style={{ marginBottom: spacing.sm }} />

      <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
        <Chip label="My audits" active={scope === 'mine'} onPress={() => setScope('mine')} />
        <Chip label="All audits" active={scope === 'all'} onPress={() => setScope('all')} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {rows.length === 0 && (
          <Text style={{ color: colors.textMuted }}>
            {scope === 'mine' ? 'You have not recorded any audits yet. Tap the button above to start one.' : 'No audits have been recorded yet.'}
          </Text>
        )}
        {rows.map((a) => {
          const answered = db.auditDetail.filter((d) => d.auditId === a.id && d.statusFlag).length;
          return (
            <TouchableOpacity key={a.id} onPress={() => onOpen(a.id)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: colors.text, flex: 1, paddingRight: spacing.sm }}>
                    {benLabel(db.beneficiaries.find((b) => b.id === a.beneficiaryId))}
                  </Text>
                  <StatusBadge status={a.status} />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Visit {a.visitNumber} - {a.auditDate}
                  {a.timeFrom ? ` - ${a.timeFrom}${a.timeTo ? ' to ' + a.timeTo : ''}` : ''}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Facilitators: {[a.facilitator1Id, a.facilitator2Id].filter(Boolean).map(resName).join(', ') || '--'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {answered} of {activeQuestions} answered{scope === 'all' ? ` - by ${resName(a.auditorId)}` : ''}
                </Text>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

export default function AuditScreen() {
  // undefined = the list, null = a new audit, an id = that audit
  const [openId, setOpenId] = useState(undefined);
  if (openId === undefined) return <AuditList onOpen={setOpenId} />;
  return <AuditEditor key={openId || 'new'} id={openId} onClose={() => setOpenId(undefined)} onSaved={(savedId) => setOpenId(savedId)} />;
}
