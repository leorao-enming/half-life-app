# Half-Life App — Restore & Cleanup Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 清理死代码、恢复注释掉的启动逻辑、接入实时数据，将 app 推进到可持续迭代的稳定状态。

**Architecture:** 7 个独立任务，每个任务完成后立即可验证；先删除遗留文件降噪，再逐层恢复功能，最后接入实时图表数据。

**Tech Stack:** React Native 0.81 / Expo SDK 54 / Expo Router 6 / Zustand 5 / Supabase / react-native-svg / react-native-health

## Global Constraints

- TypeScript strict：每个 Task 结束前跑 `npx tsc --noEmit`，零错误才算完成
- 不修改 `.env`、secrets、credentials
- 不新增 npm 依赖（所有依赖已在 package.json）
- `react-native-health` 仅 iOS dev build 可用，所有调用须 Platform.OS === 'ios' 守卫
- 不在 Zustand selector 内部调用 `Date.now()`（会导致无限重渲染）
- 不 push，不 force-push，不 reset --hard，除非明确要求

---

## Task 1: 删除死代码文件

**Files:**
- Delete: `lib/store.ts`
- Delete: `lib/kinetics.ts`
- Delete: `lib/utils.ts`
- Delete: `src/screens/Dashboard.tsx`

**Interfaces:**
- Produces: 无遗留文件污染后续的 import 路径

- [ ] **Step 1: 确认无人引用**

```bash
# 在项目根运行（排除 node_modules）
grep -r "lib/store\|lib/kinetics\|lib/utils\|src/screens/Dashboard" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules .
```
预期：零输出（无引用）

- [ ] **Step 2: 删除文件**

```bash
rm lib/store.ts lib/kinetics.ts lib/utils.ts src/screens/Dashboard.tsx
```

- [ ] **Step 3: TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: remove dead code (lib/store, lib/kinetics, lib/utils, src/screens/Dashboard)"
```

---

## Task 2: 向 src/utils/kinetics.ts 添加 generateForecast

**Files:**
- Modify: `src/utils/kinetics.ts`

**Interfaces:**
- Consumes: `calcDecaySimple`, `HALF_LIVES`（已在文件内定义）
- Produces:
  ```typescript
  export interface ForecastPoint {
    hour: string;      // "0h" | "1h" | ... | "12h"
    caffeine: number;  // mg，已衰减的活跃量，>= 0
    sugar: number;     // g（原始单位 mg / 1000），>= 0
  }

  export function generateForecast(
    logs: ReadonlyArray<{ substanceType: string; amountMg: number; timestamp: number }>,
    cafFactor: number,
    healthKitMult: number,
    nowMs: number,
    hoursAhead?: number,   // 默认 12
  ): ForecastPoint[]
  ```

- [ ] **Step 1: 在文件末尾追加类型和函数**

打开 `src/utils/kinetics.ts`，在文件最末添加：

```typescript
// ─── 12-Hour Metabolic Forecast ─────────────────────────────────────────────

export interface ForecastPoint {
  /** "0h" | "1h" | ... | "12h" */
  hour: string;
  /** Active caffeine (mg) at this future point */
  caffeine: number;
  /** Active sugar (g, i.e. amountMg / 1000) at this future point */
  sugar: number;
}

/**
 * Projects caffeine and sugar levels for the next `hoursAhead` hours.
 * All timestamps are Unix epoch ms. Returns one data point per hour.
 * Safe to call with empty logs — returns all-zero series.
 */
