// SCREEN (Facilitator): Dashboard -- the facilitator's own activity for a date range.
//
//   Overview    counts for the range (days attended, attendance records, DSRs)
//               plus the current counts for their beneficiary: students, books
//               and material stock                               [view only]
//   Attendance  their check-ins                                  [view only]
//   My DSR      the DSRs they filed (tap one to read it)          [view only]
//   Leave       the leave and permission requests they made, and whether they were
//               approved ("requested and granted")                [view only; new
//               requests are made on the Attendance screen]
//
// Every tab can be exported (Excel; the Overview as a CSV summary). A search box
// filters whichever tab is showing. (Their uploads are on the Uploads tab, which
// has its own search, dates, view, download and export.)
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { Screen, Card, Field, RagChip, SecondaryButton, DateField } from '../../components/UI';
import { LeaveStatusBadge, leaveSummary } from '../../components/LeaveParts';
import { DsrSummary } from './DsrScreen';
import { exportTable, exportReport, exportCsv } from '../../utils/exportTable';
import { colors, spacing } from '../../theme';
import { todayLocalYMD } from '../../utils/date';

const TABS = ['Overview', 'Attendance', 'My DSR', 'Leave'];

function benLabel(b) {
  return b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--';
}

// A row of equal-width pills on ONE line (a label, and optionally a count under it).
function PillRow({ items, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
      {items.map((it, i) => {
        const on = value === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            style={{
              flex: 1,
              marginRight: i < items.length - 1 ? spacing.xs : 0,
              paddingVertical: 7,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.border,
              backgroundColor: on ? colors.primary : colors.chipBg,
              alignItems: 'center',
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : colors.text }}>{it.label}</Text>
            {it.count !== undefined ? (
              <Text style={{ fontSize: 13, fontWeight: '800', color: on ? '#fff' : colors.textMuted }}>{it.count}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Stat({ value, label, sub }) {
  return (
    <View style={{ width: '33.33%', alignItems: 'center', paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>{label}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>{sub}</Text> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const { currentUser } = useAuth();
  const { db } = useData();
  const me = currentUser?.id;
  const today = todayLocalYMD();

  const [tab, setTab] = useState('Overview');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`); // the 1st of this month
  const [to, setTo] = useState(today);
  const [leaveStatus, setLeaveStatus] = useState('All');
  const [expandedDsr, setExpandedDsr] = useState(null);
  const [exporting, setExporting] = useState(false);

  const q = query.trim().toLowerCase();
  const benName = (id) => benLabel(db.beneficiaries.find((b) => b.id === id));

  // ---- the data, for the date range -------------------------------------
  const myAttendance = useMemo(
    () =>
      db.attendance
        .filter((a) => a.facilitatorId === me && a.date >= from && a.date <= to)
        .filter((a) => !q || `${benName(a.beneficiaryId)} ${a.date}`.toLowerCase().includes(q))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [db.attendance, db.beneficiaries, me, from, to, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const myDsrs = useMemo(
    () =>
      db.dsr
        .filter((d) => d.resourceId === me && d.dsrDate >= from && d.dsrDate <= to)
        .filter((d) => !q || `${benName(d.beneficiaryId)} ${d.dsrDate} ${d.status} ${d.overallRag || ''} ${d.remarks || ''}`.toLowerCase().includes(q))
        .sort((a, b) => String(b.dsrDate).localeCompare(String(a.dsrDate))),
    [db.dsr, db.beneficiaries, me, from, to, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // A leave counts for the range if any of its days fall in it; a permission by its date.
  const myLeave = useMemo(
    () =>
      db.leaveRequests
        .filter((r) => r.resourceId === me)
        .filter((r) => {
          const start = (r.requestType === 'Leave' ? r.leaveFrom : r.permissionDate) || '';
          const end = (r.requestType === 'Leave' ? r.leaveTo : r.permissionDate) || '';
          return end >= from && start <= to;
        })
        .filter((r) => !q || `${leaveSummary(r)} ${r.status} ${r.reason || ''} ${r.adminRemarks || ''}`.toLowerCase().includes(q))
        .sort((a, b) => String(b.leaveFrom || b.permissionDate).localeCompare(String(a.leaveFrom || a.permissionDate))),
    [db.leaveRequests, me, from, to, q]
  );
  const leaveShown = leaveStatus === 'All' ? myLeave : myLeave.filter((r) => r.status === leaveStatus);

  // ---- the beneficiary's current lists (not tied to the date range) ------
  const allocation = db.allocations.find((a) => a.active !== false && (a.resource1Id === me || a.resource2Id === me));
  const beneficiary = allocation ? db.beneficiaries.find((b) => b.id === allocation.beneficiaryId) : null;
  const counts = useMemo(() => {
    const bid = beneficiary?.id;
    const books = db.bookUpdate.filter((r) => r.beneficiaryId === bid);
    const stock = db.stockUpdate.filter((r) => r.beneficiaryId === bid);
    const sum = (rows) => rows.reduce((n, r) => n + (Number(r.qty) || 0), 0);
    return {
      students: db.studentMaster.filter((s) => s.beneficiaryId === bid).length,
      bookTitles: books.length,
      bookCopies: sum(books),
      stockItems: stock.length,
      stockQty: sum(stock),
    };
  }, [db.studentMaster, db.bookUpdate, db.stockUpdate, beneficiary]);

  const daysAttended = new Set(myAttendance.map((a) => a.date)).size;
  const submittedDsrs = myDsrs.filter((d) => d.status === 'Submitted').length;

  // ---- export, per tab ---------------------------------------------------
  async function doExport() {
    setExporting(true);
    try {
      if (tab === 'Overview') {
        await exportCsv(`my-summary-${from}-to-${to}.csv`, [
          ['PPSP - my summary', ''],
          ['From', from],
          ['To', to],
          ['Beneficiary', benLabel(beneficiary)],
          ['', ''],
          ['In this date range', ''],
          ['Days attended', daysAttended],
          ['Attendance records', myAttendance.length],
          ['DSRs submitted', submittedDsrs],
          ['', ''],
          ['Current lists for my beneficiary', ''],
          ['Students', counts.students],
          ['Book titles', counts.bookTitles],
          ['Book copies (total qty)', counts.bookCopies],
          ['Material stock items', counts.stockItems],
          ['Material stock (total qty)', counts.stockQty],
        ]);
      } else if (tab === 'Attendance') {
        await exportReport('attendance', { from, to, facilitatorId: me });
      } else if (tab === 'My DSR') {
        await exportTable('dsr', myDsrs.map((d) => d.id));
      } else {
        await exportTable('leaveRequests', leaveShown.map((r) => r.id));
      }
    } finally {
      setExporting(false);
    }
  }

  const exportLabel =
    tab === 'Overview' ? 'Export summary (CSV)' : tab === 'Attendance' ? 'Export attendance to Excel' : tab === 'My DSR' ? 'Export DSRs to Excel' : 'Export leave & permission to Excel';

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>My activity</Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={(v) => { setFrom(v); if (to < v) setTo(v); }} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={(v) => { setTo(v); if (from > v) setFrom(v); }} />
        </View>
      </View>
      <Field value={query} onChangeText={setQuery} placeholder="Search..." />

      <PillRow items={TABS.map((t) => ({ key: t, label: t }))} value={tab} onChange={setTab} />

      <SecondaryButton title={exporting ? 'Exporting...' : exportLabel} onPress={doExport} disabled={exporting} style={{ marginBottom: spacing.md }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* ---------------------------------------------------------- Overview */}
        {tab === 'Overview' && (
          <>
            <Card>
              <Text style={{ fontWeight: '700', color: colors.text }}>{from} to {to}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Stat value={daysAttended} label="Days attended" />
                <Stat value={myAttendance.length} label="Attendance records" />
                <Stat value={submittedDsrs} label="DSRs submitted" sub={myDsrs.length !== submittedDsrs ? `${myDsrs.length - submittedDsrs} draft` : undefined} />
              </View>
            </Card>

            <Card>
              <Text style={{ fontWeight: '700', color: colors.text }}>{beneficiary ? benLabel(beneficiary) : 'No beneficiary assigned'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {beneficiary ? 'The lists you keep for your beneficiary, as they are now' : 'Ask your admin to allocate you to a beneficiary.'}
              </Text>
              {beneficiary ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Stat value={counts.students} label="Students" />
                  <Stat value={counts.bookTitles} label="Books" sub={`${counts.bookCopies} copies`} />
                  <Stat value={counts.stockItems} label="Material stock" sub={`${counts.stockQty} in total`} />
                </View>
              ) : null}
            </Card>
          </>
        )}

        {/* -------------------------------------------------------- Attendance */}
        {tab === 'Attendance' &&
          (myAttendance.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No attendance records for this range.</Text>
          ) : (
            myAttendance.map((a) => (
              <Card key={a.id}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{a.date}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{benName(a.beneficiaryId)}</Text>
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  Time in: {a.timeIn || '--'}   Time out: {a.timeOut || '--'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{a.geoVerified ? 'Geofence verified' : 'Not geofence-verified'}</Text>
              </Card>
            ))
          ))}

        {/* ------------------------------------------------------------ My DSR */}
        {tab === 'My DSR' &&
          (myDsrs.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No DSRs for this range.</Text>
          ) : (
            myDsrs.map((d) => {
              const open = expandedDsr === d.id;
              return (
                <Card key={d.id}>
                  <TouchableOpacity onPress={() => setExpandedDsr(open ? null : d.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{d.dsrDate}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {benName(d.beneficiaryId)} - {d.status === 'Submitted' ? 'Submitted' : 'Draft (not submitted)'}
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
            })
          ))}

        {/* ------------------------------------------------------------- Leave */}
        {tab === 'Leave' && (
          <>
            <PillRow
              items={['All', 'Pending', 'Approved', 'Rejected'].map((st) => ({
                key: st,
                label: st,
                count: st === 'All' ? myLeave.length : myLeave.filter((r) => r.status === st).length,
              }))}
              value={leaveStatus}
              onChange={setLeaveStatus}
            />
            {leaveShown.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>
                {myLeave.length === 0 ? 'No leave or permission requests for this range.' : 'No requests with that status.'}
              </Text>
            ) : (
              leaveShown.map((r) => (
                <Card key={r.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }}>{leaveSummary(r)}</Text>
                    <View style={{ marginLeft: spacing.sm }}>
                      <LeaveStatusBadge status={r.status} />
                    </View>
                  </View>
                  {r.reason ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Reason: {r.reason}</Text> : null}
                  {r.adminRemarks ? <Text style={{ color: colors.text, fontSize: 12 }}>Admin: {r.adminRemarks}</Text> : null}
                  {r.updatedAt ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>Updated {String(r.updatedAt).slice(0, 10)}</Text> : null}
                </Card>
              ))
            )}
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>To ask for leave or permission, use the Attendance tab.</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
