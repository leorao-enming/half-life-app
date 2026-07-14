import type { LogEntry } from '../store/useBioStore';

const DAY_MS = 86_400_000;

export interface CurfewStamp {
  id: string;
  label: string;
  latestHour: number | null;
  drinkCount: number;
  detail: CurfewStampDetail;
}

export type StampMotif = 'orbit' | 'wave' | 'beam' | 'ripple' | 'constellation' | 'quiet';

export interface CurfewStampDetail {
  motif: StampMotif;
  accent: string;
  secondary: string;
  title: string;
  totalMg: number;
}

export interface DrinkStamp {
  id: string;
  label: string;
  timestamp: number;
  amountMg: number;
  activePercent: number;
  impactsUntilMs: number;
  detail: CurfewStampDetail;
}

const STAMP_COLORS = {
  coffee: '#BF9040',
  tea: '#5DC4BC',
  energy: '#A77AD9',
  cola: '#7C93C9',
  quiet: '#706B64',
} as const;

function drinkKind(label: string): 'coffee' | 'tea' | 'energy' | 'cola' {
  const name = label.toLowerCase();
  if (name.includes('tea') || name.includes('matcha')) return 'tea';
  if (name.includes('energy')) return 'energy';
  if (name.includes('cola')) return 'cola';
  return 'coffee';
}

/** Derives the visual stamp from the drinks actually recorded in one period. */
export function createCurfewStampDetail(logs: LogEntry[]): CurfewStampDetail {
  if (!logs.length) {
    return { motif: 'quiet', accent: STAMP_COLORS.quiet, secondary: STAMP_COLORS.quiet, title: 'Quiet night', totalMg: 0 };
  }

  const kinds = new Set(logs.map((log) => drinkKind(log.label)));
  const totalMg = Math.round(logs.reduce((sum, log) => sum + log.amountMg, 0));
  if (kinds.size > 1) {
    return { motif: 'constellation', accent: STAMP_COLORS.coffee, secondary: STAMP_COLORS.tea, title: 'Mixed signals', totalMg };
  }

  const kind = [...kinds][0];
  const config = {
    coffee: { motif: 'orbit' as const, title: logs.some((log) => log.label.toLowerCase().includes('latte')) ? 'Milk mist arc' : 'Wake orbit' },
    tea: { motif: 'wave' as const, title: 'Slow-release wave' },
    energy: { motif: 'beam' as const, title: 'Late-window warning' },
    cola: { motif: 'ripple' as const, title: 'Faint ripple' },
  }[kind];
  return { motif: config.motif, accent: STAMP_COLORS[kind], secondary: STAMP_COLORS.quiet, title: config.title, totalMg };
}

/** Generates a unique time stamp for every recorded caffeine drink. */
export function buildDrinkStamps(logs: LogEntry[], halfLifeHours: number, nowMs: number): DrinkStamp[] {
  return logs
    .filter((log) => log.substanceType === 'caffeine')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 4)
    .map((log) => {
      const elapsedHours = Math.max(0, (nowMs - log.timestamp) / 3_600_000);
      const activePercent = Math.max(0, Math.min(100, Math.round(Math.pow(.5, elapsedHours / halfLifeHours) * 100)));
      const clearanceHours = log.amountMg > 5 ? halfLifeHours * Math.log2(log.amountMg / 5) : 0;
      return {
        id: log.id,
        label: log.label,
        timestamp: log.timestamp,
        amountMg: log.amountMg,
        activePercent,
        impactsUntilMs: log.timestamp + Math.max(0, clearanceHours) * 3_600_000,
        detail: createCurfewStampDetail([log]),
      };
    });
}

/** Returns seven equally-sized, chronological windows for a selected range. */
export function buildCurfewStamps(logs: LogEntry[], rangeDays: number, nowMs = Date.now()): CurfewStamp[] {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const bucketDays = rangeDays / 7;

  return Array.from({ length: 7 }, (_, index) => {
    const start = today.getTime() - (7 - index) * bucketDays * DAY_MS + DAY_MS;
    const end = index === 6 ? nowMs : today.getTime() - (6 - index) * bucketDays * DAY_MS + DAY_MS;
    const caffeineLogs = logs
      .filter((log) => log.substanceType === 'caffeine' && log.timestamp >= start && log.timestamp < end)
      .sort((a, b) => b.timestamp - a.timestamp);
    const latest = caffeineLogs[0];
    const periodStart = new Date(start);

    return {
      id: `${start}-${end}`,
      label: rangeDays === 7
        ? periodStart.toLocaleDateString('en-US', { weekday: 'narrow' })
        : periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(' ', '\n'),
      latestHour: latest ? new Date(latest.timestamp).getHours() : null,
      drinkCount: caffeineLogs.length,
      detail: createCurfewStampDetail(caffeineLogs),
    };
  });
}

/** A real calendar-day stamp, used for today's Plan stamp and 7-day patterns. */
export function buildDailyCurfewStamp(logs: LogEntry[], dateMs = Date.now()): CurfewStamp {
  const date = new Date(dateMs);
  date.setHours(0, 0, 0, 0);
  const start = date.getTime();
  const caffeineLogs = logs
    .filter((log) => log.substanceType === 'caffeine' && log.timestamp >= start && log.timestamp < start + DAY_MS)
    .sort((a, b) => b.timestamp - a.timestamp);
  const latest = caffeineLogs[0];

  return {
    id: `day-${start}`,
    label: date.toLocaleDateString('en-US', { weekday: 'narrow' }),
    latestHour: latest ? new Date(latest.timestamp).getHours() : null,
    drinkCount: caffeineLogs.length,
    detail: createCurfewStampDetail(caffeineLogs),
  };
}

export function countLateStamps(stamps: CurfewStamp[]): number {
  return stamps.filter((stamp) => stamp.latestHour !== null && stamp.latestHour >= 17).length;
}