export function generateForecast(
  logs: ReadonlyArray<{ substanceType: string; amountMg: number; timestamp: number }>,
  cafFactor: number,
  healthKitMult: number,
  nowMs: number,
  hoursAhead = 12,
): ForecastPoint[] {
  const cafHL  = (HALF_LIVES.CAFFEINE / cafFactor) * (1 / healthKitMult);
  const sugHL  = HALF_LIVES.SUGAR;
  const points: ForecastPoint[] = [];

  for (let h = 0; h <= hoursAhead; h++) {
    const t = nowMs + h * 3_600_000;

    const caffeine = logs
      .filter((l) => l.substanceType === 'caffeine' && l.timestamp <= t)
      .reduce((s, l) => s + calcDecaySimple(l.amountMg, (t - l.timestamp) / 3_600_000, cafHL), 0);

    const sugar = logs
      .filter((l) => l.substanceType === 'sugar' && l.timestamp <= t)
      .reduce((s, l) => s + calcDecaySimple(l.amountMg / 1_000, (t - l.timestamp) / 3_600_000, sugHL), 0);

    points.push({
      hour:     `${h}h`,
      caffeine: Math.round(Math.max(0, caffeine)),
      sugar:    Math.round(Math.max(0, sugar) * 10) / 10,
    });
  }

  return points;
}
```

- [ ] **Step 2: TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 3: 提交**

```bash
git add src/utils/kinetics.ts
git commit -m "feat(kinetics): add generateForecast for 12-hour metabolic projection"
```

---

## Task 3: 恢复 app/_layout.tsx 启动逻辑

**Files:**
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes:
  - `useBioStore.getState().setSupabaseUser(uid: string | null)`
  - `useBioStore.getState().setHealthKitMultiplier(m: number)`
  - `useBioStore.getState().flushOfflineQueue()`
  - `useBioStore.persist.rehydrate()`
  - `supabase` from `'../lib/supabase'`
  - `initHealthKit` from `'../lib/health'`
- Produces: 启动时完成 store rehydration、认证监听、HealthKit 初始化、通知权限

- [ ] **Step 1: 完整替换 app/_layout.tsx**

```tsx
// =============================================================================
// app/_layout.tsx  —  Root Layout
// Boot sequence (restored):
//   1. Rehydrate Zustand store from AsyncStorage
//   2. Supabase auth listener → setSupabaseUser → triggers cloud sync
//   3. HealthKit auto-init on iOS → setHealthKitMultiplier
//   4. Notification permissions (deferred 2 s to avoid startup jank)
//   5. Offline-queue flush on network restore + AppState foreground
// =============================================================================

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { initHealthKit } from '../lib/health';
import { useBioStore } from '../src/store/useBioStore';

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

console.log('[layout] hostUri:', Constants.expoConfig?.hostUri ?? '⚠ undefined');
console.log('[layout] scheme :', Constants.expoConfig?.scheme  ?? '⚠ undefined');

