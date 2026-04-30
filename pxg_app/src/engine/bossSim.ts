import type { DamageConfig, Pokemon, PokemonElement, XAtkTier } from "../types";
import { computeSkillDamage, resolveSkillPower } from "./damage";

export const DEFAULT_SIM_DURATION = 600;
const CAST_TIME = 1;

export type HeldKindShort = "x-attack" | "x-boost" | "x-critical";
export type DeviceKindShort = "none" | "x-boost" | "x-critical";

/** Tier → % de crit do X-Critical (wiki PxG). T1=8% até T8=27%. */
export const X_CRITICAL_PCT_BY_TIER: Record<XAtkTier, number> = {
  0: 0, 1: 8, 2: 10, 3: 12, 4: 14, 5: 16, 6: 20, 7: 24, 8: 27,
};

export interface PokeHeld {
  boost: number;
  // X-Held do poke (slot do bicho)
  heldKind: HeldKindShort;
  heldTier: XAtkTier;       // x-attack/x-boost OU x-critical (vira % via X_CRITICAL_PCT_BY_TIER)
  // Device (slot do char, separado)
  deviceKind: DeviceKindShort;
  deviceTier: XAtkTier;     // x-boost OU x-critical (mesma lógica)
}

export const DEFAULT_HELD: PokeHeld = {
  boost: 70,
  heldKind: "x-attack",
  heldTier: 8,
  deviceKind: "none",
  deviceTier: 0,
};

export interface SkillRow {
  name: string;
  element: string;
  cooldown: number;
  power: number;
  danoPerCast: number;
  casts: number;
  totalDmg: number;
  playerNote?: string;
}

export interface PokeRow {
  poke: Pokemon;
  held: PokeHeld;
  totalDmg: number;
  meleeDmg: number;
  meleeIncludedInTotal: boolean;
  skillsDmg: number;
  totalCasts: number;
  meleeHits: number;
  skillRows: SkillRow[];
}

/** True se o poke tem ao menos uma skill com `power` EXPLÍCITO calibrado (>0).
 *  NÃO usa o fallback tier-based de resolveSkillPower — pokes sem calibração
 *  in-game ficam fora da Compare (caso contrário teríamos defaults inflados
 *  vs valores reais medidos). */
export function pokeHasCalibratedDamage(poke: Pokemon): boolean {
  return poke.skills.some((s) => s.power !== undefined && s.power > 0);
}

/** Skill conta como calibrada na sim de boss apenas se tem `power` explícito.
 *  Skills sem power (que cairiam no fallback tier) contribuem 0 — assim a
 *  comparação só conta dano realmente medido in-game. */
function hasExplicitPower(skill: { power?: number }): boolean {
  return skill.power !== undefined && skill.power > 0;
}

/**
 * Boss fights não aplicam bônus de clã, então clan é forçado a null.
 * targetTypes define o(s) elemento(s) do alvo — engine aplica eff (PxG piecewise).
 * defFactor = 1 (boss já tem stats próprios, eff cobre matchup).
 * foodAtkPct: bônus de food já dobrado pelo boss (caller calcula 2× quando aplicável).
 */
export function buildBossDamageConfig(
  playerLvl: number,
  held: PokeHeld,
  pokeId: string,
  targetTypes: PokemonElement[],
  foodAtkPct: number = 0
): DamageConfig {
  // X-Critical não afeta dmg (só crit pós-multiplier no caller), mapeia pra "none" no engine.
  const pokeHeldItem =
    held.heldKind === "x-critical"
      ? { kind: "none" as const, tier: 0 as XAtkTier }
      : { kind: held.heldKind, tier: held.heldTier };
  const deviceHeldItem =
    held.deviceKind === "x-boost"
      ? { kind: "x-boost" as const, tier: held.deviceTier }
      : { kind: "x-attack" as const, tier: 0 as XAtkTier }; // none/x-critical = dmg-neutro
  const hasDevice = held.deviceKind !== "none";
  return {
    playerLvl,
    clan: null,
    hunt: "300",
    mob: { name: "target", types: targetTypes, hp: 0, defFactor: 1 },
    device: deviceHeldItem,
    pokeSetups: {
      [pokeId]: {
        boost: held.boost,
        held: pokeHeldItem,
        hasDevice,
      },
    },
    skillCalibrations: {},
    foodAtkPct,
  };
}

