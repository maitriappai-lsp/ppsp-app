// Shared pieces for Leave and Permission requests, used by the facilitator's
// Update > Leave section and the Admin's Leave screen: the form fields, the
// checks, a one-line summary, and the coloured status badge.
//
// A request is either
//   Leave       -- from a date to a date (whole days), or
//   Permission  -- on one date, from a time to a time.
import React from 'react';
import { Text, View } from 'react-native';
import { Chip, DateField, Field, Select, SectionLabel, TimeField } from './UI';
import { colors, spacing } from '../theme';

export const STATUSES = ['Pending', 'Approved', 'Rejected'];
export const STATUS_COLORS = { Pending: colors.amber, Approved: colors.green, Rejected: colors.red };

export const emptyLeave = (resourceId = '') => ({
  resourceId,
  requestType: 'Leave',
  leaveFrom: '',
  leaveTo: '',
  permissionDate: '',
  permissionFrom: '',
  permissionTo: '',
  reason: '',
  status: 'Pending',
  adminRemarks: '',
});

// Form values from a saved request (for editing).
export function leaveFromRecord(r) {
  return {
    resourceId: r.resourceId || '',
    requestType: r.requestType || 'Leave',
    leaveFrom: r.leaveFrom || '',
    leaveTo: r.leaveTo || '',
    permissionDate: r.permissionDate || '',
    permissionFrom: r.permissionFrom || '',
    permissionTo: r.permissionTo || '',
    reason: r.reason || '',
    status: r.status || 'Pending',
    adminRemarks: r.adminRemarks || '',
  };
}

// The fields to send for a request (the other kind's fields are blanked).
export function leavePayload(v) {
  const leave = v.requestType === 'Leave';
  return {
    requestType: v.requestType,
    leaveFrom: leave ? v.leaveFrom : '',
    leaveTo: leave ? v.leaveTo : '',
    permissionDate: leave ? '' : v.permissionDate,
    permissionFrom: leave ? '' : v.permissionFrom,
    permissionTo: leave ? '' : v.permissionTo,
    reason: v.reason.trim(),
  };
}

function minutes(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(String(t || ''));
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3] && m[3].toLowerCase();
  if (ap === 'pm' && h !== 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

// Returns a message if the form isn't ready to save, else null.
export function validateLeaveForm(v, { needResource = false } = {}) {
  if (needResource && !v.resourceId) return 'Choose the resource.';
  if (v.requestType === 'Leave') {
    if (!v.leaveFrom || !v.leaveTo) return 'Choose the leave from and to dates.';
    if (v.leaveTo < v.leaveFrom) return "The leave to date can't be before the from date.";
    return null;
  }
  if (!v.permissionDate) return 'Choose the permission date.';
  if (!v.permissionFrom || !v.permissionTo) return 'Choose the permission from and to times.';
  const a = minutes(v.permissionFrom);
  const b = minutes(v.permissionTo);
  if (a === null || b === null) return 'Enter the times like 10:30.';
  if (b <= a) return 'The permission end time must be after the start time.';
  return null;
}

// "Leave: 2026-10-30 to 2026-11-01" / "Permission: 2026-10-30, 10:00 to 11:30"
export function leaveSummary(r) {
  return r.requestType === 'Leave'
    ? `Leave: ${r.leaveFrom} to ${r.leaveTo}`
    : `Permission: ${r.permissionDate}, ${r.permissionFrom} to ${r.permissionTo}`;
}

export function LeaveStatusBadge({ status }) {
  return <Text style={{ color: STATUS_COLORS[status] || colors.textMuted, fontWeight: '800', fontSize: 11 }}>{String(status || '').toUpperCase()}</Text>;
}

// The form. `value` is the object above; `onChange(patch)` merges changes.
// Admin screens also ask for the resource and the status / remarks.
export function LeaveFields({ value, onChange, showResource = false, resourceOptions = [], showStatus = false }) {
  const set = (patch) => onChange(patch);
  return (
    <View>
      {showResource && (
        <>
          <SectionLabel>Resource</SectionLabel>
          <Select value={value.resourceId} onSelect={(v) => set({ resourceId: v })} options={resourceOptions} placeholder="Choose resource..." />
        </>
      )}

      <SectionLabel>Request for</SectionLabel>
      <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
        <Chip label="Leave" active={value.requestType === 'Leave'} onPress={() => set({ requestType: 'Leave' })} />
        <Chip label="Permission" active={value.requestType === 'Permission'} onPress={() => set({ requestType: 'Permission' })} />
      </View>

      {value.requestType === 'Leave' ? (
        <>
          <DateField label="Leave from" value={value.leaveFrom} onChange={(v) => set({ leaveFrom: v, leaveTo: value.leaveTo && value.leaveTo < v ? v : value.leaveTo })} />
          <DateField label="Leave to" value={value.leaveTo} onChange={(v) => set({ leaveTo: v })} />
        </>
      ) : (
        <>
          <DateField label="Permission date" value={value.permissionDate} onChange={(v) => set({ permissionDate: v })} />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <TimeField label="From time" value={value.permissionFrom} onChange={(v) => set({ permissionFrom: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField label="To time" value={value.permissionTo} onChange={(v) => set({ permissionTo: v })} />
            </View>
          </View>
        </>
      )}

      <Field label="Reason (optional)" value={value.reason} onChangeText={(v) => set({ reason: v })} multiline />

      {showStatus && (
        <>
          <SectionLabel>Status</SectionLabel>
          <Select value={value.status} onSelect={(v) => set({ status: v })} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Field label="Admin remarks (optional)" value={value.adminRemarks} onChangeText={(v) => set({ adminRemarks: v })} multiline />
        </>
      )}
    </View>
  );
}
