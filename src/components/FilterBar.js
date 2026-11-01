// A search box plus an optional From / To date range, for the list screens
// (Uploads, Audit visits). Leave the dates empty for "all dates".
//
//   <FilterBar query={q} onQuery={setQ} from={f} onFrom={setF} to={t} onTo={setT}
//              placeholder="Search..." />
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { DateField, Field } from './UI';
import { colors, spacing } from '../theme';

export default function FilterBar({ query, onQuery, from, onFrom, to, onTo, placeholder }) {
  const active = !!(query || from || to);
  return (
    <View>
      <Field value={query} onChangeText={onQuery} placeholder={placeholder || 'Search...'} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <DateField
            label="From date"
            value={from}
            onChange={(v) => {
              onFrom(v);
              if (to && to < v) onTo(v); // keep the range in order
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <DateField
            label="To date"
            value={to}
            onChange={(v) => {
              onTo(v);
              if (from && from > v) onFrom(v);
            }}
          />
        </View>
      </View>
      {active ? (
        <TouchableOpacity
          onPress={() => {
            onQuery('');
            onFrom('');
            onTo('');
          }}
          style={{ alignSelf: 'flex-end', marginBottom: spacing.sm }}
        >
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Clear filters</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
