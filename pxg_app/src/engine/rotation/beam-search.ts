import type { DamageConfig, DiskLevel, Lure, Pokemon, RotationResult } from "../../types";
import { lureFinalizesBox } from "../damage";
import { computeEffectiveness, getClanBonus } from "../damage/multipliers";
import { hasHardCC } from "../scoring";
import { generateLureTemplates } from "./generate";
import { postProcessSwap } from "./post-swap";
import {
  applyLure,
  buildSimContext,
  compileLures,
  emptyState,
  SimStatePool,
} from "./simulation";
import type { CompiledLure, SimContext, SimState } from "./simulation";

/**
 * Returns the minimum period P such that sequence[i] === sequence[i + P]
 * for all i (i.e., the sequence is a repetition of sequence.slice(0, P)).
 * Uses lure identity (starter.id + second?.id + type) for comparison.
 */
function lureKey(l: Lure): string {
  const extras = l.extraMembers.length
    ? ":" + l.extraMembers.map((m) => m.poke.id).sort().join(",")
    : "";
  const elixir = l.usesElixirAtk ? ":elixir" : "";
  return `${l.type}:${l.starter.id}:${l.second?.id ?? ""}${extras}${elixir}`;
}

function minPeriod(seq: CompiledLure[]): number {
  const n = seq.length;
  for (let p = 1; p <= n; p++) {
    if (n % p !== 0) continue;
    let ok = true;
    for (let i = p; i < n; i++) {
      if (lureKey(seq[i].lure) !== lureKey(seq[i - p].lure)) {
        ok = false;
        break;
      }
    }
    if (ok) return p;
  }
  return n;
}

/**
 * Elixir atk não tem penalty no score (removido 2% penalty) — engine decide puramente
 * por bph. Tiebreak: se duas rotações empatam em score, prefere a com menos elixirs.
 * Count exposto em BagRun / bestOverall.elixirCount pra o comparator secundário.
 */

/**
 * Penalty pra starter com silence (vs stun). PxG: silence é situacionalmente pior
 * que stun pra starter (não impede auto-attack melee, só skills). Prefere stun
 * sempre que silence não ganha >10% em bph — situação típica onde silence só é
 * marginalmente melhor; stun é mais seguro e preferido.
 */
const SILENCE_STARTER_PENALTY = 0.10;

// Removido: cycleHas3ConsecutiveIdentical (wrap-aware check).
// Razão: a regra bloqueava rotações válidas onde a simulação já garante viabilidade via
// waitForSkill. Ex: [A,A,X,A,Y,A] tem wrap 6→1→2 = A×3, mas se CDs de A recuperam durante
// X e Y, a rotação é feasible — e pode ser a ótima. A simulação adiciona idle quando CDs
// não recuperam, baixando bph naturalmente. O "forward block" (beam inner loop) ainda
// previne geração de [A,A,A,...] em sequência direta.

function starterUsesSilence(lure: Lure): boolean {
  // Só penaliza starter com silence-only (sem opção de stun área).
  // Se o poke tem ambos stun e silence, vai castar stun primeiro (ordem em skills array).
  const hasStunArea = lure.starter.skills.some(
    (s) => s.cc === "stun" && s.type !== "frontal"
  );
  if (hasStunArea) return false;
  return lure.starter.skills.some((s) => s.cc === "silence" && s.type !== "frontal");
}

interface BeamState {
  sim: SimState;
  sequence: CompiledLure[]; // ref to original via .lure
}

/**
 * Runs beam search to find the best rotation sequence.
 * For each cycle length, simulates 2 cycles and measures steady-state idle.
 */