/** Janela de self-buff ativa durante a sim. Usada pra multiplicar skills/melee
 *  do mesmo poke por `mult` enquanto `t ∈ [startedAt, expiresAt)`.
 *  `appliesTo` undefined = afeta todas skills + melee; senão filtra. */
interface BuffWindow {
  skillIdx: number;
  startedAt: number;
  expiresAt: number;
  mult: number;
  appliesTo?: {
    skills?: string[];
    melee?: boolean;
  };
}

type BuffContext = { kind: "skill"; name: string } | { kind: "melee" };

/** Verifica se a window aplica no contexto (skill específica ou melee). */
function buffApplies(b: BuffWindow, ctx: BuffContext): boolean {
  if (!b.appliesTo) return true; // sem filtro = afeta tudo
  if (ctx.kind === "melee") return b.appliesTo.melee === true;
  return b.appliesTo.skills?.includes(ctx.name) === true;
}

/** Multiplicador efetivo no tempo `t` pro contexto — produto de buffs ativos que aplicam. */
function currentMultAt(time: number, buffs: BuffWindow[], ctx: BuffContext): number {
  let mult = 1;
  for (const b of buffs) {
    if (b.startedAt > time || b.expiresAt <= time) continue;
    if (!buffApplies(b, ctx)) continue;
    mult *= b.mult;
  }
  return mult;
}

/** True se a skill é relevante pra sim — tem dano calibrado OU buffEffect (window)
 *  OU buff:"next" (próxima skill ×1.5, ex: Nasty Plot, Charge, Hone Claws). */
function hasSimRelevance(skill: { power?: number; buffEffect?: unknown; buff?: string | null }): boolean {
  return (
    (skill.power !== undefined && skill.power > 0) ||
    skill.buffEffect !== undefined ||
    skill.buff === "next"
  );
}

/** Multiplier aplicado pela skill anterior se ela tinha buff:"next" (Nasty Plot etc). */
const BUFF_NEXT_MULT = 1.5;

/**
 * Simula `duration` segundos de casting greedy:
 * - A cada segundo: prefere castar buff window não-ativo se ready; senão skill
 *   de maior dano disponível.
 * - Skills com `buffEffect` ativam window (ex: Rage ×2 por 20s). Damage casts
 *   dentro da window são multiplicados pelo `mult` ativo.
 * - CD começa após o cast (clock + cd + cast_time).
 */
