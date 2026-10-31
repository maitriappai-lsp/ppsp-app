// SECTION (Admin, inside Override): DSR approvals.
//
// Gives a facilitator permission to file a DSR for ONE date at ONE beneficiary
// -- for when they couldn't time in, or forgot to file on the day. With an
// active approval the facilitator's DSR screen lets them pick that date and
// beneficiary, and the "today only" and "needs attendance" rules are waived
// for that combination (never for a future date). An approval is used up once
// that DSR is submitted. It can be switched off or deleted before then.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { todayLocalYMD } from '../../utils/date';
import { Card, Field, Select, DateField, PrimaryButton, SectionLabel } from '../../components/UI';
import { IconButton, ListHeader, AddModal } from '../../components/MasterParts';
import { colors, spacing } from '../../theme';

function benLabel(b) {
  return b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--';
}

export default function DsrApprovalSection() {
  const { currentUser } = useAuth();
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const today = todayLocalYMD();

  const [filterResource, setFilterResource] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [resourceId, setResourceId] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [dsrDate, setDsrDate] = useState(today);
  const [reason, setReason] = useState('');

  const resName = (id) => db.resources.find((r) => r.id === id)?.name || '--';
  const facilitators = db.resources.filter((r) => (r.role === 'Facilitator' || r.role === 'Audit Facilitator') && r.active !== false);
  const facilitatorOptions = facilitators.map((r) => ({ value: r.id, label: r.name }));
  const beneficiaryOptions = db.beneficiaries
    .slice()
    .sort((a, b) => benLabel(a).localeCompare(benLabel(b)))
    .map((b) => ({ value: b.id, label: benLabel(b) }));

  // Pending = waiting to be used; In progress = a draft exists; Used = the DSR
  // has been submitted; Inactive = switched off by the admin.
  function statusOf(o) {
    const dsr = db.dsr.find((d) => d.resourceId === o.resourceId && d.dsrDate === o.dsrDate && d.beneficiaryId === o.beneficiaryId);
    if (dsr?.status === 'Submitted') return 'Used';
    if (o.active === false) return 'Inactive';
    return dsr ? 'In progress' : 'Pending';
  }
  const statusColor = { Pending: colors.amber, 'In progress': colors.primary, Used: colors.green, Inactive: colors.textMuted };

  const rows = useMemo(
    () =>
      db.dsrOverrides
        .filter((o) => !filterResource || o.resourceId === filterResource)
        .slice()
        .sort((a, b) => String(b.dsrDate).localeCompare(String(a.dsrDate)) || String(b.grantedAt || '').localeCompare(String(a.grantedAt || ''))),
    [db.dsrOverrides, filterResource]
  );

  function openAdd() {
    setResourceId(filterResource || '');
    setBeneficiaryId('');
    setDsrDate(today);
    setReason('');
    setShowAdd(true);
  }

  async function add() {
    if (!resourceId) return Alert.alert('Missing fields', 'Choose the facilitator.');
    if (!beneficiaryId) return Alert.alert('Missing fields', 'Choose the beneficiary.');
    if (!dsrDate) return Alert.alert('Missing fields', 'Choose the date.');
    if (dsrDate > today) return Alert.alert('Check the date', "An approval can't be for a future date.");
    if (!reason.trim()) return Alert.alert('Missing fields', 'Give a reason for the approval.');
    const existing = db.dsrOverrides.find((o) => o.resourceId === resourceId && o.beneficiaryId === beneficiaryId && o.dsrDate === dsrDate);
    if (existing) {
      return Alert.alert(
        'Already approved',
        existing.active === false
          ? 'There is already an approval for this facilitator, beneficiary and date, but it is switched off. Switch it back on from the list.'
          : 'There is already an approval for this facilitator, beneficiary and date.'
      );
    }
    setSaving(true);
    try {
      await addRecord('dsrOverrides', {
        id: nextId('DOV', 'dsrOverrides'),
        resourceId,
        beneficiaryId,
        dsrDate,
        reason: reason.trim(),
        active: true,
        grantedBy: currentUser?.id,
      });
      setShowAdd(false);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function toggle(o) {
    updateRecord('dsrOverrides', o.id, { active: o.active === false }).catch((e) => Alert.alert('Could not update', e.message || 'Please try again.'));
  }

  function remove(o) {
    Alert.alert('Delete approval', `Remove the approval for ${resName(o.resourceId)} on ${o.dsrDate}? Any DSR they already filed stays.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('dsrOverrides', o.id).catch((e) => Alert.alert('Could not delete', e.message || 'Please try again.')) },
    ]);
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
        Let a facilitator file a DSR for a date, at a beneficiary, where they couldn't time in or missed the day. They pick that date on their DSR screen.
        An approval is used up once their DSR is submitted.
      </Text>

      <ListHeader title="DSR approvals" count={db.dsrOverrides.length} onAdd={openAdd} addLabel="Give approval" />
      <Select value={filterResource} onSelect={setFilterResource} options={[{ value: '', label: 'All facilitators' }, ...facilitatorOptions]} />

      <AddModal visible={showAdd} title="Give DSR approval" onClose={() => setShowAdd(false)}>
        <SectionLabel>Facilitator</SectionLabel>
        <Select value={resourceId} onSelect={setResourceId} options={facilitatorOptions} placeholder="Choose facilitator..." />
        <SectionLabel>Beneficiary</SectionLabel>
        <Select value={beneficiaryId} onSelect={setBeneficiaryId} options={beneficiaryOptions} placeholder="Choose beneficiary..." />
        <DateField label="DSR date (today or earlier)" value={dsrDate} onChange={setDsrDate} />
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Phone had no signal, couldn't time in" multiline />
        <PrimaryButton title={saving ? 'Saving...' : 'Give approval'} onPress={add} disabled={saving} />
      </AddModal>

      {rows.length === 0 && <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>No approvals yet. Tap + to give one.</Text>}

      {rows.map((o) => {
        const status = statusOf(o);
        return (
          <Card key={o.id} style={status === 'Inactive' ? { opacity: 0.6 } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{resName(o.resourceId)}</Text>
                  <Text style={{ color: statusColor[status], fontWeight: '800', fontSize: 11, marginLeft: spacing.sm }}>{status.toUpperCase()}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {o.dsrDate} - {benLabel(db.beneficiaries.find((b) => b.id === o.beneficiaryId))}
                </Text>
                <Text style={{ color: colors.text, fontSize: 12 }}>Reason: {o.reason}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  Given by {resName(o.grantedBy)}
                  {o.grantedAt ? ` on ${String(o.grantedAt).slice(0, 10)}` : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                {status !== 'Used' && (
                  <IconButton
                    name={o.active === false ? 'play-circle-outline' : 'pause-circle-outline'}
                    color={o.active === false ? colors.green : colors.amber}
                    label={o.active === false ? 'Switch on' : 'Switch off'}
                    onPress={() => toggle(o)}
                  />
                )}
                <IconButton name="trash-outline" color={colors.red} label="Delete" onPress={() => remove(o)} />
              </View>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
