// SCREEN (Admin): Dashboard -- activity across all resources and beneficiaries.
//
// Filters: a date range, a resource (or all) and a beneficiary (or all). They
// apply to every tab.
//
//   Overview    counts, attendance per resource, and the exceptions at a glance  [view only]
//   Attendance  view, add, edit, delete
//   DSR         view, add, edit, delete  (the editor is DsrAdminEditor)
//   Uploads     view and download the files people uploaded
//   Audits      view, add, edit, delete  (the editor is the audit screen in admin mode)
//   Exceptions  things to look at: DSR Red/Amber ratings, attendance with no DSR,
//               late arrivals / early departures, sign-ins at a non-assigned
//               beneficiary, and audit rating changes            (see ExceptionsPanel)
//
// Every tab can be exported (Excel; the Overview and Exceptions as CSV).
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../../data/store';
import { Screen, Card, Select, DateField, TimeField, PrimaryButton, SecondaryButton, SectionLabel, RagChip } from '../../components/UI';
import { AddModal, IconButton } from '../../components/MasterParts';
import { DsrSummary } from '../facilitator/DsrScreen';
import { AuditEditor } from '../facilitator/AuditScreen';
import DsrAdminEditor from './DsrAdminEditor';
import ExceptionsPanel from './ExceptionsPanel';
import { computeExceptions, auditChanges, exceptionRows, toMinutes } from '../../utils/exceptions';
import { exportTable, exportReport, exportCsv } from '../../utils/exportTable';
import { viewFile, downloadFile } from '../../utils/fileActions';
import { todayLocalYMD } from '../../utils/date';
import { colors, spacing } from '../../theme';

const TABS = ['Overview', 'Attendance', 'DSR', 'Uploads', 'Audits', 'Exceptions'];

const benLabel = (b) => (b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--');

// One number with its label; give it onPress to make it tappable.
function Stat({ value, label, sub, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} style={{ width: '33.33%', alignItems: 'center', paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: onPress ? colors.primary : colors.text }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>{label}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>{sub}</Text> : null}
    </Wrapper>
  );
}

