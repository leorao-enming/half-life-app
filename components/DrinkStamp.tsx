import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DrinkStamp as DrinkStampModel } from '../src/domain/patterns';
import { color, font, space } from '../src/theme/tokens';
import { fmtClock } from '../src/utils/energyState';
import { CurfewStamp } from './CurfewStamp';

interface DrinkStampProps {
  stamp: DrinkStampModel;
}

export function DrinkStamp({ stamp }: DrinkStampProps) {
  return <View style={styles.row} accessibilityLabel={`${fmtClock(stamp.timestamp)} ${stamp.label}, ${stamp.amountMg} milligrams. Estimated to affect sleep until ${fmtClock(stamp.impactsUntilMs)}.`}>
    <CurfewStamp detail={stamp.detail} size={38} />
    <View style={styles.copy}>
      <Text style={styles.title}>{fmtClock(stamp.timestamp)} · {stamp.detail.title} · {stamp.amountMg} mg</Text>
      <Text style={styles.detail}>Estimated sleep impact until {fmtClock(stamp.impactsUntilMs)} · {stamp.activePercent}% remains</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 7 },
  copy: { flex: 1 },
  title: { color: color.text, fontSize: 13, lineHeight: 18 },
  detail: { color: color.textMid, fontFamily: font.mono, fontSize: 10, lineHeight: 15, marginTop: 1 },
});
