import type { DamageConfig, DiskLevel, Lure, LureMember, Pokemon, RotationResult } from "../../types";
import { estimateLureDamagePerMob, lureFinalizesBox } from "../damage";
import { getOptimalSkillOrder, hasAnyCC, hasFrontal, hasHardCC, hasHarden, hasSilence } from "../scoring";
import { applyLure, buildSimContext, compileLures, emptyState } from "./simulation";

/**
 * Post-process swap: tenta substituir pokes da rotação por equivalentes com mais dano.
 *
 * Critério:
 * - Mesmo `role + tier`
 * - Compatibilidade com a posição (starter precisa hasHardCC + !hasFrontal + harden_se_starter_usa)
 * - Compatibilidade silence/frontal (se silence ativo, swap não pode introduzir frontal)
 * - Damage da lure resultante >= original
 * - Total time da rotação resimulada <= original (b/h não cai)
 */
export function postProcessSwap(
  result: RotationResult,
  bag: Pokemon[],
  cfg: DamageConfig,
  diskLevel: DiskLevel
): RotationResult {
  // Lista de candidates equivalentes pra cada poke (por role+tier)
  const equivalents = new Map<string, Pokemon[]>();
  for (const p of bag) {
    const sameRoleTier = bag.filter(
      (q) => q.id !== p.id && q.role === p.role && q.tier === p.tier
    );
    equivalents.set(p.id, sameRoleTier);
  }

  let currentSteps = result.steps.map((s) => ({ ...s }));
  let currentTotalTime = result.totalTime;
  let modified = true;

  // Itera até nenhum swap melhorar (max 10 iterações pra evitar loops)
  for (let iter = 0; iter < 10 && modified; iter++) {
    modified = false;

    for (let i = 0; i < currentSteps.length; i++) {
      const lure = currentSteps[i].lure;
      const swapped = trySwapInLure(lure, equivalents, cfg);
      if (!swapped) continue;

      // Resimula rotação completa pra validar b/h
      const newLures = currentSteps.map((s, j) => (j === i ? swapped : s.lure));
      const sim = simulateRotation(newLures, bag, cfg, diskLevel);
      if (!sim) continue;

      // Aceita swap se total time não piora (tolera até 0.1% de degradação por
      // ruído numérico — wait depende da max CD, então pokes equivalentes deveriam
      // ter cycle time idêntico em teoria; pequenas variações vêm de timing fracionado).
      const tolerance = currentTotalTime * 0.001;
      if (sim.totalTime <= currentTotalTime + tolerance) {
        currentSteps = sim.steps;
        currentTotalTime = sim.totalTime;
        modified = true;
        break; // recomeça o loop com nova rotação
      }
    }
  }

  if (currentTotalTime === result.totalTime && currentSteps === result.steps) {
    return result;
  }

  return {
    ...result,
    steps: currentSteps,
    totalTime: currentTotalTime,
  };
}

/**
 * Tenta swap em uma lure. Retorna nova lure se algum swap melhora dano (sem quebrar regras),
 * ou null se nada foi trocado.
 */
function trySwapInLure(
  lure: Lure,
  equivalents: Map<string, Pokemon[]>,
  cfg: DamageConfig
): Lure | null {
  const currentDmg = estimateLureDamagePerMob(lure, cfg);

  // Pokes já usados nesta lure (não pode duplicar)
  const usedIds = new Set<string>();
  usedIds.add(lure.starter.id);
  if (lure.second) usedIds.add(lure.second.id);
  for (const m of lure.extraMembers) usedIds.add(m.poke.id);

  // Tentar swap em cada posição
  const positions: ("starter" | "second" | { extraIdx: number })[] = ["starter"];
  if (lure.second) positions.push("second");
  for (let k = 0; k < lure.extraMembers.length; k++) {
    positions.push({ extraIdx: k });
  }

  for (const pos of positions) {
    const currentPoke =
      pos === "starter" ? lure.starter
        : pos === "second" ? lure.second!
          : lure.extraMembers[pos.extraIdx].poke;

    const candidates = equivalents.get(currentPoke.id) ?? [];

    for (const candidate of candidates) {
      if (usedIds.has(candidate.id)) continue;

      // Validações específicas da posição
      if (pos === "starter") {
        if (!hasHardCC(candidate)) continue;
        if (hasFrontal(candidate)) continue;
        if (lure.starterUsesHarden && !hasHarden(candidate)) continue;
      } else {
        // Second/extra: precisa hasAnyCC, EXCETO se for o finalizer (último sem CC permitido)
        const isLastExtra = typeof pos === "object"
          && pos.extraIdx === lure.extraMembers.length - 1;
        const isFinalizer = (pos === "second" && lure.extraMembers.length === 0)
          || isLastExtra;
        if (!isFinalizer && !hasAnyCC(candidate)) continue;
      }

      // Silence + frontal cross-check
      const otherSilence = anyOtherHasSilence(lure, currentPoke.id);
      if (otherSilence && hasFrontal(candidate)) continue;
      if (hasSilence(candidate)) {
        // Se candidate tem silence, nenhum outro pode ter frontal
        if (anyOtherHasFrontal(lure, currentPoke.id)) continue;
      }

      // Constrói lure substituída
      const newLure = swapPosition(lure, pos, candidate);
      const newDmg = estimateLureDamagePerMob(newLure, cfg);
      if (newDmg <= currentDmg + 1e-6) continue;
      if (!lureFinalizesBox(newLure, cfg, cfg.mob)) continue;

      return newLure;
    }
  }

  return null;
}