function simulateBossFight(
  poke: Pokemon,
  cfg: DamageConfig,
  duration: number
): {
  totalDmg: number;
  totalCasts: number;
  perSkill: Map<string, { casts: number; dmg: number }>;
  buffCasts: BuffWindow[];
} {
  // Inclui skills com power explícito E skills com buffEffect (window). Skills só
  // com `buff:"next"` simplificado (sem buffEffect) ficam de fora — só rotação usa.
  const allSkills = poke.skills.filter(hasSimRelevance);
  if (allSkills.length === 0) {
    return { totalDmg: 0, totalCasts: 0, perSkill: new Map(), buffCasts: [] };
  }

  const skillData = allSkills.map((skill) => {
    const isWindow = skill.buffEffect !== undefined;
    const isBuffNext = skill.buff === "next";
    const hasDamage = skill.power !== undefined && skill.power > 0;
    const power = hasDamage ? resolveSkillPower(skill, poke) : 0;
    const baseDano = hasDamage
      ? computeSkillDamage(cfg, poke, skill, cfg.mob, { skillPower: power })
      : 0;
    return { skill, baseDano, isWindow, isBuffNext, hasDamage };
  });
  // Ordena por dano desc — pure buffs (hasDamage=false) ficam no fim, mas o loop
  // escolhe window/buff:next explicitamente antes de damage.
  skillData.sort((a, b) => b.baseDano - a.baseDano);

  const cooldowns = new Array<number>(skillData.length).fill(0);
  const casts = new Array<number>(skillData.length).fill(0);
  const dmgs = new Array<number>(skillData.length).fill(0);
  const buffCasts: BuffWindow[] = [];
  // Flag ativa quando a última skill castada tinha buff:"next". A próxima damage
  // cast aplica ×1.5 e reseta o flag.
  let buffNextPending = false;

  let t = 0;
  let totalDmg = 0;
  let totalCasts = 0;

  while (t < duration) {
    let pickedIdx = -1;

    // 1. Window buff ready e não ativo → priorizar (maximiza uptime). Inclui híbridos
    //    (skill com dano + window) — vale castar mesmo que dano seja menor pra ativar.
    for (let i = 0; i < skillData.length; i++) {
      if (!skillData[i].isWindow) continue;
      if (cooldowns[i] > t) continue;
      const stillActive = buffCasts.some((b) => b.skillIdx === i && b.expiresAt > t);
      if (stillActive) continue;
      pickedIdx = i;
      break;
    }

    // 2. Pure buff:"next" ready e flag não pendente → cast pra setar flag (Nasty Plot).
    //    Híbridas (damage + buff:next) caem no path 3 — castam pelo dano e armam flag.
    if (pickedIdx < 0 && !buffNextPending) {
      for (let i = 0; i < skillData.length; i++) {
        const s = skillData[i];
        if (!s.isBuffNext || s.hasDamage || s.isWindow) continue;
        if (cooldowns[i] > t) continue;
        pickedIdx = i;
        break;
      }
    }

    // 3. Senão, damage skill de maior dano que esteja ready.
    if (pickedIdx < 0) {
      for (let i = 0; i < skillData.length; i++) {
        if (!skillData[i].hasDamage) continue;
        if (cooldowns[i] <= t) {
          pickedIdx = i;
          break;
        }
      }
    }

    if (pickedIdx < 0) {
      // Espera o próximo CD.
      const futureCDs = cooldowns.filter((c) => c > t);
      if (futureCDs.length === 0) break;
      t = Math.min(...futureCDs);
      continue;
    }

    const sd = skillData[pickedIdx];
    casts[pickedIdx]++;

    // 1. Aplica dano (se houver). Window/buff:next vigentes no momento já estão
    //    em buffCasts/buffNextPending — esta cast NÃO se beneficia da própria window.
    if (sd.hasDamage) {
      const windowMult = currentMultAt(t, buffCasts, { kind: "skill", name: sd.skill.name });
      const nextMult = buffNextPending ? BUFF_NEXT_MULT : 1;
      const dano = sd.baseDano * windowMult * nextMult;
      dmgs[pickedIdx] += dano;
      totalDmg += dano;
      if (buffNextPending) buffNextPending = false;
    }

    // 2. Registra própria window (pós-cast — afeta próximas casts, não esta).
    if (sd.isWindow) {
      const eff = sd.skill.buffEffect!;
      buffCasts.push({
        skillIdx: pickedIdx,
        startedAt: t,
        expiresAt: t + eff.durationSeconds,
        mult: eff.mult,
        appliesTo: eff.appliesTo,
      });
    }

    // 3. Arma buff:next pra próxima cast.
    if (sd.isBuffNext) buffNextPending = true;

    cooldowns[pickedIdx] = t + sd.skill.cooldown;
    totalCasts++;
    t += CAST_TIME;
  }

  const perSkill = new Map<string, { casts: number; dmg: number }>();
  skillData.forEach((sd, i) => {
    perSkill.set(sd.skill.name, { casts: casts[i], dmg: dmgs[i] });
  });
  return { totalDmg, totalCasts, perSkill, buffCasts };
}

