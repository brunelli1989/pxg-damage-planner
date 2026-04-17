import { useEffect, useMemo, useState } from "react";
import type { DiskLevel, Pokemon, RotationResult } from "../types";
import { findOptimalRotationAsync } from "../engine/rotationAsync";

export interface RotationState {
  result: RotationResult | null;
  loading: boolean;
  progress: { done: number; total: number };
}

export function useRotation(
  allPokemon: Pokemon[],
  selectedIds: string[],
  diskLevel: DiskLevel,
  enabled: boolean
): RotationState {
  const [result, setResult] = useState<RotationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Memoize pool so the effect doesn't re-fire every render
  const selectedKey = selectedIds.join(",");
  const pool = useMemo(
    () => allPokemon.filter((p) => selectedIds.includes(p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPokemon, selectedKey]
  );

  useEffect(() => {
    if (!enabled || pool.length === 0) {
      setResult(null);
      setLoading(false);
      setProgress({ done: 0, total: 0 });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setResult(null);
    setProgress({ done: 0, total: 0 });

    findOptimalRotationAsync(pool, diskLevel, (update) => {
      if (!cancelled) setProgress(update);
    })
      .then((res) => {
        if (!cancelled) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Rotation calculation failed:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pool, diskLevel, enabled]);

  return { result, loading, progress };
}