function swapPosition(
  lure: Lure,
  pos: "starter" | "second" | { extraIdx: number },
  newPoke: Pokemon
): Lure {
  // Recomputa skill order (silence pode mudar)
  const silenceActive = anySilence({
    ...lure,
    starter: pos === "starter" ? newPoke : lure.starter,
    second: pos === "second" ? newPoke : lure.second,
    extraMembers:
      typeof pos === "object"
        ? lure.extraMembers.map((m, idx) =>
            idx === pos.extraIdx ? { ...m, poke: newPoke } : m
          )
        : lure.extraMembers,
  });

  if (pos === "starter") {
    return {
      ...lure,
      starter: newPoke,
      starterSkills: getOptimalSkillOrder(newPoke, silenceActive),
      starterUsesHarden: hasHarden(newPoke) && lure.starterUsesHarden,
      // recompute second skills since silence may change
      secondSkills: lure.second ? getOptimalSkillOrder(lure.second, silenceActive) : [],
      extraMembers: lure.extraMembers.map((m) => ({
        poke: m.poke,
        skills: getOptimalSkillOrder(m.poke, silenceActive),
      })),
      // elixir holder may need re-pick — keep current id se ainda válido, senão fallback pro starter
      elixirAtkHolderId: lure.elixirAtkHolderId === lure.starter.id ? newPoke.id : lure.elixirAtkHolderId,
      revivePokemonId: lure.revivePokemonId === lure.starter.id ? newPoke.id : lure.revivePokemonId,
    };
  } else if (pos === "second") {
    return {
      ...lure,
      second: newPoke,
      starterSkills: getOptimalSkillOrder(lure.starter, silenceActive),
      secondSkills: getOptimalSkillOrder(newPoke, silenceActive),
      extraMembers: lure.extraMembers.map((m) => ({
        poke: m.poke,
        skills: getOptimalSkillOrder(m.poke, silenceActive),
      })),
      elixirAtkHolderId: lure.elixirAtkHolderId === lure.second?.id ? newPoke.id : lure.elixirAtkHolderId,
      revivePokemonId: lure.revivePokemonId === lure.second?.id ? newPoke.id : lure.revivePokemonId,
    };
  } else {
    const idx = pos.extraIdx;
    const oldId = lure.extraMembers[idx].poke.id;
    const newExtras: LureMember[] = lure.extraMembers.map((m, i) =>
      i === idx ? { poke: newPoke, skills: getOptimalSkillOrder(newPoke, silenceActive) } : { poke: m.poke, skills: getOptimalSkillOrder(m.poke, silenceActive) }
    );
    return {
      ...lure,
      starterSkills: getOptimalSkillOrder(lure.starter, silenceActive),
      secondSkills: lure.second ? getOptimalSkillOrder(lure.second, silenceActive) : [],
      extraMembers: newExtras,
      elixirAtkHolderId: lure.elixirAtkHolderId === oldId ? newPoke.id : lure.elixirAtkHolderId,
      revivePokemonId: lure.revivePokemonId === oldId ? newPoke.id : lure.revivePokemonId,
    };
  }
}

function anySilence(lure: Lure): boolean {
  if (hasSilence(lure.starter)) return true;
  if (lure.second && hasSilence(lure.second)) return true;
  for (const m of lure.extraMembers) {
    if (hasSilence(m.poke)) return true;
  }
  return false;
}

function anyOtherHasSilence(lure: Lure, excludeId: string): boolean {
  if (lure.starter.id !== excludeId && hasSilence(lure.starter)) return true;
  if (lure.second && lure.second.id !== excludeId && hasSilence(lure.second)) return true;
  for (const m of lure.extraMembers) {
    if (m.poke.id !== excludeId && hasSilence(m.poke)) return true;
  }
  return false;
}

function anyOtherHasFrontal(lure: Lure, excludeId: string): boolean {
  if (lure.starter.id !== excludeId && hasFrontal(lure.starter)) return true;
  if (lure.second && lure.second.id !== excludeId && hasFrontal(lure.second)) return true;
  for (const m of lure.extraMembers) {
    if (m.poke.id !== excludeId && hasFrontal(m.poke)) return true;
  }
  return false;
}

/**
 * Resimula uma sequência de lures e retorna o resultado completo (1 ciclo full).
 * Usado pra validar que b/h não piora após swap.
 */
function simulateRotation(
  lures: Lure[],
  bag: Pokemon[],
  cfg: DamageConfig,
  diskLevel: DiskLevel
): RotationResult | null {
  const ctx = buildSimContext(bag);
  const compiled = compileLures(lures, ctx, cfg.mob, cfg.clan);
  const sim = emptyState(ctx);

  // Warmup cycle
  for (const c of compiled) {
    applyLure(sim, c, diskLevel);
  }

  // Measure cycle
  const measureStart = sim.clock;
  const measureIdleStart = sim.totalIdle;
  const measureStepsStart = sim.steps.length;

  for (const c of compiled) {
    applyLure(sim, c, diskLevel);
  }

  const totalTime = sim.clock - measureStart;
  const totalIdle = sim.totalIdle - measureIdleStart;
  const steps = sim.steps.slice(measureStepsStart).map((s) => ({
    ...s,
    timeStart: s.timeStart - measureStart,
    timeEnd: s.timeEnd - measureStart,
  }));

  const selectedIds = Array.from(
    new Set(
      lures.flatMap((l) =>
        [l.starter.id, l.second?.id, ...l.extraMembers.map((m) => m.poke.id)].filter(Boolean) as string[]
      )
    )
  );
  const deviceLure = lures.find((l) => l.usesDevice);

  return {
    steps,
    totalTime,
    totalIdle,
    cycleNumber: 2,
    selectedIds,
    devicePokemonId: deviceLure ? deviceLure.starter.id : null,
  };
}
