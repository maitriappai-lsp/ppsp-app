// SCREEN 5 (Admin): Dashboard.
// Same shape as the Facilitator dashboard, plus a facilitator filter (view
// one facilitator's activity or all pooled together) and Edit/Delete rights
// on any attendance/upload record from the drill-down. (PPSP has no Sessions
// or Schedule; the DSR, stock, student, book and audit tabs are added next.)
// Row actions (edit / delete / view) are compact icons.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useData } from '../../data/store';
import { apiGet } from '../../data/api';
import { Screen, Card, Field, Chip, PrimaryButton, SecondaryButton, Select, DateField, TimeField } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { todayLocalYMD } from '../../utils/date';

const TABS = ['Overview', 'Attendance', 'Uploads'];

// Small tappable icon used in record rows (edit / delete / view).
function IconButton({ name, color, label, onPress, size = 22 }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={{ padding: 6 }}
    >
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

export default function AdminDashboardScreen() {
  const { db, deleteRecord, updateRecord } = useData();
  const [tab, setTab] = useState('Overview');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState(todayLocalYMD());
  const [facilitatorId, setFacilitatorId] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const [editingAttendanceId, setEditingAttendanceId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [editBeneficiaryId, setEditBeneficiaryId] = useState(null);
  const [editGeoVerified, setEditGeoVerified] = useState('true');
  const [savingAttendance, setSavingAttendance] = useState(false);

  function startEditAttendance(a) {
    setEditingAttendanceId(a.id);
    setEditDate(a.date || '');
    setEditTimeIn(a.timeIn || '');
    setEditTimeOut(a.timeOut || '');
    setEditBeneficiaryId(a.beneficiaryId);
    setEditGeoVerified(a.geoVerified ? 'true' : 'false');
  }

  function cancelEditAttendance() {
    setEditingAttendanceId(null);
  }

  async function saveEditAttendance() {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(editDate)) {
      return Alert.alert('Invalid date', 'Date should be in YYYY-MM-DD format, e.g. 2026-09-19.');
    }
    if (editDate > todayLocalYMD()) {
      return Alert.alert('Date is in the future', 'Attendance can only be dated today or earlier.');
    }
    setSavingAttendance(true);
    try {
      await updateRecord('attendance', editingAttendanceId, {
        date: editDate,
        timeIn: editTimeIn,
        timeOut: editTimeOut,
        beneficiaryId: editBeneficiaryId,
        geoVerified: editGeoVerified === 'true',
      });
      setEditingAttendanceId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingAttendance(false);
    }
  }

  const facilitators = db.resources.filter((r) => r.role === 'Facilitator');

  const q = query.trim().toLowerCase();

  const attendance = useMemo(
    () =>
      db.attendance
        .filter((a) => (facilitatorId === 'all' ? true : a.facilitatorId === facilitatorId))
        .filter((a) => a.date >= from && a.date <= to)
        .filter((a) => {
          if (!q) return true;
          const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
          const f = db.resources.find((x) => x.id === a.facilitatorId);
          return `${b?.school} ${b?.class} ${b?.section} ${f?.name} ${a.date}`.toLowerCase().includes(q);
        }),
    [db, facilitatorId, from, to, q]
  );

  const uploads = db.uploads
    .filter((u) => (facilitatorId === 'all' ? true : u.facilitatorId === facilitatorId) && u.date >= from && u.date <= to)
    .filter((u) => {
      if (!q) return true;
      const b = db.beneficiaries.find((x) => x.id === u.beneficiaryId);
      const f = db.resources.find((x) => x.id === u.facilitatorId);
      return `${u.fileName} ${u.description} ${b?.school} ${f?.name}`.toLowerCase().includes(q);
    });

  const [exporting, setExporting] = useState(false);

  async function exportToExcel() {
    const exportType = tab === 'Uploads' ? 'uploads' : 'attendance';
    setExporting(true);
    try {
      const params = new URLSearchParams({ from, to, facilitatorId });
      const { filename, base64 } = await apiGet(`/api/export/${exportType}?${params.toString()}`);
      const fileUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: filename,
        });
      } else {
        Alert.alert('Saved', `File saved to ${fileUri}, but sharing isn't available on this device.`);
      }
    } catch (e) {
      Alert.alert('Export failed', e.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const summary = useMemo(
    () => ({
      daysPresent: new Set(attendance.map((a) => a.date)).size,
      attendanceRecords: attendance.length,
      fileUploads: uploads.length,
    }),
    [attendance, uploads]
  );

  // Overview: how many attendance records each resource has in the range.
  const attendanceByResource = useMemo(() => {
    const counts = {};
    attendance.forEach((a) => {
      const name = db.resources.find((x) => x.id === a.facilitatorId)?.name || 'Unknown';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).sort((x, y) => y[1] - x[1]);
  }, [attendance, db.resources]);

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        Programme overview
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={setFrom} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={setTo} />
        </View>
      </View>

      <Select
        label="Facilitator"
        value={facilitatorId}
        onSelect={setFacilitatorId}
        options={[{ value: 'all', label: 'All resources' }, ...facilitators.map((f) => ({ value: f.id, label: f.name }))]}
      />

      <Card style={{ paddingVertical: spacing.sm }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.daysPresent}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Days</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.attendanceRecords}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Attend</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.fileUploads}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Files</Text>
          </View>
        </View>
      </Card>

      <Field
        label="Search beneficiary, resource or file"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. Canal road, Divya, photo"
      />

      <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
        {TABS.map((t) => (
          <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />
        ))}
      </View>

      <SecondaryButton
        title={exporting ? 'Exporting...' : `Export ${tab === 'Uploads' ? 'uploads' : 'attendance'} to Excel`}
        onPress={exportToExcel}
        disabled={exporting}
        style={{ marginBottom: spacing.md }}
      />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'Overview' && (
          <Card>
            <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
              Attendance by resource ({attendance.length} record{attendance.length === 1 ? '' : 's'})
            </Text>
            {attendanceByResource.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No attendance records for this range.</Text>
            ) : (
              attendanceByResource.map(([name, count]) => (
                <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                  <Text style={{ color: colors.textMuted }}>{name}</Text>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{count}</Text>
                </View>
              ))
            )}
          </Card>
        )}

        {tab === 'Uploads' &&
          uploads.map((u) => {
            const b = db.beneficiaries.find((x) => x.id === u.beneficiaryId);
            const f = db.resources.find((x) => x.id === u.facilitatorId);
            return (
              <Card key={u.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {f?.name} - {b?.school} - {u.date}
                    </Text>
                  </View>
                  {u.fileUrl ? (
                    <IconButton
                      name="open-outline"
                      color={colors.primary}
                      label="View"
                      onPress={() => Linking.openURL(u.fileUrl)}
                    />
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>No file</Text>
                  )}
                </View>
              </Card>
            );
          })}

        {tab === 'Attendance' &&
          (attendance.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No attendance records for this range.</Text>
          ) : (
            attendance
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((a) => {
                const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
                const f = db.resources.find((x) => x.id === a.facilitatorId);

                if (editingAttendanceId === a.id) {
                  return (
                    <Card key={a.id}>
                      <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
                        Editing attendance -- {f?.name}
                      </Text>
                      <DateField label="Date" value={editDate} onChange={setEditDate} maximumDate={new Date()} />
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <TimeField
                            label="Time in"
                            value={editTimeIn}
                            onChange={setEditTimeIn}
                            blockFutureOn={editDate === todayLocalYMD() ? editDate : undefined}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TimeField
                            label="Time out"
                            value={editTimeOut}
                            onChange={setEditTimeOut}
                            blockFutureOn={editDate === todayLocalYMD() ? editDate : undefined}
                          />
                        </View>
                      </View>
                      <Select
                        label="Beneficiary"
                        value={editBeneficiaryId}
                        onSelect={setEditBeneficiaryId}
                        options={db.beneficiaries.map((x) => ({
                          value: x.id,
                          label: `${x.school} - ${x.class}${x.section ? ' ' + x.section : ''}`,
                        }))}
                      />
                      <Select
                        label="Geofence verified"
                        value={editGeoVerified}
                        onSelect={setEditGeoVerified}
                        options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton
                            title={savingAttendance ? 'Saving...' : 'Save'}
                            onPress={saveEditAttendance}
                            disabled={savingAttendance}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <SecondaryButton title="Cancel" onPress={cancelEditAttendance} />
                        </View>
                      </View>
                    </Card>
                  );
                }

                return (
                  <Card key={a.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{f?.name}</Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {a.date} - {b?.school} {b?.class} {b?.section}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      Time in: {a.timeIn || '--'}   Time out: {a.timeOut || '--'}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, marginRight: spacing.sm }}>
                        {a.geoVerified ? 'Geofence verified' : 'Not geofence-verified'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <IconButton
                          name="create-outline"
                          color={colors.primary}
                          label="Edit"
                          size={20}
                          onPress={() => startEditAttendance(a)}
                        />
                        <IconButton
                          name="trash-outline"
                          color={colors.red}
                          label="Delete"
                          size={20}
                          onPress={() => {
                            Alert.alert('Delete record', 'Remove this attendance record?', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('attendance', a.id) },
                            ]);
                          }}
                        />
                      </View>
                    </View>
                  </Card>
                );
              })
          ))}
      </ScrollView>
    </Screen>
  );
}