export default function AdminDashboardScreen() {
  const { db, addRecord, updateRecord, deleteRecord, nextId, refresh } = useData();
  const today = todayLocalYMD();

  const [tab, setTab] = useState('Overview');
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`); // the 1st of this month
  const [to, setTo] = useState(today);
  const [resourceId, setResourceId] = useState(''); // '' = all resources
  const [beneficiaryId, setBeneficiaryId] = useState(''); // '' = all beneficiaries
  const [editor, setEditor] = useState(null); // { type: 'dsr' | 'audit', id }
  const [expandedDsr, setExpandedDsr] = useState(null);
  const [exporting, setExporting] = useState(false);

  // attendance add / edit form
  const [attForm, setAttForm] = useState(null); // null = closed
  const [saving, setSaving] = useState(false);

  const resName = (id) => db.resources.find((r) => r.id === id)?.name || '--';
  const benName = (id) => benLabel(db.beneficiaries.find((b) => b.id === id));
  const materialName = (id) => {
    const m = db.materialMaster.find((x) => x.id === id);
    return m ? `${m.name}${m.type ? ' (' + m.type + ')' : ''}` : '';
  };

  const facilitators = db.resources.filter((r) => r.role === 'Facilitator' || r.role === 'Audit Facilitator');
  const resourceOptions = facilitators.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((r) => ({ value: r.id, label: r.name }));
  const beneficiaryOptions = db.beneficiaries.slice().sort((a, b) => benLabel(a).localeCompare(benLabel(b))).map((b) => ({ value: b.id, label: benLabel(b) }));

  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const benOk = (id) => !beneficiaryId || id === beneficiaryId;

  // ---- the data under the filters -----------------------------------------
  const attendance = useMemo(
    () =>
      db.attendance
        .filter((a) => (!resourceId || a.facilitatorId === resourceId) && benOk(a.beneficiaryId) && inRange(a.date))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.timeIn).localeCompare(String(a.timeIn))),
    [db.attendance, resourceId, beneficiaryId, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dsrs = useMemo(
    () =>
      db.dsr
        .filter((d) => (!resourceId || d.resourceId === resourceId) && benOk(d.beneficiaryId) && inRange(d.dsrDate))
        .sort((a, b) => String(b.dsrDate).localeCompare(String(a.dsrDate))),
    [db.dsr, resourceId, beneficiaryId, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const uploads = useMemo(
    () =>
      db.uploads
        .filter((u) => (!resourceId || u.facilitatorId === resourceId) && benOk(u.beneficiaryId) && inRange(u.date))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [db.uploads, resourceId, beneficiaryId, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // "for a resource" on an audit: the person who recorded it OR a facilitator audited
  const audits = useMemo(
    () =>
      db.audits
        .filter((a) => (!resourceId || [a.auditorId, a.facilitator1Id, a.facilitator2Id].includes(resourceId)) && benOk(a.beneficiaryId) && inRange(a.auditDate))
        .sort((a, b) => String(b.auditDate).localeCompare(String(a.auditDate)) || (b.visitNumber || 0) - (a.visitNumber || 0)),
    [db.audits, resourceId, beneficiaryId, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- exceptions ------------------------------------------------------------
  const exceptions = useMemo(() => {
    // audit comparisons look at ALL audits of a beneficiary (latest vs the one before);
    // the filters then apply to the latest visit
    const changes = auditChanges(db.audits, db.auditDetail, db.auditCategories).filter(
      (c) =>
        benOk(c.beneficiaryId) &&
        inRange(c.latest.auditDate) &&
        (!resourceId || [c.latest.auditorId, c.latest.facilitator1Id, c.latest.facilitator2Id].includes(resourceId))
    );
    return computeExceptions({ attendance, dsrs, allDsrs: db.dsr, allocations: db.allocations, auditChangeList: changes });
  }, [attendance, dsrs, db.dsr, db.allocations, db.audits, db.auditDetail, db.auditCategories, resourceId, beneficiaryId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const ragTotals = ['stock', 'book', 'overall'].map((k) => ({ red: exceptions.rag[k].Red.length, amber: exceptions.rag[k].Amber.length }));
  const exceptionCount =
    ragTotals.reduce((n, r) => n + r.red + r.amber, 0) +
    exceptions.noDsr.length + exceptions.lateEarly.length + exceptions.nonAssigned.length + exceptions.auditChanges.length;

  const attendanceByResource = useMemo(() => {
    const counts = {};
    attendance.forEach((a) => {
      const name = resName(a.facilitatorId);
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).sort((x, y) => y[1] - x[1]);
  }, [attendance, db.resources]); // eslint-disable-line react-hooks/exhaustive-deps

  const submittedDsrs = dsrs.filter((d) => d.status === 'Submitted').length;

  // ---- attendance: add / edit / delete -----------------------------------------
  function openAttendance(rec) {
    setAttForm(
      rec
        ? { id: rec.id, resourceId: rec.facilitatorId, beneficiaryId: rec.beneficiaryId || '', date: rec.date, timeIn: rec.timeIn || '', timeOut: rec.timeOut || '', geoVerified: !!rec.geoVerified }
        : { id: null, resourceId, beneficiaryId, date: today, timeIn: '', timeOut: '', geoVerified: false }
    );
  }

  async function saveAttendance() {
    const f = attForm;
    if (!f.resourceId) return Alert.alert('Missing fields', 'Choose the resource.');
    if (!f.beneficiaryId) return Alert.alert('Missing fields', 'Choose the beneficiary.');
    if (!f.date) return Alert.alert('Missing fields', 'Choose the date.');
    if (f.date > today) return Alert.alert('Check the date', "The date can't be in the future.");
    if (!f.timeIn) return Alert.alert('Missing fields', 'Enter the time in.');
    if (f.timeOut && toMinutes(f.timeOut) !== null && toMinutes(f.timeIn) !== null && toMinutes(f.timeOut) <= toMinutes(f.timeIn)) {
      return Alert.alert('Check the times', 'The time out must be after the time in.');
    }
    setSaving(true);
    try {
      if (f.id) {
        await updateRecord('attendance', f.id, { beneficiaryId: f.beneficiaryId, date: f.date, timeIn: f.timeIn, timeOut: f.timeOut || null, geoVerified: f.geoVerified });
      } else {
        await addRecord('attendance', {
          id: nextId('ATT', 'attendance'),
          facilitatorId: f.resourceId,
          beneficiaryId: f.beneficiaryId,
          date: f.date,
          timeIn: f.timeIn,
          timeOut: f.timeOut || null,
          geoVerified: false, // added by the admin, not checked in on site
        });
      }
      setAttForm(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(title, message, action) {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => action().catch((e) => Alert.alert('Could not delete', e.message || 'Please try again.')) },
    ]);
  }

  // ---- export, per tab ------------------------------------------------------------
  async function doExport() {
    setExporting(true);
    try {
      const scope = { from: from || '1900-01-01', to: to || '2999-12-31', facilitatorId: resourceId || 'all' };
      if (tab === 'Overview') {
        await exportCsv(`dashboard-summary-${from}-to-${to}.csv`, [
          ['PPSP - dashboard summary', ''],
          ['From', from],
          ['To', to],
          ['Resource', resourceId ? resName(resourceId) : 'All resources'],
          ['Beneficiary', beneficiaryId ? benName(beneficiaryId) : 'All beneficiaries'],
          ['', ''],
          ['Attendance records', attendance.length],
          ['DSRs submitted', submittedDsrs],
          ['DSR drafts', dsrs.length - submittedDsrs],
          ['Files uploaded', uploads.length],
          ['Audits', audits.length],
          ['', ''],
          ['Exceptions', exceptionCount],
          ['Stock Red', exceptions.rag.stock.Red.length],
          ['Stock Amber', exceptions.rag.stock.Amber.length],
          ['Book Red', exceptions.rag.book.Red.length],
          ['Book Amber', exceptions.rag.book.Amber.length],
          ['Overall Red', exceptions.rag.overall.Red.length],
          ['Overall Amber', exceptions.rag.overall.Amber.length],
          ['Attendance but no DSR', exceptions.noDsr.length],
          ['Late or early', exceptions.lateEarly.length],
          ['Signed in at a non-assigned beneficiary', exceptions.nonAssigned.length],
          ['Beneficiaries with audit rating changes', exceptions.auditChanges.length],
        ]);
      } else if (tab === 'Attendance') {
        await exportReport('attendance', { ...scope, ids: attendance.map((a) => a.id).join(',') });
      } else if (tab === 'DSR') {
        await exportTable('dsr', dsrs.map((d) => d.id));
      } else if (tab === 'Uploads') {
        await exportReport('uploads', { ...scope, ids: uploads.map((u) => u.id).join(',') });
      } else if (tab === 'Audits') {
        await exportTable('audits', audits.map((a) => a.id));
      } else {
        await exportCsv(`exceptions-${from}-to-${to}.csv`, exceptionRows(exceptions, { resource: resName, beneficiary: benName }));
      }
    } finally {
      setExporting(false);
    }
  }

  const exportLabel = {
    Overview: 'Export summary (CSV)',
    Attendance: 'Export attendance to Excel',
    DSR: 'Export DSRs to Excel',
    Uploads: 'Export uploads to Excel',
    Audits: 'Export audits to Excel',
    Exceptions: 'Export exceptions (CSV)',
  }[tab];

  // ---- the editors take over the screen -----------------------------------------------
  if (editor && editor.type === 'dsr') {
    return <DsrAdminEditor id={editor.id} defaults={{ resourceId, beneficiaryId }} onClose={() => setEditor(null)} />;
  }
  if (editor && editor.type === 'audit') {
    return <AuditEditor adminMode id={editor.id} onClose={() => setEditor(null)} onSaved={() => setEditor(null)} />;
  }

  const addButton = (label, onPress) => (
    <SecondaryButton title={label} onPress={onPress} style={{ marginBottom: spacing.sm }} />
  );

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>Dashboard</Text>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={(v) => { setFrom(v); if (to && to < v) setTo(v); }} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={(v) => { setTo(v); if (from && from > v) setFrom(v); }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Select value={resourceId} onSelect={setResourceId} options={[{ value: '', label: 'All resources' }, ...resourceOptions]} />
        </View>
        <View style={{ flex: 1 }}>
          <Select value={beneficiaryId} onSelect={setBeneficiaryId} options={[{ value: '', label: 'All beneficiaries' }, ...beneficiaryOptions]} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: spacing.xs }}>
        {TABS.map((t) => {
          const on = tab === t;
          return (
            <View key={t} style={{ width: '33.33%', padding: 3 }}>
              <TouchableOpacity
                onPress={() => setTab(t)}
                style={{ paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.chipBg, alignItems: 'center' }}
              >
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: on ? '#fff' : colors.text }}>
                  {t}
                  {t === 'Exceptions' && exceptionCount > 0 ? `  ${exceptionCount}` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <SecondaryButton title={exporting ? 'Exporting...' : exportLabel} onPress={doExport} disabled={exporting} style={{ marginBottom: spacing.sm }} />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* ---------------------------------------------------------- Overview */}
        {tab === 'Overview' && (
          <>
            <Card>
              <Text style={{ fontWeight: '700', color: colors.text }}>{from} to {to}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Stat value={attendance.length} label="Attendance records" />
                <Stat value={submittedDsrs} label="DSRs submitted" sub={dsrs.length > submittedDsrs ? `${dsrs.length - submittedDsrs} draft` : undefined} />
                <Stat value={uploads.length} label="Files uploaded" />
                <Stat value={audits.length} label="Audits" />
                <Stat value={exceptionCount} label="Exceptions" onPress={() => setTab('Exceptions')} />
              </View>
            </Card>

            <Card>
              <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>Attendance by resource</Text>
              {attendanceByResource.length === 0 ? (
                <Text style={{ color: colors.textMuted }}>No attendance records for these filters.</Text>
              ) : (
                attendanceByResource.map(([name, count]) => (
                  <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                    <Text style={{ color: colors.textMuted }}>{name}</Text>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{count}</Text>
                  </View>
                ))
              )}
            </Card>

            <Card>
              <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>Exceptions at a glance</Text>
              {[
                ['Stock Red / Amber', `${ragTotals[0].red} / ${ragTotals[0].amber}`],
                ['Book Red / Amber', `${ragTotals[1].red} / ${ragTotals[1].amber}`],
                ['Overall Red / Amber', `${ragTotals[2].red} / ${ragTotals[2].amber}`],
                ['Attendance but no DSR', exceptions.noDsr.length],
                ['Late or early', exceptions.lateEarly.length],
                ['Non-assigned beneficiary', exceptions.nonAssigned.length],
                ['Audit rating changes', exceptions.auditChanges.length],
              ].map(([label, value]) => (
                <TouchableOpacity key={label} onPress={() => setTab('Exceptions')} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: colors.textMuted }}>{label}</Text>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{value}</Text>
                </TouchableOpacity>
              ))}
            </Card>
          </>
        )}

        {/* -------------------------------------------------------- Attendance */}
        {tab === 'Attendance' && (
          <>
            {addButton('+ Add attendance', () => openAttendance(null))}
            {attendance.length === 0 ? <Text style={{ color: colors.textMuted }}>No attendance records for these filters.</Text> : null}
            {attendance.map((a) => (
              <Card key={a.id}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{a.date} - {resName(a.facilitatorId)}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{benName(a.beneficiaryId)}</Text>
                    <Text style={{ color: colors.text, fontSize: 13 }}>Time in: {a.timeIn || '--'}   Time out: {a.timeOut || '--'}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{a.geoVerified ? 'Geofence verified' : 'Not geofence-verified'}{a.overridden ? ' - corrected by admin' : ''}</Text>
                  </View>
                  <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => openAttendance(a)} />
                  <IconButton name="trash-outline" color={colors.red} label="Delete" onPress={() => confirmDelete('Delete attendance', `Remove ${resName(a.facilitatorId)}'s attendance on ${a.date}?`, () => deleteRecord('attendance', a.id))} />
                </View>
              </Card>
            ))}
          </>
        )}

        {/* ---------------------------------------------------------------- DSR */}
        {tab === 'DSR' && (
          <>
            {addButton('+ Add DSR', () => setEditor({ type: 'dsr', id: null }))}
            {dsrs.length === 0 ? <Text style={{ color: colors.textMuted }}>No DSRs for these filters.</Text> : null}
            {dsrs.map((d) => {
              const open = expandedDsr === d.id;
              return (
                <Card key={d.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => setExpandedDsr(open ? null : d.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
                      <View style={{ flex: 1, marginLeft: spacing.sm }}>
                        <Text style={{ fontWeight: '700', color: colors.text }}>{d.dsrDate} - {resName(d.resourceId)}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{benName(d.beneficiaryId)} - {d.status === 'Submitted' ? 'Submitted' : 'Draft'}</Text>
                      </View>
                      {d.overallRag ? <RagChip rag={d.overallRag} /> : null}
                    </TouchableOpacity>
                    <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => setEditor({ type: 'dsr', id: d.id })} />
                    <IconButton
                      name="trash-outline"
                      color={colors.red}
                      label="Delete"
                      onPress={() => confirmDelete('Delete DSR', `Remove ${resName(d.resourceId)}'s DSR for ${d.dsrDate}, with its materials and students?`, async () => { await deleteRecord('dsr', d.id); await refresh(); })}
                    />
                  </View>
                  {open ? (
                    <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                      <DsrSummary dsr={d} db={db} />
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </>
        )}

        {/* ------------------------------------------------------------ Uploads */}
        {tab === 'Uploads' &&
          (uploads.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No uploads for these filters.</Text>
          ) : (
            uploads.map((u) => (
              <Card key={u.id}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{u.date} - {resName(u.facilitatorId)} - {benName(u.beneficiaryId)}</Text>
                {u.materialId ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{materialName(u.materialId)}</Text> : null}
                {u.description ? <Text style={{ color: colors.text, fontSize: 12 }}>{u.description}</Text> : null}
                {u.fileUrl ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton title="View" onPress={() => viewFile(u.fileUrl)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton title="Download" onPress={() => downloadFile(u)} />
                    </View>
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>No file attached -- details only.</Text>
                )}
              </Card>
            ))
          ))}

        {/* ------------------------------------------------------------- Audits */}
        {tab === 'Audits' && (
          <>
            {addButton('+ Add audit', () => setEditor({ type: 'audit', id: null }))}
            {audits.length === 0 ? <Text style={{ color: colors.textMuted }}>No audits for these filters.</Text> : null}
            {audits.map((a) => {
              const answered = db.auditDetail.filter((d) => d.auditId === a.id && d.statusFlag).length;
              return (
                <Card key={a.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <TouchableOpacity onPress={() => setEditor({ type: 'audit', id: a.id })} style={{ flex: 1, paddingRight: spacing.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ fontWeight: '700', color: colors.text }}>{benName(a.beneficiaryId)}</Text>
                        <Text style={{ color: a.status === 'Submitted' ? colors.green : colors.amber, fontWeight: '800', fontSize: 11, marginLeft: spacing.sm }}>{String(a.status).toUpperCase()}</Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Visit {a.visitNumber} - {a.auditDate}{a.timeFrom ? ` - ${a.timeFrom}${a.timeTo ? ' to ' + a.timeTo : ''}` : ''}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Facilitators: {[a.facilitator1Id, a.facilitator2Id].filter(Boolean).map(resName).join(', ') || '--'}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>By {resName(a.auditorId)} - {answered} answered</Text>
                    </TouchableOpacity>
                    <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => setEditor({ type: 'audit', id: a.id })} />
                    <IconButton
                      name="trash-outline"
                      color={colors.red}
                      label="Delete"
                      onPress={() => confirmDelete('Delete audit', `Remove the audit of ${benName(a.beneficiaryId)} (visit ${a.visitNumber}) with all its answers?`, async () => { await deleteRecord('audits', a.id); await refresh(); })}
                    />
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {/* --------------------------------------------------------- Exceptions */}
        {tab === 'Exceptions' && <ExceptionsPanel db={db} result={exceptions} />}
      </ScrollView>

      {/* ----------------------------------------------- attendance add / edit */}
      <AddModal visible={!!attForm} title={attForm?.id ? 'Edit attendance' : 'Add attendance'} onClose={() => setAttForm(null)}>
        {attForm ? (
          <>
            {!attForm.id ? (
              <>
                <SectionLabel>Resource</SectionLabel>
                <Select value={attForm.resourceId} onSelect={(v) => setAttForm({ ...attForm, resourceId: v })} options={resourceOptions} placeholder="Choose resource..." />
              </>
            ) : (
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: spacing.sm }}>{resName(attForm.resourceId)}</Text>
            )}
            <SectionLabel>Beneficiary</SectionLabel>
            <Select value={attForm.beneficiaryId} onSelect={(v) => setAttForm({ ...attForm, beneficiaryId: v })} options={beneficiaryOptions} placeholder="Choose beneficiary..." />
            <DateField label="Date" value={attForm.date} onChange={(v) => setAttForm({ ...attForm, date: v })} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <TimeField label="Time in" value={attForm.timeIn} onChange={(v) => setAttForm({ ...attForm, timeIn: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Time out (optional)" value={attForm.timeOut} onChange={(v) => setAttForm({ ...attForm, timeOut: v })} />
              </View>
            </View>
            {attForm.id ? (
              <>
                <SectionLabel>Geofence verified</SectionLabel>
                <Select
                  value={attForm.geoVerified ? 'yes' : 'no'}
                  onSelect={(v) => setAttForm({ ...attForm, geoVerified: v === 'yes' })}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
              </>
            ) : null}
            <PrimaryButton title={saving ? 'Saving...' : 'Save'} onPress={saveAttendance} disabled={saving} />
          </>
        ) : null}
      </AddModal>
    </Screen>
  );
}