export function findBestRotation(
  bag: Pokemon[],
  diskLevel: DiskLevel,
  devicePokemonId: string | null,
  options: {
    beamWidth?: number;
    maxCycleLen?: number;
    minCycleLen?: number;
    damageConfig?: DamageConfig;
  } = {}
): { idle: number; result: RotationResult; score: number } | null {
  const beamWidth = options.beamWidth ?? 120;
  const maxCycleLen = options.maxCycleLen ?? 12;
  const minCycleLen = options.minCycleLen ?? 2;

  // Device holder sempre carrega o device — damage calc do poke (em qualquer lure)
  // recebe bonus. Override pokeSetup.hasDevice=true pro holder durante essa call
  // sem mutar o config do caller. Antes isso ficava restrito a solo_device, então
  // dupla/group com o device holder como membro perdiam o bonus que é real no jogo.
  if (devicePokemonId && options.damageConfig) {
    const baseSetup = options.damageConfig.pokeSetups[devicePokemonId];
    if (baseSetup && !baseSetup.hasDevice) {
      options = {
        ...options,
        damageConfig: {
          ...options.damageConfig,
          pokeSetups: {
            ...options.damageConfig.pokeSetups,
            [devicePokemonId]: { ...baseSetup, hasDevice: true },
          },
        },
      };
    }
  }

  let lures: Lure[];
  if (options.damageConfig) {
    // Cascata: tenta lures cheap primeiro; só gera caro quando nenhum barato finaliza.
    const cfg = options.damageConfig;
    const best = cfg.mob.bestStarterElements ?? [];

    // Hard filter: se a bag tem pelo menos um starter viável cujo tipo está em
    // bestStarterElements, os demais são proibidos como starter (ainda podem ser
    // second/extra). Fallback automaticamente pra sem filtro se não sobrar lure viável.
    const starterTypeOk = (l: Lure): boolean => {
      if (best.length === 0) return true;
      const els = l.starter.elements;
      if (!els || els.length === 0) return true;
      return els.some((e) => best.includes(e));
    };
    // Hard filter: starter precisa TOMAR inefetivo (≤0.75) ou muito inefetivo (≤0.5)
    // do mob. Mesmo offtank/T1H-clã não pode lurar se recebe neutral/super effective.
    // Worst-case por mob.types (max eff) — se mob é dual e starter resiste só um tipo,
    // ainda toma o outro. Fallback automático se filtro esvazia (bag sem opção tank).
    const mobTypes = cfg.mob.types ?? [];
    const starterResistsMob = (l: Lure): boolean => {
      if (mobTypes.length === 0) return true;
      const els = l.starter.elements;
      if (!els || els.length === 0) return true;
      let maxEff = 0;
      for (const mt of mobTypes) {
        const eff = computeEffectiveness(mt, els);
        if (eff > maxEff) maxEff = eff;
      }
      return maxEff <= 0.75;
    };
    const lureSize = (l: Lure) => 1 + (l.second ? 1 : 0) + l.extraMembers.length;
    // Stun starter preferido sobre silence via SILENCE_STARTER_PENALTY (soft score penalty).
    // Antes: hard filter removia silence-starters quando stun existia — eliminava rotações
    // silence que eram objetivamente melhores (ex: Omastar silence starter num bag onde
    // o resto das lures aproveita melhor com ele ativo). Agora só o score decide.
    const filter = (ls: Lure[]) => {
      const dmgOk = ls.filter((l) => lureFinalizesBox(l, cfg, cfg.mob));
      const typeOk = dmgOk.filter(starterTypeOk);
      const resistOk = typeOk.filter(starterResistsMob);
      if (resistOk.length > 0) return resistOk;
      if (typeOk.length > 0) return typeOk;
      return dmgOk;
    };

    // Gera TODOS os tiers de lure (solo + dupla + dupla+elixir + group) de uma vez.
    // Antes: cascading greedy parava no primeiro tier que finalizava — causava bags
    // com strong dupla+elixir (Heatmor+Chandelure) a perderem de bags com group(3)
    // 40+bph. Agora beam search recebe todas as opções e escolhe a melhor per-bph.
    const genOpts = {
      hunt: cfg.hunt,
      clan: cfg.clan,
      includeDuplaElixir: true,
      includeGroup: true,
      allowElixirAtk: cfg.useElixirAtk ?? true,
      reviveTier: cfg.revive ?? "none",
    };
    lures = filter(generateLureTemplates(bag, devicePokemonId, genOpts));

    // Regra de força do player: "a partir do momento que o player consegue finalizar
    // com 3 pokes é possível lurar com T1H". Se nenhuma lure de ≤3 membros finaliza,
    // o player é "fraco" → starter precisa ter skill com def:true (offtank real).
    // T1H burst_dd sem def skill fica banido de ser starter nesse caso.
    const hasSmallLure = lures.some((l) => lureSize(l) <= 3);
    if (!hasSmallLure) {
      const withDef = lures.filter((l) =>
        l.starter.skills.some((s) => s.def === true)
      );
      if (withDef.length > 0) lures = withDef;
    }
  } else {
    lures = generateLureTemplates(bag, devicePokemonId);
  }
  if (lures.length === 0) return null;

  const ctx = buildSimContext(bag);
  const compiled = compileLures(lures, ctx, options.damageConfig?.mob, options.damageConfig?.clan);
  const pool = new SimStatePool(ctx);

  let beam: BeamState[] = compiled.map((c) => {
    const sim = pool.acquireFresh();
    applyLure(sim, c, diskLevel);
    return { sim, sequence: [c] };
  });

  let bestOverall: { idle: number; result: RotationResult; score: number; elixirCount: number } | null = null;

  // Scoring cheap: sim.clock / steps.length já é um bom proxy do tempo-por-lure (warmup
  // afeta todos candidatos igualmente). evaluateCycle só roda no top do step, não em cada
  // candidato — cortava ~95% do tempo do beam search.
  const REFINE_TOP = 4;

  for (let step = 1; step < maxCycleLen; step++) {
    const candidates: BeamState[] = [];
    for (const state of beam) {
      const seq = state.sequence;
      const len = seq.length;
      // Regra: no máximo 2 lures IDÊNTICAS consecutivas (mesmo starter + mesmos membros
      // + mesmo finisher). Evita o padrão mecânico "3x solo_device enfileiradas" mas
      // permite "Heatmor+A, Heatmor+B, Heatmor+C" (starter igual, composição diferente).
      const blockLure = (len >= 2 && seq[len - 1] === seq[len - 2]) ? seq[len - 1] : null;
      for (const c of compiled) {
        if (c === blockLure) continue;
        const newSim = pool.acquireClone(state.sim);
        applyLure(newSim, c, diskLevel);
        candidates.push({
          sim: newSim,
          sequence: [...seq, c],
        });
      }
    }

    // Release parent states — candidates já têm clones independentes.
    for (const old of beam) pool.release(old.sim);

    const scoredCheap = candidates.map((cand) => {
      const tpl = cand.sim.clock / cand.sim.steps.length;
      let sumResist = 0;
      let elixirCount = 0;
      let silenceStarterCount = 0;
      for (const c of cand.sequence) {
        sumResist += c.starterResistFactor;
        if (c.lure.usesElixirAtk) elixirCount++;
        if (starterUsesSilence(c.lure)) silenceStarterCount++;
      }
      const avgResist = sumResist / cand.sequence.length;
      const n = cand.sequence.length;
      // Silence starter vira 2º escolha vs stun (stun é mais seguro pra tankar auto-attack).
      const silencePenalty = 1 + (silenceStarterCount / n) * SILENCE_STARTER_PENALTY;
      return { cand, score: tpl * avgResist * silencePenalty, elixirCount };
    });
    // Primary: score ascending. Tiebreak: elixir count ascending (prefere menos consumível).
    scoredCheap.sort((a, b) => a.score - b.score || a.elixirCount - b.elixirCount);
    beam = scoredCheap.slice(0, beamWidth).map((s) => s.cand);

    // Release candidates que não entraram no beam
    for (let i = beamWidth; i < scoredCheap.length; i++) {
      pool.release(scoredCheap[i].cand.sim);
    }

    // Refine top-N com evaluateCycle (steady-state preciso) só pra tracking do bestOverall.
    // bestOverall.score inclui o starterResistFactor pra manter consistência com o beam ranking.
    if (step + 1 >= minCycleLen) {
      const topN = scoredCheap.slice(0, REFINE_TOP);
      for (const s of topN) {
        const period = minPeriod(s.cand.sequence);
        const truePeriodSeq = s.cand.sequence.slice(0, period);
        const ev = evaluateCycle(truePeriodSeq, diskLevel, ctx, pool);
        const tpl = ev.result.totalTime / truePeriodSeq.length;
        let sumResist = 0;
        let elixirCount = 0;
        let silenceStarterCount = 0;
        for (const c of truePeriodSeq) {
          sumResist += c.starterResistFactor;
          if (c.lure.usesElixirAtk) elixirCount++;
          if (starterUsesSilence(c.lure)) silenceStarterCount++;
        }
        const n2 = truePeriodSeq.length;
        const silencePenalty = 1 + (silenceStarterCount / n2) * SILENCE_STARTER_PENALTY;
        const adjustedTpl = tpl * (sumResist / n2) * silencePenalty;
        // Primary: lower score wins. Tiebreak: fewer elixirs wins (consumível).
        const EPSILON = 1e-9;
        const better = !bestOverall
          || adjustedTpl < bestOverall.score - EPSILON
          || (Math.abs(adjustedTpl - bestOverall.score) < EPSILON
              && elixirCount < bestOverall.elixirCount);
        if (better) {
          bestOverall = {
            idle: ev.idlePerCycle,
            result: ev.result,
            score: adjustedTpl,
            elixirCount,
          };
        }
      }
    }
  }

  if (!bestOverall) return null;

  // Post-process: tenta trocar pokes equivalentes por outros com mais dano (held/boost
  // mais alto, calibração maior) sem perder b/h. Roda só quando damageConfig disponível
  // — sem ele não dá pra avaliar dano da lure.
  let finalResult = bestOverall.result;
  if (options.damageConfig) {
    finalResult = postProcessSwap(finalResult, bag, options.damageConfig, diskLevel);
  }

  return { idle: bestOverall.idle, result: finalResult, score: bestOverall.score };
}

