import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { LogEntry } from '../src/store/useBioStore';
import { alpha, color, font, space } from '../src/theme/tokens';
import { fmtClock } from '../src/utils/energyState';

interface CaffeineWeatherProps {
  activeMg: number;
  readyAtMs: number | null;
  logs: LogEntry[];
  nowMs: number;
  halfLifeHours: number;
}

function weatherCopy(activeMg: number, readyAtMs: number | null, logs: LogEntry[], nowMs: number, halfLifeHours: number) {
  const latest = [...logs].filter((log) => log.substanceType === 'caffeine').sort((a, b) => b.timestamp - a.timestamp)[0];
  const remainingPercent = latest ? Math.round(Math.pow(.5, Math.max(0, nowMs - latest.timestamp) / 3_600_000 / halfLifeHours) * 100) : 0;
  if (!readyAtMs || activeMg <= 5) return { title: 'Clear skies tonight', detail: 'Your low-impact window is open.', accent: color.ready };
  if (latest?.label.toLowerCase().includes('energy') && new Date(latest.timestamp).getHours() >= 16) return { title: 'High-pressure warning', detail: `About ${remainingPercent}% of your latest caffeine remains. Clearing near ${fmtClock(readyAtMs)}.`, accent: color.energy };
  if (activeMg > 180) return { title: 'Heavy clouds tonight', detail: `About ${remainingPercent}% of your latest caffeine remains in your system.`, accent: color.energy };
  if (activeMg > 75) return { title: 'Cloudy, then clearing', detail: `About ${remainingPercent}% remains. Clearer after ${fmtClock(readyAtMs)}.`, accent: color.primary };
  return { title: 'Light clouds tonight', detail: `A small remaining signal settles near ${fmtClock(readyAtMs)}.`, accent: color.ready };
}

export function CaffeineWeather({ activeMg, readyAtMs, logs, nowMs, halfLifeHours }: CaffeineWeatherProps) {
  const weather = weatherCopy(activeMg, readyAtMs, logs, nowMs, halfLifeHours);
  return <View style={styles.card} accessibilityLabel={`Caffeine Weather: ${weather.title}. ${weather.detail}`}>
    <View style={styles.copy}><Text style={styles.label}>TONIGHT’S SLEEP WEATHER</Text><Text style={styles.title}>{weather.title}</Text><Text style={styles.detail}>{weather.detail}</Text></View>
    <Svg width={120} height={120} style={styles.orbits}>
      {[26, 42, 56].map((radius) => <Circle key={radius} cx={60} cy={60} r={radius} fill="none" stroke={alpha(weather.accent, .3)} strokeWidth={1} />)}
      <Circle cx={60} cy={60} r={11} fill={alpha(weather.accent, .16)} stroke={weather.accent} strokeWidth={1} />
      <Circle cx={91} cy={28} r={3} fill={weather.accent} />
    </Svg>
    <Svg width="100%" height={33} style={styles.fade}><Path d="M0 28 C36 30 43 6 74 19 S119 32 153 13 S224 5 290 24" stroke={alpha(weather.accent, .7)} strokeWidth={1.2} fill="none" /></Svg>
  </View>;
}

const styles = StyleSheet.create({
  card: { minHeight: 166, overflow: 'hidden', borderRadius: 17, borderWidth: 1, borderColor: alpha(color.text, .18), backgroundColor: alpha(color.surfaceHi, .52), padding: space.xl, marginBottom: space.lg },
  copy: { maxWidth: '64%' }, label: { color: color.textMid, fontFamily: font.mono, fontSize: 11, letterSpacing: .9 },
  title: { color: color.text, fontSize: 23, fontWeight: '400', marginTop: 9 }, detail: { color: color.textMid, fontSize: 14, lineHeight: 20, marginTop: 8 },
  orbits: { position: 'absolute', top: 15, right: 3 }, fade: { position: 'absolute', left: 0, bottom: 0 },
});
