// The Admin dashboard's EXCEPTIONS -- things the Admin should look at. These are
// plain functions over the loaded data, so they are easy to check. Each takes the
// records already narrowed to the dashboard's date range / resource / beneficiary.
//
//   ragExceptions    DSRs whose Stock, Book or Overall rating is Red or Amber
//   attendanceNoDsr  days someone timed in at a beneficiary but filed no DSR there
//   lateOrEarly      arriving late or leaving early, against the beneficiary's
//                    opening / closing times (Allocations), with a grace period
//   nonAssigned      timing in at a beneficiary that isn't the one they're assigned to
//   auditChanges     beneficiaries whose latest audit rated some category
//                    differently from the visit before it (up = improved, down = worse)
//
// Only SUBMITTED DSRs and audits are counted; a draft isn't a finished report.

export const GRACE_MINUTES = 10; // for arriving late / leaving early

// "10:30" / "9:30 AM" -> minutes since midnight, or null
export function toMinutes(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(String(t || ''));
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3] && m[3].toLowerCase();
  if (ap === 'pm' && h !== 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

const byDateDesc = (x, y) => String(y.date).localeCompare(String(x.date));

// ---- 1. Stock / Book / Overall Red and Amber ------------------------------
export function ragExceptions(dsrs) {
  const submitted = dsrs.filter((d) => d.status === 'Submitted');
  const pick = (field, rag) => submitted.filter((d) => d[field] === rag).sort((a, b) => String(b.dsrDate).localeCompare(String(a.dsrDate)));
  const both = (field) => ({ Red: pick(field, 'Red'), Amber: pick(field, 'Amber') });
  return { stock: both('stockRag'), book: both('bookRag'), overall: both('overallRag') };
}

// ---- 2. Attendance but no DSR ----------------------------------------------
// `allDsrs` should be ALL DSRs (not narrowed), so a DSR filed for the same
// resource, day and beneficiary is always found.
export function attendanceNoDsr(attendance, allDsrs) {
  const filed = new Set(allDsrs.filter((d) => d.status === 'Submitted').map((d) => `${d.resourceId}|${d.dsrDate}|${d.beneficiaryId}`));
  const seen = new Set();
  const out = [];
  attendance.forEach((a) => {
    const key = `${a.facilitatorId}|${a.date}|${a.beneficiaryId}`;
    if (filed.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push({ key, date: a.date, resourceId: a.facilitatorId, beneficiaryId: a.beneficiaryId });
  });
  return out.sort(byDateDesc);
}

// The allocation that tells us a resource's opening / closing times at a
// beneficiary on a date: theirs, at that beneficiary, started on or before the
// date; an active one wins, otherwise the most recently started.
function allocationFor(allocations, resourceId, beneficiaryId, date) {
  const mine = allocations.filter(
    (al) => al.beneficiaryId === beneficiaryId && (al.resource1Id === resourceId || al.resource2Id === resourceId) && (!al.fromDate || al.fromDate <= date)
  );
  mine.sort((x, y) => Number(y.active !== false) - Number(x.active !== false) || String(y.fromDate).localeCompare(String(x.fromDate)));
  return mine[0] || null;
}

// ---- 3. Arriving late or leaving early ---------------------------------------
export function lateOrEarly(attendance, allocations, grace = GRACE_MINUTES) {
  const out = [];
  attendance.forEach((a) => {
    const al = allocationFor(allocations, a.facilitatorId, a.beneficiaryId, a.date);
    if (!al) return; // no opening / closing times to compare with
    const opens = toMinutes(al.opensAt);
    const closes = toMinutes(al.closesAt);
    const tin = toMinutes(a.timeIn);
    const tout = toMinutes(a.timeOut);
    const lateBy = opens !== null && tin !== null && tin > opens + grace ? tin - opens : 0;
    const earlyBy = closes !== null && tout !== null && tout < closes - grace ? closes - tout : 0;
    if (!lateBy && !earlyBy) return;
    out.push({
      key: a.id,
      date: a.date,
      resourceId: a.facilitatorId,
      beneficiaryId: a.beneficiaryId,
      kind: lateBy && earlyBy ? 'Late and early' : lateBy ? 'Late' : 'Early',
      expectedIn: al.opensAt,
      actualIn: a.timeIn,
      lateBy,
      expectedOut: al.closesAt,
      actualOut: a.timeOut,
      earlyBy,
    });
  });
  return out.sort(byDateDesc);
}

// ---- 4. Timed in at a beneficiary they aren't assigned to -------------------
// Assigned = the beneficiaries of their active allocations that had started by that date.
export function nonAssigned(attendance, allocations) {
  const out = [];
  attendance.forEach((a) => {
    const assigned = allocations
      .filter((al) => al.active !== false && (al.resource1Id === a.facilitatorId || al.resource2Id === a.facilitatorId) && (!al.fromDate || al.fromDate <= a.date))
      .map((al) => al.beneficiaryId);
    if (assigned.includes(a.beneficiaryId)) return;
    out.push({ key: a.id, date: a.date, resourceId: a.facilitatorId, assignedBeneficiaryIds: [...new Set(assigned)], loggedBeneficiaryId: a.beneficiaryId });
  });
  return out.sort(byDateDesc);
}

// ---- 5. Audit rating changes between the latest two visits ---------------------
// For each beneficiary with at least two submitted audits: compare the latest with
// the one before it, category by category, where BOTH were rated. Returns the
// beneficiaries with at least one change.
export function auditChanges(audits, details, categories) {
  const byBeneficiary = {};
  audits
    .filter((a) => a.status === 'Submitted' && a.beneficiaryId)
    .forEach((a) => (byBeneficiary[a.beneficiaryId] = byBeneficiary[a.beneficiaryId] || []).push(a));

  const ratingsOf = (auditId) => {
    const map = {};
    details.filter((d) => d.auditId === auditId && d.rating).forEach((d) => (map[d.categoryNo] = Number(d.rating)));
    return map;
  };
  const describe = (no) => categories.find((c) => c.id === no)?.description || '';
  const sortKey = (no) => categories.find((c) => c.id === no)?.sortOrder ?? 0;

  const out = [];
  Object.entries(byBeneficiary).forEach(([beneficiaryId, list]) => {
    list.sort((x, y) => String(y.auditDate).localeCompare(String(x.auditDate)) || (y.visitNumber || 0) - (x.visitNumber || 0));
    if (list.length < 2) return;
    const [latest, previous] = list;
    const nowRatings = ratingsOf(latest.id);
    const beforeRatings = ratingsOf(previous.id);
    const changes = Object.keys(nowRatings)
      .filter((no) => beforeRatings[no] !== undefined && beforeRatings[no] !== nowRatings[no])
      .map((no) => ({
        categoryNo: no,
        description: describe(no),
        latestRating: nowRatings[no],
        previousRating: beforeRatings[no],
        delta: nowRatings[no] - beforeRatings[no],
      }))
      .sort((x, y) => sortKey(x.categoryNo) - sortKey(y.categoryNo));
    if (changes.length) out.push({ beneficiaryId, latest, previous, changes });
  });
  return out.sort((x, y) => String(y.latest.auditDate).localeCompare(String(x.latest.auditDate)));
}

// ---- all five together, and a flat list for exporting ---------------------------

// `attendance` and `dsrs` are already narrowed to the dashboard's filters;
// `allDsrs` is every DSR (to find the one that makes an attendance "covered").
export function computeExceptions({ attendance, dsrs, allDsrs, allocations, auditChangeList }) {
  return {
    rag: ragExceptions(dsrs),
    noDsr: attendanceNoDsr(attendance, allDsrs),
    lateEarly: lateOrEarly(attendance, allocations),
    nonAssigned: nonAssigned(attendance, allocations),
    auditChanges: auditChangeList,
  };
}

// One row per exception, for a CSV: [Exception, Date, Resource, Beneficiary, Details].
// `names` = { resource: (id) => name, beneficiary: (id) => label }.
export function exceptionRows(result, names) {
  const rows = [['Exception', 'Date', 'Resource', 'Beneficiary', 'Details']];
  const labels = { stock: 'Stock', book: 'Book', overall: 'Overall' };
  ['stock', 'book', 'overall'].forEach((kind) =>
    ['Red', 'Amber'].forEach((rag) =>
      result.rag[kind][rag].forEach((d) => rows.push([`${labels[kind]} ${rag}`, d.dsrDate, names.resource(d.resourceId), names.beneficiary(d.beneficiaryId), d.remarks || d.stockRemarks || ''])),
    ),
  );
  result.noDsr.forEach((x) => rows.push(['Attendance but no DSR', x.date, names.resource(x.resourceId), names.beneficiary(x.beneficiaryId), '']));
  result.lateEarly.forEach((x) => {
    const parts = [];
    if (x.lateBy) parts.push(`late by ${x.lateBy} min (expected ${x.expectedIn}, in ${x.actualIn})`);
    if (x.earlyBy) parts.push(`left ${x.earlyBy} min early (expected ${x.expectedOut}, out ${x.actualOut})`);
    rows.push([x.kind, x.date, names.resource(x.resourceId), names.beneficiary(x.beneficiaryId), parts.join('; ')]);
  });
  result.nonAssigned.forEach((x) =>
    rows.push([
      'Signed in at non-assigned beneficiary',
      x.date,
      names.resource(x.resourceId),
      names.beneficiary(x.loggedBeneficiaryId),
      `assigned: ${x.assignedBeneficiaryIds.map(names.beneficiary).join(', ') || 'none'}`,
    ]),
  );
  result.auditChanges.forEach((c) =>
    c.changes.forEach((ch) =>
      rows.push([
        'Audit rating change',
        c.latest.auditDate,
        '',
        names.beneficiary(c.beneficiaryId),
        `${ch.categoryNo} ${ch.description}: ${ch.previousRating} -> ${ch.latestRating} (${ch.delta > 0 ? 'improved' : 'declined'}; previous visit ${c.previous.auditDate})`,
      ]),
    ),
  );
  return rows;
}