/**
 * Evaluates a cycle by running it twice back-to-back and measuring
 * idle time in the second cycle. Returns null if any lure is infeasible.
 */
function evaluateCycle(
  cycle: CompiledLure[],
  diskLevel: DiskLevel,
  ctx: SimContext,
  pool?: SimStatePool
): { idlePerCycle: number; result: RotationResult } {
  const sim = pool ? pool.acquireFresh() : emptyState(ctx);

  // Cycle 1: warmup
  for (const c of cycle) {
    applyLure(sim, c, diskLevel);
  }

  // Cycle 2: measure
  const cycle2Start = sim.clock;
  const cycle2IdleStart = sim.totalIdle;
  const cycle2StepsStart = sim.steps.length;

  for (const c of cycle) {
    applyLure(sim, c, diskLevel);
  }

  const cycle2End = sim.clock;
  const cycle2Idle = sim.totalIdle - cycle2IdleStart;
  const cycle2Steps = sim.steps
    .slice(cycle2StepsStart)
    .map((s) => ({
      ...s,
      timeStart: s.timeStart - cycle2Start,
      timeEnd: s.timeEnd - cycle2Start,
    }));

  const selectedIds = Array.from(
    new Set(
      cycle.flatMap((c) => [
        c.lure.starter.id,
        c.lure.second?.id,
        ...c.lure.extraMembers.map((m) => m.poke.id),
      ].filter(Boolean) as string[])
    )
  );

  const deviceLure = cycle.find((c) => c.lure.usesDevice);

  if (pool) pool.release(sim);

  return {
    idlePerCycle: cycle2Idle,
    result: {
      steps: cycle2Steps,
      totalTime: cycle2End - cycle2Start,
      totalIdle: cycle2Idle,
      cycleNumber: 2,
      selectedIds,
      devicePokemonId: deviceLure ? deviceLure.lure.starter.id : null,
    },
  };
}

