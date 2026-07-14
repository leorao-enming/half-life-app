import { useEffect, useMemo, useState } from 'react';
import { caffeineSnapshot } from '../src/domain/caffeine';
import {
  selectAllLogs,
  selectCafFactor,
  selectHealthKitMultiplier,
  useBioStore,
} from '../src/store/useBioStore';

/** Shared, minute-granularity clock for caffeine views. */
export function useCaffeineSnapshot() {
  const logs = useBioStore(selectAllLogs);
  const caffeineFactor = useBioStore(selectCafFactor);
  const healthKitMultiplier = useBioStore(selectHealthKitMultiplier);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // A freshly recorded drink may have a timestamp a few milliseconds newer
  // than the minute clock. Refresh immediately so every caffeine view updates
  // on the same render cycle instead of waiting for the next tick.
  useEffect(() => {
    setNowMs(Date.now());
  }, [logs, caffeineFactor, healthKitMultiplier]);

  return useMemo(() => ({
    ...caffeineSnapshot(logs, caffeineFactor, healthKitMultiplier, nowMs),
    logs,
    nowMs,
  }), [caffeineFactor, healthKitMultiplier, logs, nowMs]);
}
