// SCREEN (Admin): Search.
//
// A generic search/view/export/delete tool across every data table in the
// app (Geo, Attendance, Resources, Beneficiaries, Uploads, Content, and the PPSP tables: Allocations, Students, Materials,
// Books, Stock, Book stock, DSR, DSR lines, Audits, Audit lines) -- one tab
// per table, rather than a bespoke screen per table.
//
// Each tab has: a free-text search across every field of that table
// (including resolved names for linked records, e.g. searching a
// facilitator's name finds their attendance rows, not just their own
// Resources row); a From/To date range filter, shown only for tables that
// actually have a meaningful date field; and a checkbox-style multi-select
// over the results.
//
// Export and Delete both follow the same rule: if any rows are selected,
// the action applies to exactly those rows. If none are selected, it
// applies to every row in that table -- not just what the current
// search/filter happens to be showing. This is a deliberate, explicit
// default (confirmed with an exact count before anything happens), not an
// accident of "select all visible".
//
// All the data this screen searches is already loaded client-side (the
// whole `db` from data/store.js), so filtering itself needs no network
// calls. Only Export (GET /api/export/table/:table) and Delete (the
// existing generic DELETE /api/:table/:id, one call per row) touch the
// network.
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useData } from '../../data/store';
import { apiGet } from '../../data/api';
import { Screen, Card, Chip, Field, DateField, PrimaryButton, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

// ---- Small shared label resolvers (FK id -> readable text) -----------------

function resourceName(db, id) {
  return db.resources.find((r) => r.id === id)?.name || (id ? `(unknown: ${id})` : '--');
}
function beneficiaryLabel(db, id) {
  const b = db.beneficiaries.find((x) => x.id === id);
  if (!b) return id ? `(unknown: ${id})` : '--';
  return `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}`;
}
function categoryLabel(db, id) {
  const c = db.categories.find((x) => x.id === id);
  if (!c) return id ? `(unknown: ${id})` : '--';
  return `${c.pillar}${c.topic ? ' / ' + c.topic : ''}`;
}
function geoLabel(db, id) {
  const g = db.geo.find((x) => x.id === id);
  if (!g) return id ? `(unknown: ${id})` : '--';
  return `${g.school}${g.label ? ' - ' + g.label : ''}`;
}
function materialFull(db, id) {
  const m = (db.materialMaster || []).find((x) => x.id === id);
  return m ? [m.category, m.name, m.type, (m.activities || []).join(' ')].filter(Boolean).join(' ') : '';
}
function materialLabel(db, id) {
  const m = (db.materialMaster || []).find((x) => x.id === id);
  if (!m) return id ? `(unknown: ${id})` : '--';
  return `${m.name}${m.type ? ' (' + m.type + ')' : ''}`;
}
function bookLabel(db, id) {
  const b = (db.bookMaster || []).find((x) => x.id === id);
  return b ? b.title : id ? `(unknown: ${id})` : '--';
}
function studentLabel(db, id) {
  const s = (db.studentMaster || []).find((x) => x.id === id);
  return s ? s.name : id ? `(unknown: ${id})` : '--';
}
function auditCategoryLabel(db, no) {
  const c = (db.auditCategories || []).find((x) => x.id === no);
  return c ? `${c.id} ${c.description}` : no || '--';
}

// Generic "camelCaseKey" -> "Camel Case Key" for the detail view, so every
// field is shown even for ones no table config specifically labels.
function friendlyKey(key) {
  const spaced = key.replace(/([A-Z])/g, ' $1').trim();
  const words = spaced.split(' ').map((w) => (w.toLowerCase() === 'id' ? 'ID' : w[0].toUpperCase() + w.slice(1)));
  return words.join(' ');
}

// Fields every table's detail view skips resolving to an FK label (shown
// raw instead), and fields hidden entirely (internal/sensitive/redundant).
const FK_RESOLVERS = {
  beneficiaryId: beneficiaryLabel,
  facilitatorId: resourceName,
  assistantId: resourceName,
  resourceId: resourceName,
  loggedBy: resourceName,
  overriddenBy: resourceName,
  uploadedBy: resourceName,
  categoryId: categoryLabel,
  geoId: geoLabel,
  // PPSP
  resource1Id: resourceName,
  resource2Id: resourceName,
  facilitator1Id: resourceName,
  facilitator2Id: resourceName,
  updatedBy: resourceName,
  lastUpdatedBy: resourceName,
  materialId: materialLabel,
  bookId: bookLabel,
  studentId: studentLabel,
  categoryNo: auditCategoryLabel,
};
const HIDDEN_DETAIL_FIELDS = new Set(['passwordHash', 'attendanceId']);

function renderDetailValue(key, value, db) {
  if (value === null || value === undefined || value === '') return '--';
  const resolver = FK_RESOLVERS[key];
  if (resolver) return resolver(db, value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '--';
  return String(value);
}

// ---- Per-table configuration ----------------------------------------------
// dbKey: the key in `db` (and the generic table name the API expects).
// dateField: which field a From/To filter applies to -- null hides the
// date-range controls for that tab entirely.
// searchText: every value worth matching against, including resolved FK
// labels (so e.g. a facilitator's name finds their attendance rows).
// summary: the one-line list-row text.

const TABLE_CONFIGS = [
  {
    key: 'geo',
    dbKey: 'geo',
    label: 'Geo',
    dateField: null,
    searchText: (r) => [r.school, r.label, r.radiusMeters, r.lat, r.lng].filter(Boolean).join(' '),
    summary: (r) => `${r.school}${r.label ? ' - ' + r.label : ''} \u00b7 ${r.radiusMeters}m radius`,
  },
  {
    key: 'attendance',
    dbKey: 'attendance',
    label: 'Attendance',
    dateField: 'date',
    searchText: (r, db) =>
      [beneficiaryLabel(db, r.beneficiaryId), resourceName(db, r.facilitatorId), r.date, r.timeIn, r.timeOut, r.overrideReason]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) =>
      `${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 ${resourceName(db, r.facilitatorId)} \u00b7 ${r.date} \u00b7 ${r.timeIn || '--'}-${r.timeOut || '--'}`,
  },
  {
    key: 'resources',
    dbKey: 'resources',
    label: 'Resources',
    dateField: 'contractStart',
    searchText: (r) => [r.name, r.phone, r.email, r.address, r.type, r.role, r.bloodGroup, r.emergencyContact].filter(Boolean).join(' '),
    summary: (r) => `${r.name} \u00b7 ${r.role || '--'} \u00b7 ${r.phone || '--'}${r.active === false ? ' \u00b7 Inactive' : ''}`,
  },
  {
    key: 'beneficiaries',
    dbKey: 'beneficiaries',
    label: 'Beneficiaries',
    dateField: null,
    searchText: (r, db) => [r.school, r.class, r.section, geoLabel(db, r.geoId)].filter(Boolean).join(' '),
    summary: (r) => `${r.school}${r.class ? ' \u00b7 ' + r.class : ''}${r.section ? ' ' + r.section : ''}`,
  },
  {
    key: 'uploads',
    dbKey: 'uploads',
    label: 'Uploads',
    dateField: 'date',
    searchText: (r, db) =>
      [r.fileName, r.description, beneficiaryLabel(db, r.beneficiaryId), resourceName(db, r.facilitatorId), categoryLabel(db, r.categoryId), r.date]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) => `${r.fileName} \u00b7 ${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 ${r.date}`,
  },
  {
    key: 'content',
    dbKey: 'content',
    label: 'Content',
    dateField: 'date',
    searchText: (r, db) =>
      [r.fileName || r.title, r.fileType, r.activity, r.remarks, materialFull(db, r.materialId), resourceName(db, r.uploadedBy), r.date].filter(Boolean).join(' '),
    summary: (r, db) =>
      `${r.fileName || r.title || r.id} \u00b7 ${r.fileType || '--'}${r.activity ? ' \u00b7 ' + r.activity : ''} \u00b7 ${r.materialId ? materialLabel(db, r.materialId) : 'no material'}`,
  },
  // ---- PPSP tables ----
  {
    key: 'allocations',
    dbKey: 'allocations',
    label: 'Allocations',
    dateField: 'fromDate',
    searchText: (r, db) =>
      [
        beneficiaryLabel(db, r.beneficiaryId),
        resourceName(db, r.resource1Id),
        r.resource2Id && resourceName(db, r.resource2Id),
        r.fromDate,
        r.active === false ? 'inactive' : 'active',
        r.updateRemarks,
      ]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) =>
      `${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 ${resourceName(db, r.resource1Id)}${r.resource2Id ? ' + ' + resourceName(db, r.resource2Id) : ''}${r.active === false ? ' \u00b7 Inactive' : ''}`,
  },
  {
    key: 'studentMaster',
    dbKey: 'studentMaster',
    label: 'Students',
    dateField: 'joinedDate',
    searchText: (r, db) => [r.id, r.name, r.parentName, r.parentContact, beneficiaryLabel(db, r.beneficiaryId)].filter(Boolean).join(' '),
    summary: (r, db) => `${r.name} \u00b7 ${beneficiaryLabel(db, r.beneficiaryId)}`,
  },
  {
    key: 'materialMaster',
    dbKey: 'materialMaster',
    label: 'Materials',
    dateField: null,
    searchText: (r) => [r.id, r.category, r.name, r.type, (r.activities || []).join(' ')].filter(Boolean).join(' '),
    summary: (r) => `${r.category} \u00b7 ${r.name}${r.type ? ' (' + r.type + ')' : ''}`,
  },
  {
    key: 'bookMaster',
    dbKey: 'bookMaster',
    label: 'Books',
    dateField: null,
    searchText: (r) => [r.id, r.title, r.language, r.classification, r.author].filter(Boolean).join(' '),
    summary: (r) => `${r.title}${r.language ? ' \u00b7 ' + r.language : ''}${r.classification ? ' \u00b7 ' + r.classification : ''}`,
  },
  {
    key: 'stockUpdate',
    dbKey: 'stockUpdate',
    label: 'Stock',
    dateField: 'lastUpdatedAt',
    searchText: (r, db) =>
      [beneficiaryLabel(db, r.beneficiaryId), materialLabel(db, r.materialId), r.qty, r.status, r.remarks, resourceName(db, r.lastUpdatedBy)]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) => `${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 ${materialLabel(db, r.materialId)} \u00b7 Qty ${r.qty}${r.status ? ' \u00b7 ' + r.status : ''}`,
  },
  {
    key: 'bookUpdate',
    dbKey: 'bookUpdate',
    label: 'Book stock',
    dateField: 'lastUpdatedAt',
    searchText: (r, db) =>
      [beneficiaryLabel(db, r.beneficiaryId), bookLabel(db, r.bookId), r.qty, r.status, r.remarks, resourceName(db, r.lastUpdatedBy)]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) => `${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 ${bookLabel(db, r.bookId)} \u00b7 Qty ${r.qty}${r.status ? ' \u00b7 ' + r.status : ''}`,
  },
  {
    key: 'dsr',
    dbKey: 'dsr',
    label: 'DSR',
    dateField: 'dsrDate',
    searchText: (r, db) =>
      [
        resourceName(db, r.resourceId),
        beneficiaryLabel(db, r.beneficiaryId),
        r.dsrDate,
        r.status,
        r.stockRag,
        r.bookRag,
        r.overallRag,
        (r.circleTimeActivities || []).join(' '),
        r.eplMaterialsUsed,
        r.stockRemarks,
        r.remarks,
      ]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) => `${resourceName(db, r.resourceId)} \u00b7 ${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 ${r.dsrDate} \u00b7 ${r.status}`,
  },
  {
    key: 'dsrDetail',
    dbKey: 'dsrDetail',
    label: 'DSR lines',
    dateField: null,
    searchText: (r, db) => [r.dsrId, materialLabel(db, r.materialId), r.materialActivity, r.sessionPeriod === 'M' ? 'morning' : 'afternoon'].filter(Boolean).join(' '),
    summary: (r, db) => `${r.dsrId} \u00b7 ${materialLabel(db, r.materialId)} \u00b7 ${r.materialActivity || '--'} \u00b7 ${r.sessionPeriod === 'M' ? 'Morning' : 'Afternoon'}`,
  },
  {
    key: 'audits',
    dbKey: 'audits',
    label: 'Audits',
    dateField: 'auditDate',
    searchText: (r, db) =>
      [
        beneficiaryLabel(db, r.beneficiaryId),
        resourceName(db, r.facilitator1Id),
        r.facilitator2Id && resourceName(db, r.facilitator2Id),
        r.auditDate,
        `visit ${r.visitNumber}`,
        r.status,
        r.visitRemarks,
      ]
        .filter(Boolean)
        .join(' '),
    summary: (r, db) => `${beneficiaryLabel(db, r.beneficiaryId)} \u00b7 Visit ${r.visitNumber} \u00b7 ${r.auditDate} \u00b7 ${r.status}`,
  },
  {
    key: 'auditDetail',
    dbKey: 'auditDetail',
    label: 'Audit lines',
    dateField: null,
    searchText: (r, db) => [r.auditId, auditCategoryLabel(db, r.categoryNo), r.statusFlag, r.rating, r.remarks].filter(Boolean).join(' '),
    summary: (r, db) => `${r.auditId} \u00b7 ${r.categoryNo} \u00b7 ${r.statusFlag || '--'}${r.rating ? ' \u00b7 Rating ' + r.rating : ''}`,
  },
  {
    key: 'auditCategories',
    dbKey: 'auditCategories',
    label: 'Audit checklist',
    dateField: null,
    searchText: (r) => [r.id, r.description, r.active === false ? 'inactive' : 'active'].filter(Boolean).join(' '),
    summary: (r) => `${r.id} \u00b7 ${r.description}${r.active === false ? ' \u00b7 Inactive' : ''}`,
  },
];