/**
 * For a given bag, tries each T1H with CC as device holder (and also no device).
 * Returns best rotation across all device options.
 */
export function findBestForBag(
  bag: Pokemon[],
  diskLevel: DiskLevel,
  options?: {
    beamWidth?: number;
    maxCycleLen?: number;
    minCycleLen?: number;
    damageConfig?: DamageConfig;
  }
): { idle: number; result: RotationResult; score: number } | null {
  // Device: qualquer poke com HardCC pode carregar device. Ranking por dano efetivo
  // (soma de pw × clã × eff de cada skill). Limita a top-3 pra controlar search space.
  // Motivo: T1H sem eff×2 (ex: Sh.Ramp rock vs electric neutro) perde pra T2 ground×2.
  const cfg = options?.damageConfig;
  const mobTypes = cfg?.mob.types ?? [];
  const clan = cfg?.clan ?? null;
  const scorePoke = (p: Pokemon): number => {
    return p.skills.reduce((sum, sk) => {
      const pw = sk.power ?? 0;
      if (pw === 0) return sum;
      const el = sk.element;
      const clãMult = el && clan ? 1 + getClanBonus(clan, el) : 1;
      const eff = el && mobTypes.length ? computeEffectiveness(el, mobTypes) : 1;
      return sum + pw * clãMult * eff;
    }, 0);
  };
  const ccCandidates = bag
    .filter((p) => hasHardCC(p))
    .map((p) => ({ id: p.id, score: scorePoke(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.id);
  const deviceCandidates: (string | null)[] = [null, ...ccCandidates];

  // User hint: se o usuário marcou hasDevice=true em algum poke no PokeSetupEditor,
  // garantimos que ele entra na lista (mesmo se não for top-3 por eff).
  const userDesignated = bag.find(
    (p) => cfg?.pokeSetups?.[p.id]?.hasDevice === true && hasHardCC(p)
  );
  if (userDesignated && !deviceCandidates.includes(userDesignated.id)) {
    deviceCandidates.push(userDesignated.id);
  }

  let best: { idle: number; result: RotationResult; score: number } | null = null;
  let bestScore = Infinity;
  for (const deviceId of deviceCandidates) {
    const res = findBestRotation(bag, diskLevel, deviceId, options);
    if (res && res.score < bestScore) {
      bestScore = res.score;
      best = res;
    }
  }
  return best;
}
