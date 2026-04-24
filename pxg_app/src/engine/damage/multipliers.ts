import type { ClanName, PokemonElement, Skill } from "../../types";
import clansData from "../../data/clans.json";

// =========================================================
// Type effectiveness chart (standard Pokemon — validated in PxG)
// =========================================================

type TypeChart = Record<PokemonElement, Partial<Record<PokemonElement, number>>>;

const TYPE_CHART: TypeChart = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
  // Elemento exclusivo do PxG. Sem dados de efetividade — todas defensivas ficam neutras (1×)
  // até o usuário calibrar. Para definir (attacker crystal vs defender X), preencha aqui.
  // Para defender crystal vs attacker X, adicionar `crystal: <mult>` dentro de TYPE_CHART[X].
  crystal: {},
};

export function getEffectiveness(
  attackerType: PokemonElement,
  defenderType: PokemonElement
): number {
  return TYPE_CHART[attackerType]?.[defenderType] ?? 1;
}

// =========================================================
// PxG effectiveness rules (PVE Nightmare World — context do app)
// =========================================================
//
// Single-type:
//   weak (chart ×2)   → 2.0   (Super Efetivo)
//   neutral (×1)      → 1.0   (Normal)
//   resistant (×0.5)  → 0.5   (Muito Inefetivo)
//   null (×0) PVE NW  → 0.5   (PVP = 0.4, PVE normal = 0)
//
// Dual-type (tabela piecewise, NÃO multiplicativa):
//   2 weak                → 2.0   (Super Efetivo)
//   1 weak + 1 neutral    → 1.75  (Efetivo)
//   1 weak + 1 resistant  → 1.0   (Normal)
//   2 neutral             → 1.0   (Normal)
//   1 resistant + 1 neutral → 0.75 (Inefetivo)
//   2 resistant           → 0.5   (Muito Inefetivo)
//   qualquer null (NW)    → 0.5   (Muito Inefetivo)
// =========================================================

type EffClass = "weak" | "neutral" | "resistant" | "null";

function classifyEff(eff: number): EffClass {
  if (eff === 0) return "null";
  if (eff >= 2) return "weak";
  if (eff >= 1) return "neutral";
  return "resistant";
}

/**
 * Efetividade de um elemento atacante contra os tipos do defender, usando as regras oficiais
 * PxG (PVE Nightmare World). Single-type usa a tabela direta; dual-type usa piecewise.
 *
 * Validações:
 * - Alolan Diglett [ground, steel] vs ground: 1 weak + 1 neutral = 1.75 (não 2.0 multiplicativo)
 * - Mawile [steel, fairy] vs fighting: 1 weak + 1 resistant = 1.0 (não 2×0.5 = 1.0, coincide por acaso)
 * - Pidgeot [normal, flying] vs rock: 1 weak + 1 neutral = 1.75 (antes era 2.0)
 */
export function computeEffectiveness(
  attackerType: PokemonElement,
  defenderTypes: PokemonElement[]
): number {
  if (defenderTypes.length === 0) return 1;

  if (defenderTypes.length === 1) {
    const eff = getEffectiveness(attackerType, defenderTypes[0]);
    // PVE NW: null vira 0.5 (não 0). PVE regular e PVP usam valores diferentes,
    // mas app foca em Nightmare World.
    if (eff === 0) return 0.5;
    return eff;
  }

  // Dual-type: classify each, apply piecewise table.
  const classes = defenderTypes.map((t) => classifyEff(getEffectiveness(attackerType, t)));
  const weak = classes.filter((c) => c === "weak").length;
  const neutral = classes.filter((c) => c === "neutral").length;
  const resistant = classes.filter((c) => c === "resistant").length;
  const nullCount = classes.filter((c) => c === "null").length;

  if (nullCount > 0) return 0.5; // NW: null vira muito inefetivo
  if (weak === 2) return 2.0;
  if (weak === 1 && neutral === 1) return 1.75;
  if (weak === 1 && resistant === 1) return 1.0;
  if (neutral === 2) return 1.0;
  if (resistant === 1 && neutral === 1) return 0.75;
  if (resistant === 2) return 0.5;
  return 1.0;
}

/**
 * Efetividade de uma skill específica contra os tipos de um pokemon defender.
 * Wrapper conveniente que extrai o element da skill. Se skill não tem element
 * definido (utilitária, buff, etc.), retorna 1 (neutro).
 */
export function skillEffectiveness(
  skill: Skill,
  defenderTypes: PokemonElement[]
): number {
  if (!skill.element) return 1;
  return computeEffectiveness(skill.element, defenderTypes);
}

// =========================================================
// Clan bonus lookup
// =========================================================

// Pré-indexa clãs → elemento → bônus de atk. Lookup O(1) no hot path.
const CLAN_ATK_BONUS: Map<ClanName, Map<PokemonElement, number>> = new Map(
  clansData.map((c) => [
    c.name as ClanName,
    new Map(c.bonuses.map((b) => [b.element as PokemonElement, b.atk])),
  ])
);

// Pré-indexa clã → elementos (sem bonus). Usado pro engine priorizar starters
// cujo tipo está no clã do jogador (dano maior com clan bonus nas skills STAB).
const CLAN_ELEMENTS: Map<ClanName, PokemonElement[]> = new Map(
  clansData.map((c) => [c.name as ClanName, c.bonuses.map((b) => b.element as PokemonElement)])
);

export function getClanElements(clanName: ClanName | null): PokemonElement[] {
  if (!clanName) return [];
  return CLAN_ELEMENTS.get(clanName) ?? [];
}

export function getClanBonus(
  clanName: ClanName | null,
  skillElement: PokemonElement | undefined
): number {
  if (!clanName || !skillElement) return 0;
  return CLAN_ATK_BONUS.get(clanName)?.get(skillElement) ?? 0;
}