export default function SearchScreen() {
  const { db, deleteRecord, refresh } = useData();
  const [activeKey, setActiveKey] = useState(TABLE_CONFIGS[0].key);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const config = TABLE_CONFIGS.find((c) => c.key === activeKey);

  function switchTable(key) {
    setActiveKey(key);
    setQuery('');
    setFromDate('');
    setToDate('');
    setSelectedIds(new Set());
    setExpandedId(null);
  }

  const allRows = db[config.dbKey] || [];

  const filtered = useMemo(() => {
    let rows = allRows;
    if (config.dateField && (fromDate || toDate)) {
      rows = rows.filter((r) => {
        const d = String(r[config.dateField] || '').slice(0, 10); // timestamps -> YYYY-MM-DD
        if (!d) return false;
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => config.searchText(r, db).toLowerCase().includes(q));
    }
    if (config.dateField) {
      rows = rows.slice().sort((a, b) => (b[config.dateField] || '').localeCompare(a[config.dateField] || ''));
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, query, fromDate, toDate, config]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllShown() {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Which other tables point at a row in this table, and the field they
  // use to do it. Checked before any delete, so deleting (say) a
  // Beneficiary that still has Attendance/Schedule/Sessions/Uploads rows
  // is blocked outright rather than silently orphaning those rows (the
  // database itself just sets the link to null on delete, which is not
  // the same as the data staying meaningful).
  const DEPENDENTS = {
    geo: [{ childDbKey: 'beneficiaries', childField: 'geoId', label: 'Beneficiaries' }],
    beneficiaries: [
      { childDbKey: 'attendance', childField: 'beneficiaryId', label: 'Attendance' },
      { childDbKey: 'uploads', childField: 'beneficiaryId', label: 'Uploads' },
      { childDbKey: 'studentMaster', childField: 'beneficiaryId', label: 'Students' },
      { childDbKey: 'allocations', childField: 'beneficiaryId', label: 'Allocations' },
      { childDbKey: 'stockUpdate', childField: 'beneficiaryId', label: 'Stock' },
      { childDbKey: 'bookUpdate', childField: 'beneficiaryId', label: 'Book stock' },
      { childDbKey: 'dsr', childField: 'beneficiaryId', label: 'DSR' },
      { childDbKey: 'audits', childField: 'beneficiaryId', label: 'Audits' },
    ],
    resources: [
      { childDbKey: 'attendance', childField: 'facilitatorId', label: 'Attendance' },
      { childDbKey: 'uploads', childField: 'facilitatorId', label: 'Uploads' },
      { childDbKey: 'content', childField: 'uploadedBy', label: 'Content (uploaded by)' },
      { childDbKey: 'allocations', childField: 'resource1Id', label: 'Allocations (resource 1)' },
      { childDbKey: 'allocations', childField: 'resource2Id', label: 'Allocations (resource 2)' },
      { childDbKey: 'dsr', childField: 'resourceId', label: 'DSR' },
      { childDbKey: 'audits', childField: 'facilitator1Id', label: 'Audits' },
      { childDbKey: 'audits', childField: 'facilitator2Id', label: 'Audits (as facilitator 2)' },
    ],
    materialMaster: [
      { childDbKey: 'stockUpdate', childField: 'materialId', label: 'Stock' },
      { childDbKey: 'dsrDetail', childField: 'materialId', label: 'DSR lines' },
      { childDbKey: 'content', childField: 'materialId', label: 'Content' },
    ],
    bookMaster: [{ childDbKey: 'bookUpdate', childField: 'bookId', label: 'Book stock' }],
    auditCategories: [{ childDbKey: 'auditDetail', childField: 'categoryNo', label: 'Audit lines' }],
    // Deleting a DSR / audit also removes its lines (the database cascades),
    // and deleting a student just drops them from DSR lines, so none of
    // those block a delete.
  };

  // Splits a candidate id list into those safe to delete and those with at
  // least one dependent elsewhere, plus a per-child-table count across all
  // blocked ids combined (so the warning says e.g. "34 Attendance, 20
  // Sessions" rather than a confusing per-row breakdown).
  function splitByDependents(ids) {
    const rules = DEPENDENTS[config.dbKey];
    if (!rules || rules.length === 0) return { deletable: ids, blocked: [], blockedCounts: [] };

    const idSet = new Set(ids);
    const blocked = new Set();
    const counts = [];
    for (const rule of rules) {
      const childRows = db[rule.childDbKey] || [];
      const matching = childRows.filter((r) => idSet.has(r[rule.childField]));
      matching.forEach((r) => blocked.add(r[rule.childField]));
      if (matching.length > 0) counts.push({ label: rule.label, count: matching.length });
    }
    return {
      deletable: ids.filter((id) => !blocked.has(id)),
      blocked: ids.filter((id) => blocked.has(id)),
      blockedCounts: counts,
    };
  }

  async function doDelete(ids) {
    setBusy(true);
    const failed = [];
    const CHUNK = 8;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      await Promise.all(
        batch.map((id) =>
          deleteRecord(config.dbKey, id).catch(() => {
            failed.push(id);
          })
        )
      );
    }
    setBusy(false);
    setSelectedIds(new Set());
    refresh().catch(() => {}); // cascaded rows (e.g. a DSR's lines) vanish on the server too
    if (failed.length > 0) {
      Alert.alert('Some records could not be deleted', `${ids.length - failed.length} of ${ids.length} deleted. ${failed.length} failed -- they may be referenced elsewhere.`);
    } else {
      Alert.alert('Deleted', `${ids.length} record(s) removed from ${config.label}.`);
    }
  }

  function handleDeletePress() {
    const candidateIds = selectedIds.size > 0 ? [...selectedIds] : allRows.map((r) => r.id);
    if (candidateIds.length === 0) return Alert.alert('Nothing to delete', `${config.label} has no records.`);

    const { deletable, blocked, blockedCounts } = splitByDependents(candidateIds);
    const usingSelection = selectedIds.size > 0;

    if (blocked.length > 0) {
      const breakdown = blockedCounts.map((c) => `${c.count} ${c.label}`).join(', ');
      const header = usingSelection
        ? `${blocked.length} of your ${candidateIds.length} selected record(s)`
        : `${blocked.length} of the ${candidateIds.length} record(s) in ${config.label}`;
      const message =
        `${header} can't be deleted -- they still have linked records: ${breakdown}. ` +
        `Delete those linked records first (from their own tab here in Search), then come back and delete ${usingSelection ? 'these' : 'the rest'}.` +
        (deletable.length > 0 ? `\n\nThe other ${deletable.length} have no linked records and can be deleted now.` : '');

      const buttons = [{ text: 'Cancel', style: 'cancel' }];
      if (deletable.length > 0) {
        buttons.push({
          text: `Delete the ${deletable.length} that are clear`,
          style: 'destructive',
          onPress: () => doDelete(deletable),
        });
      }
      Alert.alert('Some records have linked data', message, buttons);
      return;
    }

    // Nothing blocked -- same confirmation as before.
    if (usingSelection) {
      Alert.alert(
        'Delete selected records',
        `Delete ${deletable.length} selected record(s) from ${config.label}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `Delete ${deletable.length}`, style: 'destructive', onPress: () => doDelete(deletable) },
        ]
      );
    } else {
      Alert.alert(
        'Delete ALL records',
        `No records are selected, so this deletes every record in ${config.label} -- all ${deletable.length} of them, not just what your current search/filter is showing. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: `Delete all ${deletable.length}`, style: 'destructive', onPress: () => doDelete(deletable) },
        ]
      );
    }
  }

  async function handleExportPress() {
    const ids = selectedIds.size > 0 ? [...selectedIds] : null;
    setBusy(true);
    try {
      const path = ids
        ? `/api/export/table/${config.dbKey}?ids=${encodeURIComponent(ids.join(','))}`
        : `/api/export/table/${config.dbKey}`;
      const { filename, base64 } = await apiGet(path);
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
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>Search</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 40, flexGrow: 0, marginBottom: spacing.md }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
      >
        {TABLE_CONFIGS.map((c) => {
          const active = c.key === activeKey;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => switchTable(c.key)}
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
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.text }}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Field label="Search" value={query} onChangeText={setQuery} placeholder={`Search ${config.label}...`} />

      {config.dateField && (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateField label="From" value={fromDate} onChange={setFromDate} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="To" value={toDate} onChange={setToDate} />
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
          Showing {filtered.length} of {allRows.length} total {'\u00b7'} {selectedIds.size} selected
        </Text>
        <TouchableOpacity onPress={selectedIds.size > 0 ? clearSelection : selectAllShown}>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
            {selectedIds.size > 0 ? 'Clear selection' : 'Select all shown'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.md }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: spacing.md }}>No matching records.</Text>}
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.id);
          const expanded = expandedId === item.id;
          return (
            <Card style={{ paddingVertical: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <TouchableOpacity onPress={() => toggleSelect(item.id)} style={{ padding: 4, marginRight: spacing.sm }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{'\u2713'}</Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setExpandedId(expanded ? null : item.id)}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{config.summary(item, db)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {expanded ? 'Hide details \u25be' : 'Show details \u25b8'}
                  </Text>
                  {expanded && (
                    <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                      {Object.entries(item)
                        .filter(([k]) => !HIDDEN_DETAIL_FIELDS.has(k))
                        .map(([k, v]) => (
                          <Text key={k} style={{ color: colors.text, fontSize: 12, marginBottom: 2 }}>
                            <Text style={{ color: colors.textMuted }}>{friendlyKey(k)}: </Text>
                            {renderDetailValue(k, v, db)}
                          </Text>
                        ))}
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      <View style={{ flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            title={busy ? 'Working...' : `Export ${selectedIds.size > 0 ? 'selected' : 'all'}`}
            onPress={handleExportPress}
            disabled={busy}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title={busy ? 'Working...' : `Delete ${selectedIds.size > 0 ? 'selected' : 'all'}`}
            onPress={handleDeletePress}
            disabled={busy}
            style={{ backgroundColor: colors.red }}
          />
        </View>
      </View>
      {busy && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />}
    </Screen>
  );
}
