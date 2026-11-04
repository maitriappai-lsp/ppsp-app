// The Admin dashboard's EXCEPTIONS tab. The numbers come from utils/exceptions.js
// (already narrowed to the dashboard's dates / resource / beneficiary); this file
// only lays them out:
//
//   1. Stock, Book and Overall RAG -- Red and Amber counts; tap a count to list
//      those DSRs (tap a DSR to read it).
//   2. Attendance but no DSR -- tap to expand: date, resource, beneficiary.
//   3. Arriving late or leaving early (10 minutes' grace) -- tap to expand.
//   4. Signed in at a beneficiary they aren't assigned to -- tap to expand:
//      resource, assigned beneficiary, logged-in beneficiary, date.
//   5. Audit rating changes -- beneficiaries whose latest audit rated a category
//      differently from the visit before; each beneficiary opens to show both
//      visits' details, and its changed categories grouped by section
//      (1.0, 2.0 ...). Green = improved, red = declined.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, RagChip } from '../../components/UI';
import { DsrSummary } from '../facilitator/DsrScreen';
import { GRACE_MINUTES } from '../../utils/exceptions';
import { colors, spacing } from '../../theme';

const benLabel = (b) => (b ? `${b.school}${b.class ? ' - ' + b.class : ''}${b.section ? ' ' + b.section : ''}` : '--');
const muted = { color: colors.textMuted, fontSize: 12 };

