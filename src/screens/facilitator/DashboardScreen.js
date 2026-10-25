// SCREEN 5 (Facilitator): Dashboard.
// Date range + search + sub-tabs (Overview / Attendance / Uploads) + Export to
// Excel. (PPSP has no Sessions or Schedule; My DSR, Stock, Student list and
// Book update tabs are added next.)
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiGet } from '../../data/api';
import { Screen, Card, Field, SecondaryButton, DateField } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { todayLocalYMD } from '../../utils/date';

const TABS = ['Overview', 'Attendance', 'Uploads'];

export default function DashboardScreen() {
  const { currentUser } = useAuth();
  const { db } = useData();
  const [tab, setTab] = useState('Overview');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState(todayLocalYMD());

  const q = query.trim().toLowerCase();

  const myAttendance = useMemo(
    () =>
      db.attendance
        .filter((a) => a.facilitatorId === currentUser?.id)
        .filter((a) => a.date >= from && a.date <= to)
        .filter((a) => {
          if (!q) return true;
          const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
          return `${b?.school} ${b?.class} ${b?.section} ${a.date}`.toLowerCase().includes(q);
        }),
    [db, currentUser, from, to, q]
  );

  const myUploads = db.uploads
    .filter((u) => u.facilitatorId === currentUser?.id && u.date >= from && u.date <= to)
    .filter((u) => !q || `${u.fileName} ${u.description}`.toLowerCase().includes(q));

  const [exporting, setExporting] = useState(false);

  async function exportToExcel() {
    const exportType = tab === 'Uploads' ? 'uploads' : 'attendance';
    setExporting(true);
    try {
      const { filename, base64 } = await apiGet(
        `/api/export/${exportType}?from=${from}&to=${to}&facilitatorId=${currentUser.id}`
      );
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: filename,
        });
      } else {
        Alert.alert('Export ready', `Saved to ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', e.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        My activity
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={setFrom} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={setTo} />
        </View>
      </View>
      <Field
        label="Search beneficiary or file"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. Canal road, photo"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 40, flexGrow: 0, marginBottom: spacing.sm }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
      >
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                height: 32,
                justifyContent: 'center',
                paddingHorizontal: 12,
                marginRight: spacing.xs,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : colors.chipBg,
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.text }}>
                {t}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <SecondaryButton
        title={exporting ? 'Exporting...' : 'Export to Excel'}
        onPress={exportToExcel}
        disabled={exporting}
        style={{ marginBottom: spacing.md }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === 'Overview' && (
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{new Set(myAttendance.map((a) => a.date)).size}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Days attended</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{myAttendance.length}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Attendance records</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{myUploads.length}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Files uploaded</Text>
              </View>
            </View>
          </Card>
        )}

        {tab === 'Uploads' &&
          myUploads.map((u) => (
            <Card key={u.id}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{u.date}</Text>
              {u.fileUrl ? (
                <SecondaryButton title="View" onPress={() => Linking.openURL(u.fileUrl)} style={{ marginTop: spacing.sm }} />
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
                  No file attached -- metadata only.
                </Text>
              )}
            </Card>
          ))}

        {tab === 'Attendance' &&
          (myAttendance.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No attendance records for this range.</Text>
          ) : (
            myAttendance
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((a) => {
                const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
                return (
                  <Card key={a.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{a.date}</Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {b?.school} {b?.class} {b?.section}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      Time in: {a.timeIn || '--'}   Time out: {a.timeOut || '--'}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {a.geoVerified ? 'Geofence verified' : 'Not geofence-verified'}
                    </Text>
                  </Card>
                );
              })
          ))}
      </ScrollView>
    </Screen>
  );
}
