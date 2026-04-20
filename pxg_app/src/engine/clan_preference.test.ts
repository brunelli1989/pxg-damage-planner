import type { DamageConfig, Pokemon, PokeSetup, RosterPokemon } from "../types";
import pokemonData from "../data/pokemon.json";
import rosterData from "../data/pokemon_roster.json";
import mobsData from "../data/mobs.json";
import { findBestForBag } from "./rotation";

// Replica do merge que App.tsx faz: enriquece pokes com elements do roster
const elementsById = Object.fromEntries(
  (rosterData as RosterPokemon[]).map((r) => [r.id, r.elements])
);
const allPokes = (pokemonData as Pokemon[]).map((p) => ({
  ...p,
  elements: elementsById[p.id] ?? p.elements,
}));

function findPoke(name: string): Pokemon {
  const p = allPokes.find((x) => x.name === name);
  if (!p) throw new Error(`Pokemon not found: ${name}`);
  return p;
}

const mobs = mobsData as Array<{
  name: string;
  types: string[];
  hp?: number;
  defFactor?: number;
  bestStarterElements?: string[];
}>;
const magby = mobs.find((m) => m.name === "Magby")!;

function setup(boost: number, tier: 0|1|2|3|4|5|6|7|8): PokeSetup {
  return { boost, held: { kind: "x-attack", tier }, hasDevice: false };
}

function buildConfig(bag: Pokemon[], clan: "orebound" | "seavell"): DamageConfig {
  return {
    playerLvl: 600,
    clan,
    hunt: "300",
    mob: {
      name: "Magby",
      types: magby.types as DamageConfig["mob"]["types"],
      hp: magby.hp ?? 0,
      defFactor: magby.defFactor,
      bestStarterElements: magby.bestStarterElements as DamageConfig["mob"]["bestStarterElements"],
    },
    device: { kind: "x-attack", tier: 4 },
    skillCalibrations: {},
    pokeSetups: Object.fromEntries(bag.map((p) => [p.id, setup(80, 8)])),
  };
}

function runTest(
  name: string,
  bag: Pokemon[],
  clan: "orebound" | "seavell",
  assertFn: (starters: string[], memberUsage: Record<string, { starter: number; any: number }>) => void
) {
  console.log(`\n=== ${name} ===`);
  console.log(`  bag: ${bag.map((p) => `${p.name} (${p.elements?.join("/") ?? "—"})`).join(", ")}`);
  console.log(`  clan: ${clan}`);

  const cfg = buildConfig(bag, clan);
  const res = findBestForBag(bag, 2, { damageConfig: cfg });
  if (!res) {
    console.log(`  ✗ FAIL: no rotation`);
    return;
  }

  const starters: string[] = [];
  const memberUsage: Record<string, { starter: number; any: number }> = {};
  for (const p of bag) memberUsage[p.name] = { starter: 0, any: 0 };

  for (const step of res.result.steps) {
    const l = step.lure;
    starters.push(l.starter.name);
    memberUsage[l.starter.name].starter++;
    memberUsage[l.starter.name].any++;
    if (l.second) memberUsage[l.second.name].any++;
    for (const m of l.extraMembers) memberUsage[m.poke.id]!; // no-op, just for typing
    for (const m of l.extraMembers) memberUsage[m.poke.name].any++;
  }

  console.log(`  → totalTime ${res.result.totalTime.toFixed(1)}s, ${res.result.steps.length} lures`);
  for (let i = 0; i < res.result.steps.length; i++) {
    const l = res.result.steps[i].lure;
    const extras = l.extraMembers.map((m) => m.poke.name).join(", ");
    const members = [l.starter.name, l.second?.name, extras].filter(Boolean).join(" + ");
    console.log(`    ${i + 1}. [${l.type}] starter=${l.starter.name} | ${members}`);
  }
  console.log(`  usage:`);
  for (const [n, u] of Object.entries(memberUsage)) {
    console.log(`    ${n.padEnd(20)} starter=${u.starter}  total=${u.any}`);
  }

  try {
    assertFn(starters, memberUsage);
    console.log(`  ✓ PASS`);
  } catch (e: unknown) {
    console.log(`  ✗ FAIL: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// --- Test 1 ---
// Bag de 3: Shiny Golem (rock), Omastar (rock/water), Shiny Vaporeon (water)
// Clan: orebound → ideal = rock. Golem e Omastar têm rock → devem dominar.
// Shiny Vaporeon é só water → só entra se não tiver opção rock.
runTest(
  "Test 1: Sh.Golem + Omastar + Sh.Vaporeon em Orebound → rocks priorizados",
  [findPoke("Shiny Golem"), findPoke("Omastar"), findPoke("Shiny Vaporeon")],
  "orebound",
  (starters, usage) => {
    const rockStarters = (usage["Shiny Golem"].starter) + (usage["Omastar"].starter);
    const waterStarters = usage["Shiny Vaporeon"].starter;
    if (rockStarters === 0) throw new Error("esperado rock como starter em alguma lure, não ocorreu");
    if (waterStarters > rockStarters) {
      throw new Error(`esperado rock starters > water starters, got rock=${rockStarters} water=${waterStarters}`);
    }
  }
);

// --- Test 2 ---
// Bag de 2: Shiny Golem + Shiny Vaporeon (ambos offtank, ambos T2 com CC + def skill).
// Sem Omastar pra comparar. Ambos devem ser usados (starter em pelo menos uma lure ou second).
// Clan orebound dá vantagem pro rock, mas com só 2 pokes o engine tem que usar ambos no ciclo.
runTest(
  "Test 2: Sh.Golem + Sh.Vaporeon em Orebound → ambos devem ser usados",
  [findPoke("Shiny Golem"), findPoke("Shiny Vaporeon")],
  "orebound",
  (_starters, usage) => {
    if (usage["Shiny Golem"].any === 0) throw new Error("Shiny Golem não apareceu em nenhuma lure");
    if (usage["Shiny Vaporeon"].any === 0) throw new Error("Shiny Vaporeon não apareceu em nenhuma lure");
  }
);
