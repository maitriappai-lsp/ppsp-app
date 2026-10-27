// A dropdown that lets you tick SEVERAL options -- for lists that can run to
// 20+ entries, where a row of buttons would take over the screen.
//
//   <MultiSelect
//     title="EPL materials"
//     options={[{ value: 'MAT-0001', label: 'Pink Tower' }, ...]}
//     values={selectedValues}
//     onChange={setSelectedValues}
//     placeholder="Choose materials..."
//   />
//
// The closed control shows what is selected as small tags (tap a tag's x to
// remove it). Tapping the control opens a sheet with a search box (once there
// are more than a handful of options) and a tick-list; "Done" closes it.
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Field } from './UI';
import { colors, spacing } from '../theme';

const SEARCH_THRESHOLD = 8;

export default function MultiSelect({ title, options, values, onChange, placeholder, emptyText, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selectedOptions = values.map((v) => options.find((o) => o.value === v)).filter(Boolean);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => String(o.label).toLowerCase().includes(needle)) : options;
  }, [options, q]);

  function toggle(value) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  function close() {
    setOpen(false);
    setQ('');
  }

  const summary =
    selectedOptions.length === 0
      ? placeholder || 'Choose...'
      : `${selectedOptions.length} selected`;

  return (
    <View style={{ marginBottom: spacing.sm }}>
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
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ flex: 1, color: selectedOptions.length ? colors.text : colors.textMuted }}>{summary}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {selectedOptions.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs }}>
          {selectedOptions.map((o) => (
            <TouchableOpacity
              key={o.value}
              onPress={() => toggle(o.value)}
              disabled={disabled}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.chipBg,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                paddingVertical: 4,
                paddingLeft: 10,
                paddingRight: 6,
                marginRight: spacing.xs,
                marginTop: spacing.xs,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12 }}>{o.label}</Text>
              <Ionicons name="close" size={14} color={colors.textMuted} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>
                {title || 'Choose'} {selectedOptions.length ? `(${selectedOptions.length})` : ''}
              </Text>
              {selectedOptions.length > 0 && (
                <TouchableOpacity onPress={() => onChange([])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: spacing.lg }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '800' }}>Done</Text>
              </TouchableOpacity>
            </View>

            {options.length > SEARCH_THRESHOLD && <Field placeholder="Search..." value={q} onChangeText={setQ} />}

            <FlatList
              data={shown}
              keyExtractor={(o) => String(o.value)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={{ color: colors.textMuted, paddingVertical: spacing.md }}>
                  {options.length === 0 ? emptyText || 'Nothing to choose from yet.' : 'No matches.'}
                </Text>
              }
              renderItem={({ item }) => {
                const checked = values.includes(item.value);
                return (
                  <TouchableOpacity
                    onPress={() => toggle(item.value)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        borderWidth: 2,
                        borderColor: checked ? colors.primary : colors.border,
                        backgroundColor: checked ? colors.primary : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: spacing.md,
                      }}
                    >
                      {checked && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{'\u2713'}</Text>}
                    </View>
                    <Text style={{ flex: 1, color: colors.text, fontWeight: checked ? '700' : '500' }}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
