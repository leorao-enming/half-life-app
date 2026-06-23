# Half-Life

A personal iOS bio-state tracking app. The question it answers isn't _"what did I consume?"_ — it's _"what is my current biological state?"_

Real-time decay kinetics model caffeine, sugar, and sodium levels in your body so you can make smarter decisions about training, sleep, and productivity.

---

## What it does

| Engine | Substance | Output |
|---|---|---|
| Stimulant | Caffeine | Active mg · clearance countdown · sleep readiness |
| Glycemic | Sugar / Carbs | Active grams · crash warning |
| Hydration & Pump | Sodium | Daily load vs. 2,300 mg limit |

All three use **first-order decay kinetics**: `C(t) = C₀ × (1/2)^(t / t½)` with per-user metabolic multipliers and optional HealthKit RHR adjustment.

---

## Screens

**Reactor** (`/`) — main dashboard  
Live SVG arc ring showing caffeine clearance countdown. Sodium and sugar load bars. FAB to open the Injector.

**Injector** (`/inject`)  
Log a dose of caffeine, sugar, or sodium. BioHazard safety gate blocks known allergens before saving.

**Analytics** (`/analytics`)  
12-hour metabolic forecast chart · 7-day caffeine load bar chart · sleep vs stimulants correlation · optimal readiness windows.

**Lab** (`/lab`)  
Bio-profile tuning — metabolism speed sliders, HealthKit sync, allergen toggles, cloud sync controls.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Expo SDK 54 · Expo Router 6 · React Native 0.81.5 |
| Language | TypeScript · React 19 |
| State | Zustand 5 with AsyncStorage persistence |
| Backend | Supabase (auth + `bio_logs` table) |
| Health | `react-native-health` (HealthKit, iOS dev build only) |
| Charts | `react-native-svg` |
| Notifications | `expo-notifications` · `expo-background-fetch` |
| Build | `expo-dev-client` (custom dev build required for HealthKit) |

---

## Architecture

```
app/
  _layout.tsx          Boot sequence: store rehydration → Supabase auth → HealthKit → notifications
  (tabs)/
    index.tsx          Reactor dashboard
    inject.tsx         Dose injector
    analytics.tsx      Charts and metrics
    lab.tsx            Bio-profile settings

src/
  store/
    useBioStore.ts     Zustand store: logs, profile, offline queue, cloud sync
  utils/
    kinetics.ts        calcDecay · calcDecaySimple · generateForecast

lib/
  supabase.ts          Supabase client
  health.ts            HealthKit init + RHR metabolic multiplier
  notifications.ts     Background clearance alerts

components/
  PredictiveChart.tsx  12-hour forecast (live store data)
  OptimalWindows.tsx   Readiness window cards
  SystemLog.tsx        Recent injection log
```

### Kinetics model

```
caffeine half-life  = 5.7 h × (1 / cafFactor) × (1 / healthKitMult)
sugar half-life     = 1.5 h
sodium half-life    = 24 h

healthKitMult = 1 − 0.3 × clamp((avgRHR − 60) / 40, 0, 1)
```

Higher resting heart rate → slower clearance → extended half-life.

---

## Getting started

### Prerequisites

- Node 18+
- Expo CLI (`npm install -g expo-cli`)
- Xcode + iOS Simulator (for iOS dev build)
- A Supabase project (optional — app works offline without it)

### Environment variables

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase table

```sql
create table bio_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  substance   text not null,
  amount_mg   numeric not null,
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table bio_logs enable row level security;

create policy "Users can manage their own logs"
  on bio_logs for all
  using (auth.uid() = user_id);
```

### Install and run

```bash
npm install

# Start Metro (Expo Go — no HealthKit)
npm start

# iOS dev build (required for HealthKit)
npm run ios
```

> **Note:** `react-native-health` is a native module. HealthKit features only work in a dev build or production build — not in Expo Go.

---

## Key implementation details

**No `Date.now()` inside Zustand selectors** — causes infinite re-render loops. All time-based decay calculations use a local `nowMs` state that ticks via `setInterval`.

**Offline-first** — injections are written locally first, queued for cloud sync, then flushed when network is available (30 s interval + foreground resume).

**Boot sequence** (`_layout.tsx`):
1. Rehydrate Zustand store from AsyncStorage (`skipHydration: true` — manual call)
2. Supabase `onAuthStateChange` → `setSupabaseUser` → triggers cloud sync
3. HealthKit auto-init on iOS → sets RHR metabolic multiplier
4. Notification permissions (deferred 2 s to avoid startup jank)
5. Offline queue flush on 30 s interval + `AppState` foreground event

---

## License

Personal project — not licensed for redistribution.