export default function RootLayout() {
  const hasInitRef   = useRef(false);
  const appStateRef  = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;

    // ── 1. Store rehydration ───────────────────────────────────────────────
    useBioStore.persist.rehydrate().catch(() => {});

    // ── 2. Auth listener (central — screens read store, not Supabase directly)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useBioStore.getState().setSupabaseUser(session?.user.id ?? null);
    });

    supabase.auth.getSession()
      .then(({ data }) => {
        const uid = data?.session?.user.id ?? null;
        if (uid) useBioStore.getState().setSupabaseUser(uid);
      })
      .catch(() => {});

    // ── 3. HealthKit auto-init (iOS only, non-blocking) ───────────────────
    if (Platform.OS === 'ios') {
      initHealthKit()
        .then(({ multiplier }) => {
          useBioStore.getState().setHealthKitMultiplier(multiplier);
          console.log('[layout] HealthKit multiplier:', multiplier);
        })
        .catch(() => {});
    }

    // ── 4. Notification permissions (deferred to avoid startup jank) ──────
    const notifTimer = setTimeout(async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('biohazard', {
            name:             'BioHazard Alerts',
            importance:       Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 100, 250],
            lightColor:       '#FF073A',
            sound:            'default',
          });
        }
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') await Notifications.requestPermissionsAsync();
      } catch {}
    }, 2_000);

    // ── 5. Offline queue flush (periodic + AppState foreground) ───────────
    const flushInterval = setInterval(async () => {
      try {
        if (useBioStore.getState().offlineQueue.length === 0) return;
        const net = await Network.getNetworkStateAsync();
        if (net.isConnected && net.isInternetReachable) {
          await useBioStore.getState().flushOfflineQueue();
        }
      } catch {}
    }, 30_000);

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        if (useBioStore.getState().offlineQueue.length > 0) {
          void useBioStore.getState().flushOfflineQueue();
        }
      }
      appStateRef.current = next;
    });

    // ── Splash hide ────────────────────────────────────────────────────────
    SplashScreen.hideAsync().catch(() => {});

    return () => {
      subscription.unsubscribe();
      clearTimeout(notifTimer);
      clearInterval(flushInterval);
      appStateSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#000000" />
      <Stack
        screenOptions={{
          headerShown:  false,
          animation:    'fade',
          contentStyle: { backgroundColor: '#000000' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 2: TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 3: 提交**

```bash
git add app/_layout.tsx
git commit -m "feat(layout): restore boot sequence — auth listener, HealthKit auto-init, notifications, offline flush"
```

---

## Task 4: PredictiveChart 接入实时数据

**Files:**
- Modify: `components/PredictiveChart.tsx`

**Interfaces:**
- Consumes:
  - `generateForecast` from `'../src/utils/kinetics'`（Task 2 产出）
  - `useBioStore`, `selectAllLogs`, `selectCafFactor`, `selectHealthKitMultiplier` from `'../src/store/useBioStore'`
- Produces: 图表显示用户真实注射记录的 12 小时预测；无记录时显示空状态提示

- [ ] **Step 1: 完整替换 components/PredictiveChart.tsx**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import {
  useBioStore,
  selectAllLogs,
  selectCafFactor,
  selectHealthKitMultiplier,
} from '../src/store/useBioStore';
import { generateForecast } from '../src/utils/kinetics';

const C = {
  NEON_Y:  '#FFFF33',
  BLOOD_R: '#FF073A',
  MID:     '#555555',
  DIM:     '#2A2A2A',
  TEXT:    '#FFFFFF',
} as const;

const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const IS_WEB = Platform.OS === 'web';
const WEB_BD: object = IS_WEB
  ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }
  : {};

// ── SVG path helpers ──────────────────────────────────────────────────────────

function smoothLine(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(1);
    d += ` C ${cpx} ${pts[i - 1][1].toFixed(1)}, ${cpx} ${pts[i][1].toFixed(1)}, ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  return d;
}

function smoothArea(pts: [number, number][], baseY: number): string {
  if (!pts.length) return '';
  const line  = smoothLine(pts);
  const last  = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last[0].toFixed(1)} ${baseY} L ${first[0].toFixed(1)} ${baseY} Z`;
}

// ── Inner chart ───────────────────────────────────────────────────────────────

interface ChartProps {
  chartWidth:  number;
  cafData:     number[];   // mg values, length 13
  sugarData:   number[];   // g values,  length 13
  maxCaf:      number;
  maxSugar:    number;
  hours:       string[];   // "0h" … "12h"
}

function Chart({ chartWidth, cafData, sugarData, maxCaf, maxSugar, hours }: ChartProps) {
  const CHART_H = 160;
  const PAD     = { top: 8, right: 6, bottom: 24, left: 30 };
  const plotW   = chartWidth - PAD.left - PAD.right;
  const plotH   = CHART_H - PAD.top - PAD.bottom;
  const baseY   = PAD.top + plotH;
  const step    = plotW / (hours.length - 1);

  const safeMaxCaf   = maxCaf   > 0 ? maxCaf   : 1;
  const safeMaxSugar = maxSugar > 0 ? maxSugar : 1;

  const cafPts: [number, number][] = cafData.map((v, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (v / safeMaxCaf) * plotH,
  ]);
  const sugPts: [number, number][] = sugarData.map((v, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (v / safeMaxSugar) * plotH,
  ]);

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(safeMaxCaf * f));

  return (
    <Svg width={chartWidth} height={CHART_H}>
      <Defs>
        <SvgGradient id="pcCafGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.NEON_Y}  stopOpacity={0.35} />
          <Stop offset="0.6" stopColor={C.NEON_Y}  stopOpacity={0.07} />
          <Stop offset="1"   stopColor={C.NEON_Y}  stopOpacity={0}    />
        </SvgGradient>
        <SvgGradient id="pcSugGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.BLOOD_R} stopOpacity={0.30} />
          <Stop offset="0.6" stopColor={C.BLOOD_R} stopOpacity={0.06} />
          <Stop offset="1"   stopColor={C.BLOOD_R} stopOpacity={0}    />
        </SvgGradient>
      </Defs>

      {/* Horizontal grid */}
      {[0.25, 0.5, 0.75, 1].map((f, idx) => (
        <Line
          key={idx}
          x1={PAD.left} y1={PAD.top + plotH * (1 - f)}
          x2={chartWidth - PAD.right} y2={PAD.top + plotH * (1 - f)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      {/* Y labels (caffeine mg) */}
      {yLabels.map((v, idx) => (
        <SvgText
          key={idx}
          x={PAD.left - 4}
          y={PAD.top + plotH - (v / safeMaxCaf) * plotH + 3}
          fill={C.MID} fontSize={7} textAnchor="end" fontFamily="monospace"
        >{v}</SvgText>
      ))}

      {/* X axis baseline */}
      <Line
        x1={PAD.left} y1={baseY}
        x2={chartWidth - PAD.right} y2={baseY}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />

      {/* Sugar fill + line */}
      <Path d={smoothArea(sugPts, baseY)} fill="url(#pcSugGrad)" />
      <Path d={smoothLine(sugPts)} stroke={C.BLOOD_R} strokeWidth={1.5} fill="none" />

      {/* Caffeine fill + line */}
      <Path d={smoothArea(cafPts, baseY)} fill="url(#pcCafGrad)" />
      <Path d={smoothLine(cafPts)} stroke={C.NEON_Y} strokeWidth={2} fill="none" />

      {/* X labels every 2h */}
      {hours.map((h, i) =>
        i % 2 === 0 ? (
          <SvgText
            key={h}
            x={PAD.left + i * step} y={CHART_H - 4}
            fill={C.MID} fontSize={8} textAnchor="middle" fontFamily="monospace"
          >{h}</SvgText>
        ) : null,
      )}
    </Svg>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function PredictiveChart() {
  const { width: screenW } = useWindowDimensions();
  const chartWidth = screenW - 20 * 2 - 16 * 2;

  const logs      = useBioStore(selectAllLogs);
  const cafFactor = useBioStore(selectCafFactor);
  const hkMult    = useBioStore(selectHealthKitMultiplier);

  // Refresh every minute — chart doesn't need second-level precision
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const forecast = useMemo(
    () => generateForecast(logs, cafFactor, hkMult, nowMs),
    [logs, cafFactor, hkMult, nowMs],
  );

  const cafData   = forecast.map((p) => p.caffeine);
  const sugarData = forecast.map((p) => p.sugar);
  const hours     = forecast.map((p) => p.hour);
  const maxCaf    = Math.max(...cafData, 1);
  const maxSugar  = Math.max(...sugarData, 1);

  const hasData = logs.some((l) => l.substanceType === 'caffeine' || l.substanceType === 'sugar');

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, delay: 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, delay: 100, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={[s.card, IS_WEB ? WEB_BD : {}]}>
        <View style={s.inner}>
          <View style={s.header}>
            <View>
              <Text style={s.title}>METABOLIC FORECAST</Text>
              <Text style={s.subtitle}>NEXT  12  HOURS</Text>
            </View>
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.NEON_Y }]} />
                <Text style={s.legendLabel}>CAFFEINE (MG)</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.BLOOD_R }]} />
                <Text style={s.legendLabel}>SUGAR (G)</Text>
              </View>
            </View>
          </View>

          {hasData ? (
            <Chart
              chartWidth={chartWidth}
              cafData={cafData}
              sugarData={sugarData}
              maxCaf={maxCaf}
              maxSugar={maxSugar}
              hours={hours}
            />
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyText}>NO DATA  ·  INJECT TO POPULATE FORECAST</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom:     16,
    borderRadius:     16,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.07)',
    backgroundColor:  '#0C0C0C',
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.35,
    shadowRadius:     8,
    elevation:        5,
  },
  inner: {
    padding:       16,
    paddingBottom: 12,
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   14,
  },
  title: {
    fontFamily:    MONO,
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 2,
    color:         '#FFFFFF',
  },
  subtitle: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 3,
    color:         C.MID,
    marginTop:     3,
  },
  legend: {
    flexDirection: 'row',
    gap:           12,
    alignItems:    'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  legendDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  legendLabel: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
    color:         C.MID,
  },
  empty: {
    height:         120,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 3,
    color:         C.DIM,
  },
});
```

- [ ] **Step 2: TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add components/PredictiveChart.tsx
git commit -m "feat(PredictiveChart): connect to live store data via generateForecast"
```

