import type { DamageConfig, DiskLevel, Pokemon, RotationResult } from "../types";
import { findBestForBag } from "./rotation";
import { estimatePokeSoloDamage } from "./damage";
import { getOptimalSkillOrder, hasHardCC } from "./scoring";

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
      bestScore: number;
      bestResult: RotationResult | null;
    };

const MIN_ACTIVE_TIME = 20; // ~10s casts + 10s kill time

/**
 * Lower bound para time-per-lure de uma bag. Usado pra pular bags que não
 * podem bater o best-so-far ANTES de rodar o beam search.
 *
 * Pra cada starter válido p, o bound é `max(maxSkillCD, MIN_ACTIVE_TIME)`:
 * rotação single-poke exige T ≥ maxSkillCD (skill precisa recuperar entre casts);
 * multi-poke alterna, pode ir abaixo — pegamos `min` sobre todos os starters
 * válidos (optimistic: melhor starter define bound).
 */
function bagTimePerLureLowerBound(bag: Pokemon[]): number {
  let bestBound = Infinity;
  let hasValidStarter = false;
  for (const p of bag) {
    if (!hasHardCC(p)) continue;
    hasValidStarter = true;

    let maxSkillCD = 0;
    for (const s of p.skills) if (s.cooldown > maxSkillCD) maxSkillCD = s.cooldown;

    const pokeBound = Math.max(maxSkillCD, MIN_ACTIVE_TIME);
    if (pokeBound < bestBound) bestBound = pokeBound;
  }
  if (!hasValidStarter) return Infinity;
  return bestBound;
}

/**
 * Upper bound de dano por mob somando TODOS os pokes da bag com device+elixir.
 * É um bound solto (superestima: apenas 1 poke usa device e 1 usa elixir de fato).
 * Se esse máximo < HP_mob, nenhuma combinação finaliza a box → pula antes do beam.
 * Memoizado por poke.id pois mesmo poke aparece em muitas bags.
 */
function makeBagDamagePruner(damageConfig: DamageConfig) {
  const perPokeDmg = new Map<string, number>();
  const getDmg = (p: Pokemon): number => {
    let d = perPokeDmg.get(p.id);
    if (d === undefined) {
      d = estimatePokeSoloDamage(p, getOptimalSkillOrder(p), damageConfig, true, true);
      perPokeDmg.set(p.id, d);
    }
    return d;
  };
  const hp = damageConfig.mob.hp;
  return (bag: Pokemon[]): boolean => {
    let total = 0;
    for (const p of bag) total += getDmg(p);
    return total < hp;
  };
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { bags, diskLevel, beamWidth, maxCycleLen, minCycleLen, damageConfig } = e.data;

  let bestScore = Infinity;     // score adjusted (inclui starterResistFactor, usado pra ranking entre bags e entre workers)
  let bestRawTpl = Infinity;    // raw tpl (totalTime/steps) pro pruning por bound
  let bestResult: RotationResult | null = null;

  let skippedTime = 0;
  let skippedDmg = 0;

  // Pré-filter por dano: bags que não batem o HP_mob nem com device+elixir são descartadas.
  const cantFinalize = damageConfig ? makeBagDamagePruner(damageConfig) : null;

  // Sort bags by lower bound (menor = potencialmente melhor). Rodar bags mais promissoras
  // primeiro acelera o pruning: bestRawTpl desce rápido, demais bags são puladas.
  const bagsWithBound = bags.map((bag) => ({ bag, bound: bagTimePerLureLowerBound(bag) }));
  bagsWithBound.sort((a, b) => a.bound - b.bound);

  for (const { bag, bound } of bagsWithBound) {
    // Pruning por tempo: lower bound >= melhor raw tpl já achado.
    // IMPORTANTE: comparar raw contra raw. bestScore é adjusted (tpl × starterResistFactor),
    // mas bound é raw tpl — comparar direto skipava bags incorretamente quando o factor
    // puxava o score pra baixo (ex: rocks em Orebound = factor 0.6).
    if (bound >= bestRawTpl) {
      skippedTime++;
      const progressMsg: WorkerMessage = { type: "progress", done: 1 };
      self.postMessage(progressMsg);
      continue;
    }
    // Pruning por dano: upper bound < HP_mob (impossível finalizar)
    if (cantFinalize && cantFinalize(bag)) {
      skippedDmg++;
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
      // Rank by adjusted score (respects user's starter preference),
      // prune by raw tpl (coherent with bound).
      if (res.score < bestScore) {
        bestScore = res.score;
        bestRawTpl = res.result.totalTime / res.result.steps.length;
        bestResult = res.result;
      }
    }
    const progressMsg: WorkerMessage = { type: "progress", done: 1 };
    self.postMessage(progressMsg);
  }

  if (skippedTime + skippedDmg > 0) {
    console.log(
      `[worker] skipped ${skippedTime + skippedDmg}/${bags.length} bags ` +
      `(time=${skippedTime}, dmg=${skippedDmg})`
    );
  }

  const done: WorkerMessage = { type: "result", bestScore, bestResult };
  self.postMessage(done);
};