function computePokeRow(
  poke: Pokemon,
  held: PokeHeld,
  playerLvl: number,
  targetTypes: PokemonElement[],
  duration: number,
  foodAtkPct: number
): PokeRow {
  const damageSkills = poke.skills.filter(hasExplicitPower);
  const cfg = buildBossDamageConfig(playerLvl, held, poke.id, targetTypes, foodAtkPct);
  const sim = simulateBossFight(poke, cfg, duration);

  const skillRows: SkillRow[] = damageSkills.map((skill) => {
    const power = resolveSkillPower(skill, poke);
    const danoPerCast = computeSkillDamage(cfg, poke, skill, cfg.mob, { skillPower: power });
    const stats = sim.perSkill.get(skill.name) ?? { casts: 0, dmg: 0 };
    return {
      name: skill.name,
      element: skill.element ?? "—",
      cooldown: skill.cooldown,
      power,
      danoPerCast,
      casts: stats.casts,
      totalDmg: stats.dmg,
      playerNote: skill.playerNote,
    };
  });

  let meleeHits = 0;
  let meleeDmg = 0;
  let meleeIncludedInTotal = false;
  if (poke.melee && poke.melee.attackInterval > 0) {
    meleeHits = Math.floor(duration / poke.melee.attackInterval);
    const meleeSkill = {
      name: "Auto-attack",
      cooldown: poke.melee.attackInterval,
      type: "target" as const,
      cc: null,
      buff: null,
      element: poke.melee.element,
      power: poke.melee.power,
    };
    const meleeDmgPerHit = computeSkillDamage(cfg, poke, meleeSkill, cfg.mob, { skillPower: poke.melee.power });
    if (sim.buffCasts.length > 0) {
      // Soma per-hit aplicando buff window vigente em cada hit (filtrando por
      // appliesTo.melee — Pursuit afeta melee, Rage também por default).
      let total = 0;
      for (let h = 1; h <= meleeHits; h++) {
        const hitT = h * poke.melee.attackInterval;
        total += meleeDmgPerHit * currentMultAt(hitT, sim.buffCasts, { kind: "melee" });
      }
      meleeDmg = total;
    } else {
      meleeDmg = meleeDmgPerHit * meleeHits;
    }
    meleeIncludedInTotal = poke.melee.kind === "ranged";
  }

  return {
    poke,
    held,
    totalDmg: sim.totalDmg + (meleeIncludedInTotal ? meleeDmg : 0),
    meleeDmg,
    meleeIncludedInTotal,
    skillsDmg: sim.totalDmg,
    totalCasts: sim.totalCasts,
    meleeHits,
    skillRows,
  };
}

/**
 * Cache de PokeRow per (poke, held, playerLvl, target, duration, foodAtkPct).
 * Mudar held de UM poke só invalida a entrada dele — outros reusam cache.
 * foodAtkPct entra na key porque afeta o multiplier `helds` na fórmula.
 */
export function createPokeRowCache() {
  const cache = new Map<string, PokeRow>();
  return {
    get(
      poke: Pokemon,
      held: PokeHeld,
      playerLvl: number,
      targetTypes: PokemonElement[],
      duration: number,
      foodAtkPct: number = 0
    ): PokeRow {
      // X-Critical não afeta dmg (crit é pós-mult). Mas heldKind/deviceKind importam —
      // mudam como o tier é interpretado (atk%/boost vs crit%).
      const key = `${poke.id}|${held.boost}|${held.heldKind}|${held.heldTier}|${held.deviceKind}|${held.deviceTier}|${playerLvl}|${targetTypes.join(",")}|${duration}|${foodAtkPct}`;
      let row = cache.get(key);
      if (!row) {
        row = computePokeRow(poke, held, playerLvl, targetTypes, duration, foodAtkPct);
        cache.set(key, row);
      }
      return row;
    },
    clear() {
      cache.clear();
    },
  };
}
