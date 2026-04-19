import type { Pokemon, Skill } from "../types";

/**
 * Cache de propriedades derivadas das skills do pokémon.
 * Populada preguiçosamente na 1ª chamada via WeakMap — sobrevive ao structured
 * clone dos workers (cada worker repopula sua própria cache).
 */
interface PokemonCache {
  hasHardCC: boolean;
  hasHarden: boolean;
  hasSilence: boolean;
  hasFrontal: boolean;
  skillOrderNormal: Skill[];
  skillOrderSilenced: Skill[];
}

const cacheMap = new WeakMap<Pokemon, PokemonCache>();

function computeOrder(pokemon: Pokemon, silenceActiveInLure: boolean): Skill[] {
  const hasSilenceSelf = pokemon.skills.some((s) => s.cc === "silence");
  const excludeFrontal = silenceActiveInLure || hasSilenceSelf;

  const available = excludeFrontal
    ? pokemon.skills.filter((s) => s.type !== "frontal")
    : pokemon.skills.slice();

  const ccSkill = available.find((s) => s.cc !== null);
  const selfBuffs = available.filter(
    (s) => s.buff === "self" && s.cc === null
  );
  const nextBuff = available.find((s) => s.buff === "next" && s.cc === null);
  const regular = available.filter(
    (s) => s.cc === null && s.buff === null
  );

  regular.sort((a, b) => b.cooldown - a.cooldown);

  const ordered: Skill[] = [];
  if (ccSkill) ordered.push(ccSkill);
  selfBuffs.forEach((s) => ordered.push(s));
  if (nextBuff && regular.length > 0) ordered.push(nextBuff);
  regular.forEach((s) => ordered.push(s));
  if (nextBuff && regular.length === 0) ordered.push(nextBuff);

  return ordered;
}

function getCache(p: Pokemon): PokemonCache {
  let c = cacheMap.get(p);
  if (!c) {
    c = {
      // stun/silence frontal não bloqueia os 6 mobs; locked vale em qualquer tipo.
      hasHardCC: p.skills.some(
        (s) =>
          s.cc === "locked" ||
          ((s.cc === "stun" || s.cc === "silence") && s.type !== "frontal")
      ),
      // Starter dispensa Elixir Def quando tem alguma skill com flag `def: true`
      // (Harden, Intimidate, Iron Defense, etc). Fonte de verdade: a própria skill.
      hasHarden: p.skills.some((s) => s.def === true),
      hasSilence: p.skills.some((s) => s.cc === "silence" && s.type !== "frontal"),
      hasFrontal: p.skills.some((s) => s.type === "frontal"),
      skillOrderNormal: computeOrder(p, false),
      skillOrderSilenced: computeOrder(p, true),
    };
    cacheMap.set(p, c);
  }
  return c;
}

/**
 * Returns the optimal skill order for a pokemon in a lure.
 * If silence is active in the lure, frontal skills are excluded.
 */
export function getOptimalSkillOrder(
  pokemon: Pokemon,
  silenceActiveInLure = false
): Skill[] {
  const cache = getCache(pokemon);
  return silenceActiveInLure ? cache.skillOrderSilenced : cache.skillOrderNormal;
}

export function hasHardCC(pokemon: Pokemon): boolean {
  return getCache(pokemon).hasHardCC;
}

export function hasHarden(pokemon: Pokemon): boolean {
  return getCache(pokemon).hasHarden;
}

export function hasSilence(pokemon: Pokemon): boolean {
  return getCache(pokemon).hasSilence;
}

export function hasFrontal(pokemon: Pokemon): boolean {
  return getCache(pokemon).hasFrontal;
}
