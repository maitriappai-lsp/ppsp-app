// SECTION (Facilitator): Leave and permission -- the facilitator's own requests.
// Shown on the Attendance screen, beside the check-in.
//
// A request is raised as Pending; the Admin approves or rejects it (the admin's
// side is screens/admin/LeaveAdminScreen.js). While a request is still Pending
// it can be edited or withdrawn; once decided it is read-only.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { Card, Chip, PrimaryButton } from '../../components/UI';
import { IconButton, ListHeader, AddModal } from '../../components/MasterParts';
import { LeaveFields, LeaveStatusBadge, emptyLeave, leaveFromRecord, leavePayload, leaveSummary, validateLeaveForm } from '../../components/LeaveParts';
import { colors, spacing } from '../../theme';

function failed(title, e) {
  Alert.alert(title, e?.message || 'Please try again.');
}

export default function LeaveSection() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const { currentUser } = useAuth();
  const me = currentUser?.id;

  const [statusFilter, setStatusFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyLeave(me));
  const [saving, setSaving] = useState(false);

  const startOf = (r) => r.leaveFrom || r.permissionDate || '';
  const mine = useMemo(
    () => db.leaveRequests.filter((r) => r.resourceId === me).sort((a, b) => startOf(b).localeCompare(startOf(a))),
    [db.leaveRequests, me]
  );
  const shown = statusFilter === 'All' ? mine : mine.filter((r) => r.status === statusFilter);
  const countOf = (s) => mine.filter((r) => r.status === s).length;

  function openAdd() {
    setEditingId(null);
    setForm(emptyLeave(me));
    setShowForm(true);
  }

  function openEdit(r) {
    setEditingId(r.id);
    setForm(leaveFromRecord(r));
    setShowForm(true);
  }

  async function save() {
    const problem = validateLeaveForm(form);
    if (problem) return Alert.alert('Check the request', problem);
    setSaving(true);
    try {
      if (editingId) {
        await updateRecord('leaveRequests', editingId, leavePayload(form));
      } else {
        await addRecord('leaveRequests', { id: nextId('LVP', 'leaveRequests'), resourceId: me, status: 'Pending', ...leavePayload(form) });
      }
      setShowForm(false);
    } catch (e) {
      failed(editingId ? 'Could not save' : 'Could not send the request', e);
    } finally {
      setSaving(false);
    }
  }

  function withdraw(r) {
    Alert.alert('Withdraw request', `Withdraw this request?\n${leaveSummary(r)}`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => deleteRecord('leaveRequests', r.id).catch((e) => failed('Could not withdraw', e)) },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ListHeader title="Leave and permission" count={mine.length} onAdd={openAdd} addLabel="New request" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm }}>
          <Chip label="All" active={statusFilter === 'All'} onPress={() => setStatusFilter('All')} />
          {['Pending', 'Approved', 'Rejected'].map((s) => (
            <Chip key={s} label={`${s} (${countOf(s)})`} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
          ))}
        </View>

        <AddModal visible={showForm} title={editingId ? 'Edit request' : 'New request'} onClose={() => setShowForm(false)}>
          <LeaveFields value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
          <PrimaryButton title={saving ? 'Saving...' : editingId ? 'Save changes' : 'Send request'} onPress={save} disabled={saving} />
        </AddModal>

        {shown.length === 0 && (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            {mine.length === 0 ? 'No requests yet. Tap + to ask for leave or permission.' : 'No requests with that status.'}
          </Text>
        )}

        {shown.map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }}>{leaveSummary(r)}</Text>
                  <View style={{ marginLeft: spacing.sm }}>
                    <LeaveStatusBadge status={r.status} />
                  </View>
                </View>
                {r.reason ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Reason: {r.reason}</Text> : null}
                {r.adminRemarks ? <Text style={{ color: colors.text, fontSize: 12 }}>Admin: {r.adminRemarks}</Text> : null}
                {r.updatedAt ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>Updated {String(r.updatedAt).slice(0, 10)}</Text> : null}
              </View>
              {r.status === 'Pending' && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => openEdit(r)} />
                  <IconButton name="trash-outline" color={colors.red} label="Withdraw" onPress={() => withdraw(r)} />
                </View>
              )}
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