// A section header: a title and a tappable count that opens / closes the section.
function SectionHeader({ title, note, count, open, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.primary} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>{title}</Text>
        {note ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{note}</Text> : null}
      </View>
      <View style={{ minWidth: 34, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, alignItems: 'center', backgroundColor: count > 0 ? colors.red : colors.chipBg }}>
        <Text style={{ color: count > 0 ? '#fff' : colors.textMuted, fontWeight: '800' }}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ExceptionsPanel({ db, result }) {
  const [open, setOpen] = useState({}); // section key -> expanded
  const [ragPick, setRagPick] = useState(null); // { kind, rag }
  const [dsrOpen, setDsrOpen] = useState(null); // dsr id
  const [benOpen, setBenOpen] = useState({}); // beneficiary id -> expanded
  const [catOpen, setCatOpen] = useState({}); // `${beneficiaryId}|${section}` -> expanded

  const resName = (id) => db.resources.find((r) => r.id === id)?.name || '--';
  const benName = (id) => benLabel(db.beneficiaries.find((b) => b.id === id));
  const toggle = (key) => setOpen((cur) => ({ ...cur, [key]: !cur[key] }));

  const RAG_ROWS = [
    { kind: 'stock', label: 'Stock' },
    { kind: 'book', label: 'Book' },
    { kind: 'overall', label: 'Overall' },
  ];
  const ragColors = { Red: colors.red, Amber: colors.amber };

  const row = (cells) => (
    <View style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>{cells}</View>
  );

  const headerLine = (a) =>
    `${a.auditDate}, ${a.timeFrom || '--'} to ${a.timeTo || '--'}, ${[a.facilitator1Id, a.facilitator2Id].filter(Boolean).map(resName).join(' & ') || '--'}`;

  return (
    <View>
      {/* ------------------------------------------------ 1. RAG */}
      <Card>
        <Text style={{ fontWeight: '800', color: colors.text, marginBottom: spacing.xs }}>DSR ratings (submitted DSRs)</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm }}>Tap a count to see those DSRs.</Text>
        {RAG_ROWS.map(({ kind, label }) => (
          <View key={kind} style={{ marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ width: 70, color: colors.text, fontWeight: '700' }}>{label}</Text>
              {['Red', 'Amber'].map((rag) => {
                const n = result.rag[kind][rag].length;
                const on = ragPick && ragPick.kind === kind && ragPick.rag === rag;
                return (
                  <TouchableOpacity
                    key={rag}
                    onPress={() => setRagPick(on ? null : { kind, rag })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginRight: spacing.sm,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: ragColors[rag],
                      backgroundColor: on ? ragColors[rag] : 'transparent',
                    }}
                  >
                    <Text style={{ color: on ? '#fff' : ragColors[rag], fontWeight: '800' }}>
                      {rag} {n}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {ragPick && ragPick.kind === kind ? (
              <View style={{ marginTop: spacing.xs }}>
                {result.rag[kind][ragPick.rag].length === 0 ? (
                  <Text style={muted}>None.</Text>
                ) : (
                  result.rag[kind][ragPick.rag].map((d) => (
                    <View key={d.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <TouchableOpacity onPress={() => setDsrOpen(dsrOpen === d.id ? null : d.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name={dsrOpen === d.id ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.primary} />
                        <View style={{ flex: 1, marginLeft: spacing.xs }}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>{d.dsrDate} - {resName(d.resourceId)}</Text>
                          <Text style={muted}>{benName(d.beneficiaryId)}</Text>
                        </View>
                        <RagChip rag={ragPick.rag} />
                      </TouchableOpacity>
                      {dsrOpen === d.id ? (
                        <View style={{ marginTop: spacing.sm }}>
                          <DsrSummary dsr={d} db={db} />
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        ))}
      </Card>

      {/* ------------------------------------------------ 2. attendance but no DSR */}
      <Card>
        <SectionHeader title="Attendance but no DSR" note="Timed in, but no submitted DSR for that day and beneficiary" count={result.noDsr.length} open={!!open.noDsr} onPress={() => toggle('noDsr')} />
        {open.noDsr
          ? result.noDsr.length === 0
            ? <Text style={[muted, { marginTop: spacing.sm }]}>None.</Text>
            : result.noDsr.map((x) =>
                <View key={x.key}>
                  {row(
                    <>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{x.date}</Text>
                      <Text style={muted}>{resName(x.resourceId)} - {benName(x.beneficiaryId)}</Text>
                    </>
                  )}
                </View>
              )
          : null}
      </Card>

      {/* ------------------------------------------------ 3. late or early */}
      <Card>
        <SectionHeader title="Arriving late or leaving early" note={`Against the beneficiary's opening and closing times, with ${GRACE_MINUTES} minutes' grace`} count={result.lateEarly.length} open={!!open.lateEarly} onPress={() => toggle('lateEarly')} />
        {open.lateEarly
          ? result.lateEarly.length === 0
            ? <Text style={[muted, { marginTop: spacing.sm }]}>None.</Text>
            : result.lateEarly.map((x) =>
                <View key={x.key}>
                  {row(
                    <>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{x.date} - {x.kind}</Text>
                      <Text style={muted}>{resName(x.resourceId)} - {benName(x.beneficiaryId)}</Text>
                      {x.lateBy ? <Text style={{ color: colors.red, fontSize: 12 }}>In {x.actualIn}, expected {x.expectedIn} ({x.lateBy} min late)</Text> : null}
                      {x.earlyBy ? <Text style={{ color: colors.red, fontSize: 12 }}>Out {x.actualOut}, expected {x.expectedOut} ({x.earlyBy} min early)</Text> : null}
                    </>
                  )}
                </View>
              )
          : null}
      </Card>

      {/* ------------------------------------------------ 4. non-assigned beneficiary */}
      <Card>
        <SectionHeader title="Signed in at a non-assigned beneficiary" note="Compared with their current allocations" count={result.nonAssigned.length} open={!!open.nonAssigned} onPress={() => toggle('nonAssigned')} />
        {open.nonAssigned
          ? result.nonAssigned.length === 0
            ? <Text style={[muted, { marginTop: spacing.sm }]}>None.</Text>
            : result.nonAssigned.map((x) =>
                <View key={x.key}>
                  {row(
                    <>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{x.date} - {resName(x.resourceId)}</Text>
                      <Text style={muted}>Assigned: {x.assignedBeneficiaryIds.map(benName).join(', ') || 'none'}</Text>
                      <Text style={{ color: colors.red, fontSize: 12 }}>Signed in at: {benName(x.loggedBeneficiaryId)}</Text>
                    </>
                  )}
                </View>
              )
          : null}
      </Card>

      {/* ------------------------------------------------ 5. audit changes */}
      <Card>
        <SectionHeader title="Audit rating changes" note="Beneficiaries whose latest visit rated a category differently from the visit before" count={result.auditChanges.length} open={!!open.audit} onPress={() => toggle('audit')} />
        {open.audit ? (
          result.auditChanges.length === 0 ? (
            <Text style={[muted, { marginTop: spacing.sm }]}>None.</Text>
          ) : (
            result.auditChanges.map((c) => {
              const isOpen = !!benOpen[c.beneficiaryId];
              const up = c.changes.filter((x) => x.delta > 0).length;
              const down = c.changes.filter((x) => x.delta < 0).length;
              // group the changed categories by section: 1.0, 2.0 ...
              const sections = {};
              c.changes.forEach((ch) => {
                const major = String(ch.categoryNo).split('.')[0];
                (sections[major] = sections[major] || []).push(ch);
              });
              return (
                <View key={c.beneficiaryId} style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                  <TouchableOpacity onPress={() => setBenOpen((cur) => ({ ...cur, [c.beneficiaryId]: !isOpen }))} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: spacing.xs }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{benName(c.beneficiaryId)}</Text>
                      <Text style={muted}>
                        {c.changes.length} categor{c.changes.length === 1 ? 'y' : 'ies'} changed
                      </Text>
                    </View>
                    {up > 0 ? <Text style={{ color: colors.green, fontWeight: '800', marginRight: spacing.sm }}>{'\u25B2'} {up}</Text> : null}
                    {down > 0 ? <Text style={{ color: colors.red, fontWeight: '800' }}>{'\u25BC'} {down}</Text> : null}
                  </TouchableOpacity>

                  {isOpen ? (
                    <View style={{ marginTop: spacing.sm }}>
                      <Text style={{ color: colors.text, fontSize: 12 }}>
                        <Text style={{ fontWeight: '700' }}>Latest visit: </Text>
                        {headerLine(c.latest)}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 12, marginBottom: spacing.sm }}>
                        <Text style={{ fontWeight: '700' }}>Previous visit: </Text>
                        {headerLine(c.previous)}
                      </Text>

                      {Object.keys(sections)
                        .sort((a, b) => Number(a) - Number(b))
                        .map((major) => {
                          const key = `${c.beneficiaryId}|${major}`;
                          const catIsOpen = !!catOpen[key];
                          const heading = db.auditCategories.find((x) => x.id === major);
                          return (
                            <View key={major} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: spacing.xs, overflow: 'hidden' }}>
                              <TouchableOpacity onPress={() => setCatOpen((cur) => ({ ...cur, [key]: !catIsOpen }))} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.sm, backgroundColor: colors.chipBg }}>
                                <Ionicons name={catIsOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.primary} />
                                <Text style={{ flex: 1, marginLeft: spacing.xs, color: colors.text, fontWeight: '700', fontSize: 12 }}>
                                  {major}.0  {heading?.description || ''}
                                </Text>
                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{sections[major].length}</Text>
                              </TouchableOpacity>
                              {catIsOpen
                                ? sections[major].map((ch) => {
                                    const better = ch.delta > 0;
                                    const tone = better ? colors.green : colors.red;
                                    return (
                                      <View key={ch.categoryNo} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                                        <View style={{ flex: 1, paddingRight: spacing.sm }}>
                                          <Text style={{ color: colors.text, fontSize: 12 }}>{ch.categoryNo}  {ch.description}</Text>
                                        </View>
                                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Prev {ch.previousRating}</Text>
                                        <Ionicons name={better ? 'arrow-up' : 'arrow-down'} size={14} color={tone} style={{ marginHorizontal: 4 }} />
                                        <Text style={{ color: tone, fontWeight: '800', fontSize: 13 }}>Now {ch.latestRating}</Text>
                                      </View>
                                    );
                                  })
                                : null}
                            </View>
                          );
                        })}
                    </View>
                  ) : null}
                </View>
              );
            })
          )
        ) : null}
      </Card>
    </View>
  );
}
