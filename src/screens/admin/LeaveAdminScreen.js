// SCREEN (Admin): Leave and permission requests.
//
// Facilitators raise requests from Update > Leave. Here the Admin sees them all
// (Pending first, with a count on the tab), approves or rejects each one -- with
// optional remarks the facilitator can read -- and can also raise a request ON
// A RESOURCE'S BEHALF, edit any request, or delete it. The server records who
// changed each request and when.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { Screen, Card, Chip, Field, Select, DateField, PrimaryButton, SecondaryButton } from '../../components/UI';
import { IconButton, ListHeader, AddModal } from '../../components/MasterParts';
import { LeaveFields, LeaveStatusBadge, emptyLeave, leaveFromRecord, leavePayload, leaveSummary, validateLeaveForm } from '../../components/LeaveParts';
import { colors, spacing } from '../../theme';

const FILTERS = ['Pending', 'Approved', 'Rejected', 'All'];

export default function LeaveAdminScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();

  const [statusFilter, setStatusFilter] = useState('Pending');
  const [resourceFilter, setResourceFilter] = useState('');
  // Optional date range: shows requests whose leave days (or permission date) fall within it.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyLeave());
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState(null); // { request, status }
  const [remarks, setRemarks] = useState('');

  const resName = (id) => db.resources.find((r) => r.id === id)?.name || '--';
  const resourceOptions = db.resources
    .filter((r) => r.active !== false)
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((r) => ({ value: r.id, label: `${r.name}${r.role ? ' (' + r.role + ')' : ''}` }));

  const startOf = (r) => r.leaveFrom || r.permissionDate || '';
  // A request is in the date range if any of its days overlap it: a leave from
  // 28 Oct to 2 Nov shows for a "1 Nov to 5 Nov" filter, a permission shows on its date.
  const inRange = (r) => {
    const start = (r.requestType === 'Leave' ? r.leaveFrom : r.permissionDate) || '';
    const end = (r.requestType === 'Leave' ? r.leaveTo : r.permissionDate) || '';
    if (fromDate && end < fromDate) return false;
    if (toDate && start > toDate) return false;
    return true;
  };
  const inScope = useMemo(
    () => db.leaveRequests.filter((r) => (!resourceFilter || r.resourceId === resourceFilter) && inRange(r)),
    [db.leaveRequests, resourceFilter, fromDate, toDate] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const countOf = (s) => (s === 'All' ? inScope.length : inScope.filter((r) => r.status === s).length);
  const rows = useMemo(
    () =>
      inScope
        .filter((r) => statusFilter === 'All' || r.status === statusFilter)
        .slice()
        .sort((a, b) => startOf(b).localeCompare(startOf(a))),
    [inScope, statusFilter]
  );

  function openAdd() {
    setEditingId(null);
    setForm(emptyLeave(resourceFilter));
    setShowForm(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setForm(leaveFromRecord(r));
    setShowForm(true);
  }

  async function save() {
    const problem = validateLeaveForm(form, { needResource: true });
    if (problem) return Alert.alert('Check the request', problem);
    setSaving(true);
    try {
      const fields = { ...leavePayload(form), resourceId: form.resourceId, status: form.status, adminRemarks: form.adminRemarks.trim() };
      if (editingId) await updateRecord('leaveRequests', editingId, fields);
      else await addRecord('leaveRequests', { id: nextId('LVP', 'leaveRequests'), ...fields });
      setShowForm(false);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function openDecision(request, status) {
    setDecision({ request, status });
    setRemarks(request.adminRemarks || '');
  }

  async function confirmDecision() {
    setSaving(true);
    try {
      await updateRecord('leaveRequests', decision.request.id, { status: decision.status, adminRemarks: remarks.trim() });
      setDecision(null);
    } catch (e) {
      Alert.alert('Could not update', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function remove(r) {
    Alert.alert('Delete request', `Delete this request for ${resName(r.resourceId)}?\n${leaveSummary(r)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('leaveRequests', r.id).catch((e) => Alert.alert('Could not delete', e.message || 'Please try again.')) },
    ]);
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>Leave and permission</Text>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <ListHeader title="Requests" count={db.leaveRequests.length} onAdd={openAdd} addLabel="Request on behalf" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs }}>
          {FILTERS.map((s) => (
            <Chip key={s} label={`${s} (${countOf(s)})`} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
          ))}
        </View>
        <Select value={resourceFilter} onSelect={setResourceFilter} options={[{ value: '', label: 'All resources' }, ...resourceOptions]} />

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateField
              label="From date"
              value={fromDate}
              onChange={(v) => {
                setFromDate(v);
                if (toDate && toDate < v) setToDate(v);
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="To date"
              value={toDate}
              onChange={(v) => {
                setToDate(v);
                if (fromDate && fromDate > v) setFromDate(v);
              }}
            />
          </View>
        </View>
        {(fromDate || toDate) && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>Showing requests that fall within these dates.</Text>
            <TouchableOpacity
              onPress={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Clear dates</Text>
            </TouchableOpacity>
          </View>
        )}

        <AddModal visible={showForm} title={editingId ? 'Edit request' : 'Request on behalf'} onClose={() => setShowForm(false)}>
          <LeaveFields
            value={form}
            onChange={(p) => setForm((f) => ({ ...f, ...p }))}
            showResource
            resourceOptions={resourceOptions}
            showStatus
          />
          <PrimaryButton title={saving ? 'Saving...' : editingId ? 'Save changes' : 'Save request'} onPress={save} disabled={saving} />
        </AddModal>

        <AddModal
          visible={!!decision}
          title={decision ? `${decision.status === 'Approved' ? 'Approve' : 'Reject'} request` : ''}
          onClose={() => setDecision(null)}
        >
          {decision && (
            <>
              <Text style={{ fontWeight: '700', color: colors.text }}>{resName(decision.request.resourceId)}</Text>
              <Text style={{ color: colors.textMuted, marginBottom: spacing.sm }}>{leaveSummary(decision.request)}</Text>
              {decision.request.reason ? <Text style={{ color: colors.text, fontSize: 12, marginBottom: spacing.sm }}>Reason: {decision.request.reason}</Text> : null}
              <Field
                label={decision.status === 'Rejected' ? 'Reason for rejecting (optional)' : 'Remarks (optional)'}
                value={remarks}
                onChangeText={setRemarks}
                multiline
              />
              <PrimaryButton
                title={saving ? 'Saving...' : decision.status === 'Approved' ? 'Approve' : 'Reject'}
                onPress={confirmDecision}
                disabled={saving}
              />
            </>
          )}
        </AddModal>

        {rows.length === 0 && (
          <Text style={{ color: colors.textMuted, marginVertical: spacing.md }}>
            {db.leaveRequests.length === 0 ? 'No requests yet.' : `No ${statusFilter === 'All' ? '' : statusFilter.toLowerCase() + ' '}requests${fromDate || toDate || resourceFilter ? ' for these filters' : ' here'}.`}
          </Text>
        )}

        {rows.map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{resName(r.resourceId)}</Text>
                  <View style={{ marginLeft: spacing.sm }}>
                    <LeaveStatusBadge status={r.status} />
                  </View>
                </View>
                <Text style={{ color: colors.text, fontSize: 13 }}>{leaveSummary(r)}</Text>
                {r.reason ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Reason: {r.reason}</Text> : null}
                {r.adminRemarks ? <Text style={{ color: colors.text, fontSize: 12 }}>Admin: {r.adminRemarks}</Text> : null}
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  Updated {String(r.updatedAt || '').slice(0, 10)} by {r.updatedBy ? resName(r.updatedBy) : '--'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => openEdit(r)} />
                <IconButton name="trash-outline" color={colors.red} label="Delete" onPress={() => remove(r)} />
              </View>
            </View>

            {r.status === 'Pending' ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Approve" onPress={() => openDecision(r, 'Approved')} />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton title="Reject" onPress={() => openDecision(r, 'Rejected')} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                <SecondaryButton title="Change decision" onPress={() => openDecision(r, r.status === 'Approved' ? 'Rejected' : 'Approved')} />
              </View>
            )}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