---

## Task 5: Analytics 周数据接入实时 logs

**Files:**
- Modify: `app/(tabs)/analytics.tsx`

**Interfaces:**
- Consumes: `useBioStore`, `selectAllLogs` from `'../../src/store/useBioStore'`
- Produces: 周图表显示用户过去 7 天真实咖啡因摄入量；无数据时显示归零柱

- [ ] **Step 1: 在 analytics.tsx 顶部添加 import**

在现有 import 区域末尾添加：
```tsx
import { useBioStore, selectAllLogs } from '../../src/store/useBioStore';
```

- [ ] **Step 2: 添加 weeklyLoad 计算工具函数**

在 `WEEKLY_DATA` 常量定义之前插入：

```tsx
// ── Weekly load from real logs ────────────────────────────────────────────────

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function startOfDayMs(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function buildWeeklyLoad(
  logs: ReadonlyArray<{ substanceType: string; amountMg: number; timestamp: number }>,
): Array<{ day: string; load: number }> {
  const now = Date.now();
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = startOfDayMs(now - (6 - i) * 86_400_000);
    const dayEnd   = dayStart + 86_400_000;
    const total    = logs
      .filter((l) => l.substanceType === 'caffeine' && l.timestamp >= dayStart && l.timestamp < dayEnd)
      .reduce((s, l) => s + l.amountMg, 0);
    return { day: DAY_LABELS[new Date(dayStart).getDay()], load: total };
  });
}
```

