// A material dropdown whose list is grouped under its category headings
// (Sensorial, Language Tamil, ...), with a search box. Used where one material
// has to be chosen from a long master list.
//
//   <MaterialPicker materials={db.materialMaster} value={id} onSelect={setId}
//                   placeholder="Choose material..." disabled={false} />
import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View, Modal, SectionList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Field } from './UI';
import { colors, spacing } from '../theme';

function materialText(m) {
  return m ? `${m.name}${m.type ? ' (' + m.type + ')' : ''}` : '--';
}

export default function MaterialPicker({ materials, value, onSelect, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = materials.find((m) => m.id === value);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = {};
    materials.forEach((m) => {
      if (needle && !`${m.category} ${m.name} ${m.type || ''}`.toLowerCase().includes(needle)) return;
      const cat = m.category || '(no category)';
      (map[cat] = map[cat] || []).push(m);
    });
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((cat) => ({
        title: cat,
        data: map[cat].sort((a, b) => (a.name || '').localeCompare(b.name || '') || (a.type || '').localeCompare(b.type || '')),
      }));
  }, [materials, q]);

  function close() {
    setOpen(false);
    setQ('');
  }

  return (
    <>
      <TouchableOpacity
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: 10,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          marginBottom: spacing.sm,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ flex: 1, color: selected ? colors.text : colors.textMuted }} numberOfLines={2}>
          {selected ? `${selected.category} / ${materialText(selected)}` : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Choose material</Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <Field placeholder="Search materials..." value={q} onChangeText={setQ} />
            <SectionList
              sections={sections}
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled
              ListEmptyComponent={<Text style={{ color: colors.textMuted, paddingVertical: spacing.md }}>No materials match.</Text>}
              renderSectionHeader={({ section }) => (
                <View style={{ backgroundColor: colors.chipBg, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: 6, marginTop: spacing.xs }}>
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 12 }}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item.id);
                    close();
                  }}
                  style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Text style={{ color: item.id === value ? colors.primary : colors.text, fontWeight: item.id === value ? '800' : '500' }}>
                    {materialText(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
