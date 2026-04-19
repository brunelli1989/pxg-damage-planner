import type { DamageConfig, DiskLevel, Pokemon, RotationResult } from "../types";
import { findBestForBag } from "./rotation";
import { hasHardCC, hasHarden } from "./scoring";
import { ELIXIR_DEF_COOLDOWN } from "./cooldown";

export interface WorkerRequest {
  bags: Pokemon[][];
  diskLevel: DiskLevel;
  beamWidth?: number;
  maxCycleLen?: number;
  minCycleLen?: number;
  damageConfig?: DamageConfig;
}

export type WorkerMessage =
  | { type: "progress"; done: number }
  | {
      type: "result";
      bestIdle: number;
      bestResult: RotationResult | null;
    };

const HARDEN_BASE_CD = 40;  // menor skill CD comum de Harden
const MIN_ACTIVE_TIME = 20; // ~10s casts + 10s kill time

/**
 * Lower bound para time-per-lure de uma bag. Usado pra pular bags que não
 * podem bater o best-so-far ANTES de rodar o beam search.
 *
 * - Sem starter (nenhum hasHardCC): retorna Infinity → bag será pulada
 * - T1H + CC na bag: solo_device dispensa defesa → bound = max(maior CD, active)
 * - Starter com Harden: bound = max(Harden CD, active)
 * - Só starter sem Harden/device: bound = ELIXIR_DEF_COOLDOWN (210s é o gargalo)
 */
function bagTimePerLureLowerBound(bag: Pokemon[]): number {
  let minDefenseCD = ELIXIR_DEF_COOLDOWN;
  let hasValidStarter = false;
  for (const p of bag) {
    if (!hasHardCC(p)) continue;
    hasValidStarter = true;
    if (p.tier === "T1H") {
      // Pode ir solo_device → sem CD de defesa
      minDefenseCD = Math.min(minDefenseCD, MIN_ACTIVE_TIME);
    } else if (hasHarden(p)) {
      minDefenseCD = Math.min(minDefenseCD, HARDEN_BASE_CD);
    }
  }
  if (!hasValidStarter) return Infinity;
  return Math.max(minDefenseCD, MIN_ACTIVE_TIME);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { bags, diskLevel, beamWidth, maxCycleLen, minCycleLen, damageConfig } = e.data;

  let bestIdle = Infinity;
  let bestTimePerLure = Infinity;
  let bestResult: RotationResult | null = null;

  let skipped = 0;

  // Sort bags by lower bound (menor = potencialmente melhor). Rodar bags mais promissoras
  // primeiro acelera o pruning: bestTimePerLure desce rápido, demais bags são puladas.
  const bagsWithBound = bags.map((bag) => ({ bag, bound: bagTimePerLureLowerBound(bag) }));
  bagsWithBound.sort((a, b) => a.bound - b.bound);

  for (const { bag, bound } of bagsWithBound) {
    // Pruning: se o lower bound já é >= que o melhor achado, nem chama o beam
    if (bound >= bestTimePerLure) {
      skipped++;
      const progressMsg: WorkerMessage = { type: "progress", done: 1 };
      self.postMessage(progressMsg);
      continue;
    }

    const res = findBestForBag(bag, diskLevel, {
      beamWidth,
      maxCycleLen,
      minCycleLen,
      damageConfig,
    });
    if (res) {
      const tpl = res.result.totalTime / res.result.steps.length;
      if (tpl < bestTimePerLure) {
        bestTimePerLure = tpl;
        bestIdle = res.idle;
        bestResult = res.result;
      }
    }
    const progressMsg: WorkerMessage = { type: "progress", done: 1 };
    self.postMessage(progressMsg);
  }

  // Log de diagnostic — útil pra medir efetividade do pruning
  if (skipped > 0) console.log(`[worker] skipped ${skipped}/${bags.length} bags via pruning`);

  const done: WorkerMessage = { type: "result", bestIdle, bestResult };
  self.postMessage(done);
};