- [ ] **Step 3: 删除旧 WEEKLY_DATA 常量，在 AnalyticsScreen 内计算**

删除（或注释）：
```tsx
const WEEKLY_DATA = [
  { day: 'MON', load: 280 },
  ...
];
```

在 `AnalyticsScreen` 函数体内，`const insets = ...` 行之后添加：
```tsx
const logs       = useBioStore(selectAllLogs);
const weeklyData = React.useMemo(() => buildWeeklyLoad(logs), [logs]);
```

- [ ] **Step 4: 将 WeeklyBarChart 的 prop 类型改为接收数据**

将 `WeeklyBarChart` 签名从无参改为：
```tsx
function WeeklyBarChart({ chartWidth, data }: { chartWidth: number; data: Array<{ day: string; load: number }> }) {
```

函数体内把所有 `WEEKLY_DATA` 替换为 `data`。

- [ ] **Step 5: 更新调用处**

```tsx
<WeeklyBarChart chartWidth={chartWidth} data={weeklyData} />
```

- [ ] **Step 6: TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: 提交**

```bash
git add app/(tabs)/analytics.tsx
git commit -m "feat(analytics): connect weekly caffeine chart to real log data"
```

---

## Task 6: ReactorRing 恢复 SVG 弧形进度

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `Svg`, `Circle`, `Defs`, `LinearGradient`, `Stop` from `react-native-svg`（已在 package.json）
- Produces: `ReactorRing` 用真实弧形 strokeDashoffset 表示进度，而非透明度近似

- [ ] **Step 1: 在 import 区域添加 SVG import**

在 index.tsx 顶部 import 区域，在现有的 React Native import 之后添加：
```tsx
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
```

- [ ] **Step 2: 替换 ReactorRing 组件实现**

找到现有 `function ReactorRing(...)` 并完整替换：

```tsx
function ReactorRing({ progress, color }: ReactorRingProps) {
  const clamped      = Math.max(0, Math.min(1, progress));
  const size         = RING_SIZE;
  const strokeW      = 3;
  const radius       = (size - strokeW * 2 - 16) / 2;
  const cx           = size / 2;
  const cy           = size / 2;
  const circumference = 2 * Math.PI * radius;
  // Start from top (−90°): rotate SVG coordinate so 0% is at 12 o'clock
  const dashOffset   = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Defs>
        <SvgGrad id="ringGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0"   stopColor={color} stopOpacity={0.35} />
          <Stop offset="0.5" stopColor={color} stopOpacity={0.80} />
          <Stop offset="1"   stopColor={color} stopOpacity={1.00} />
        </SvgGrad>
      </Defs>

      {/* Track */}
      <Circle
        cx={cx} cy={cy} r={radius}
        stroke={`${color}18`}
        strokeWidth={strokeW + 6}
        fill="none"
      />
      {/* Glow ring */}
      <Circle
        cx={cx} cy={cy} r={radius}
        stroke={color}
        strokeWidth={strokeW + 8}
        strokeOpacity={0.08}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
      {/* Progress arc */}
      <Circle
        cx={cx} cy={cy} r={radius}
        stroke="url(#ringGrad)"
        strokeWidth={strokeW}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat(reactor): restore SVG arc progress ring with gradient stroke"
```

---

