import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { CurfewStampDetail } from '../src/domain/patterns';
import { alpha, color, font } from '../src/theme/tokens';

interface CurfewStampProps {
  detail: CurfewStampDetail;
  size?: number;
  showLabel?: boolean;
}

export function CurfewStamp({ detail, size = 82, showLabel = false }: CurfewStampProps) {
  const centre = size / 2;
  const outer = size * .45;
  const inner = size * .32;
  const stroke = Math.max(1, size / 68);
  const viewBox = `0 0 ${size} ${size}`;

  return (
    <View accessibilityLabel={`${detail.title}, ${detail.totalMg} milligrams of recorded caffeine`}>
      <Svg width={size} height={size} viewBox={viewBox}>
        <Circle cx={centre} cy={centre} r={outer} fill="none" stroke={alpha(detail.accent, .72)} strokeWidth={stroke} />
        <Circle cx={centre} cy={centre} r={inner} fill="none" stroke={alpha(detail.secondary, .55)} strokeWidth={stroke} />
        {detail.motif === 'orbit' && <><Circle cx={centre} cy={centre} r={size * .12} fill={alpha(detail.accent, .12)} stroke={detail.accent} strokeWidth={stroke} /><Circle cx={size * .75} cy={size * .27} r={size * .05} fill={detail.accent} /></>}
        {detail.motif === 'wave' && <Path d={`M${size*.19} ${centre} C${size*.32} ${size*.22} ${size*.45} ${size*.78} ${size*.58} ${centre} S${size*.78} ${size*.22} ${size*.84} ${size*.42}`} stroke={detail.accent} strokeWidth={stroke * 1.5} fill="none" />}
        {detail.motif === 'beam' && <><Path d={`M${centre} ${size*.18} L${centre} ${size*.82}`} stroke={detail.accent} strokeWidth={stroke * 1.8} /><Path d={`M${size*.29} ${centre} L${size*.71} ${centre}`} stroke={alpha(detail.accent, .55)} strokeWidth={stroke} /></>}
        {detail.motif === 'ripple' && <><Circle cx={centre} cy={centre} r={size * .12} fill="none" stroke={detail.accent} strokeWidth={stroke * 1.4} /><Circle cx={centre} cy={centre} r={size * .22} fill="none" stroke={alpha(detail.accent, .72)} strokeWidth={stroke} /></>}
        {detail.motif === 'constellation' && <><Circle cx={size*.33} cy={size*.6} r={size*.045} fill={detail.secondary} /><Circle cx={size*.55} cy={size*.36} r={size*.055} fill={detail.accent} /><Circle cx={size*.7} cy={size*.62} r={size*.04} fill={detail.secondary} /><Path d={`M${size*.33} ${size*.6} L${size*.55} ${size*.36} L${size*.7} ${size*.62}`} stroke={alpha(detail.accent, .7)} strokeWidth={stroke} fill="none" /></>}
        {detail.motif === 'quiet' && <Path d={`M${size*.28} ${size*.6} C${size*.42} ${size*.74} ${size*.66} ${size*.7} ${size*.73} ${size*.45}`} stroke={color.textDim} strokeWidth={stroke * 1.2} fill="none" />}
      </Svg>
      {showLabel && <Text style={styles.label}>{detail.title} · {detail.totalMg} mg</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: color.textMid, fontFamily: font.mono, fontSize: 10, letterSpacing: .4, marginTop: 4, textAlign: 'center' },
});