## Task 7: 认证状态集中 + index.tsx 去重

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/lab.tsx`

**Goal:** 两个屏幕不再各自调用 `supabase.auth.getSession()`，而是读取 `useBioStore` 里的 `supabaseUserId`（Root Layout 已在 Task 3 统一设置）。

**Interfaces:**
- Consumes: `useBioStore` state field `supabaseUserId: string | null`

- [ ] **Step 1: 修改 index.tsx — 用 store 替代本地 session 状态**

在 `Dashboard` 函数内找到：
```tsx
const [session, setSession] = useState<null | { user: { email?: string } }>(null);
const [sessionChecked, setSessionChecked] = useState(false);

useEffect(() => {
  supabase.auth.getSession()
    .then(({ data }) => { ... })
    .catch(...);
}, []);
```

全部删除。替换为：
```tsx
const supabaseUserId = useBioStore((s) => s.supabaseUserId);
const syncStatus     = useBioStore((s) => s.syncStatus);
const sessionChecked = syncStatus !== 'idle' || supabaseUserId !== null;
```

然后把所有 `session` 引用改为：
- `session` (truthy check) → `supabaseUserId`
- `session?.user.email` → 删除（store 目前不存邮箱，改为显示 "SIGNED IN"）

更新 `authLabel`：
```tsx
const authLabel = !sessionChecked
  ? 'CHECKING AUTH...'
  : !supabaseConfigured
    ? '⚠  SUPABASE ENV VARS MISSING'
    : supabaseUserId
      ? 'USER LOGGED IN'
      : 'GUEST MODE';
```

更新 `onFabPress`：
```tsx
const onFabPress = useCallback(() => {
  if (!supabaseUserId) {
    Alert.alert(
      'LOGIN TO SYNC',
      'You\'re in guest mode. Injections are saved locally only.\n\nLog in in THE LAB to enable cloud sync.',
      [
        { text: 'Continue as Guest', style: 'default', onPress: () => router.push('/inject') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
    return;
  }
  router.push('/inject');
}, [supabaseUserId]);
```

删除 `import { supabase } from '../../lib/supabase'`（index.tsx 不再需要直接用 supabase）。

- [ ] **Step 2: 修改 lab.tsx — 用 store 替代本地 session 状态**

在 `LabScreen` 内，删除整个：
```tsx
type SessionLike = ...;
const [session, setSession] = useState<SessionLike>(null);
const [sessionChecked, setSessionChecked] = useState(false);

useEffect(() => {
  supabase.auth.getSession()...
  supabase.auth.onAuthStateChange(...)...
  return () => subscription.unsubscribe();
}, []);
```

替换为：
```tsx
const supabaseUserId = useBioStore((s) => s.supabaseUserId);
const syncStatus     = useBioStore((s) => s.syncStatus);
const sessionChecked = syncStatus !== 'idle' || supabaseUserId !== null;
```

Loading 判断改为：
```tsx
if (!sessionChecked) { return <SafeAreaView ...><ActivityIndicator .../></SafeAreaView>; }
```

Auth gate 改为：
```tsx
if (!supabaseUserId) { return <SafeAreaView ...><AuthPanel /></SafeAreaView>; }
```

LabDashboard 调用改为（移除 userEmail prop 中对 session 的引用）：
```tsx
<LabDashboard userEmail={null} onSignOut={handleSignOut} />
```

注意：`supabase` import 在 lab.tsx 仍需保留，因为 `AuthPanel` 和 `handleSignOut` 还在用。

- [ ] **Step 3: TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add app/(tabs)/index.tsx app/(tabs)/lab.tsx
git commit -m "refactor(auth): centralize session state in useBioStore, remove per-screen getSession calls"
```

---

## Task 8: 最终检查 + Push

- [ ] **Step 1: 完整 TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: 确认文件清单**

```bash
git log --oneline
```
预期 7 个新 commit（Tasks 1–7）

- [ ] **Step 3: 添加 GitHub remote 并 push**

```bash
# 如果 Leo 已有 GitHub 仓库，替换下面的 URL：
git remote add origin https://github.com/<username>/half-life-app.git
git branch -M main
git push -u origin main
```

---

## 附录：已知遗留项（本次不处理）

| 项目 | 原因 |
|------|------|
| `CORR_DATA`（睡眠 vs 刺激物图）静态数据 | 需要 HealthKit SleepAnalysis 数据，单独任务 |
| `usePredictiveEngine` 后台任务未挂载 | 需要通知权限测试后再恢复，单独任务 |
| INJECT 屏幕显示当前活跃量 | 小 UX 改进，单独任务 |
| `LabDashboard` 不显示用户邮箱 | store 目前不存邮箱，Supabase user object 需单独读取 |
