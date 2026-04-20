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
  group?: string;
}>;
const pansear = mobs.find((m) => m.name === "Pansear")!;

function setup(boost: number, tier: 0|1|2|3|4|5|6|7|8): PokeSetup {
  return { boost, held: { kind: "x-attack", tier }, hasDevice: false };
}

function buildConfig(bag: Pokemon[], clan: "orebound" | "seavell" | null, pokeSetups?: Record<string, PokeSetup>): DamageConfig {
  return {
    playerLvl: 366,
    clan,
    hunt: "300",
    mob: {
      name: "Magby/Pansear",
      types: pansear.types as DamageConfig["mob"]["types"],
      hp: pansear.hp ?? 0,
      defFactor: pansear.defFactor,
      bestStarterElements: pansear.bestStarterElements as DamageConfig["mob"]["bestStarterElements"],
    },
    device: { kind: "x-boost", tier: 7 },
    skillCalibrations: {},
    pokeSetups: pokeSetups ?? Object.fromEntries(bag.map((p) => [p.id, setup(80, 8)])),
  };
}

function runTest(
  name: string,
  bag: Pokemon[],
  clan: "orebound" | "seavell" | null,
  assertFn: (starters: string[], memberUsage: Record<string, { starter: number; any: number }>, result: { totalTime: number; steps: number }) => void,
  pokeSetups?: Record<string, PokeSetup>,
) {
  console.log(`\n=== ${name} ===`);
  console.log(`  bag: ${bag.map((p) => `${p.name} (${p.elements?.join("/") ?? "—"})`).join(", ")}`);
  console.log(`  clan: ${clan ?? "none"}`);

  const cfg = buildConfig(bag, clan, pokeSetups);
  const res = findBestForBag(bag, 2, { damageConfig: cfg });
  if (!res) {
    console.log(`  ✗ FAIL: no rotation`);
    process.exitCode = 1;
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
    for (const m of l.extraMembers) memberUsage[m.poke.name].any++;
  }

  console.log(`  → totalTime ${res.result.totalTime.toFixed(1)}s, ${res.result.steps.length} lures`);
  for (let i = 0; i < res.result.steps.length; i++) {
    const l = res.result.steps[i].lure;
    const members = [l.starter.name, l.second?.name, ...l.extraMembers.map((m) => m.poke.name)].filter(Boolean).join(" + ");
    const finisher = l.usesDevice ? "[Device]" : l.usesElixirAtk ? "[Elixir]" : "";
    console.log(`    ${i + 1}. [${l.type}]${finisher ? " " + finisher : ""} ${members}`);
  }
  console.log(`  usage:`);
  for (const [n, u] of Object.entries(memberUsage)) {
    console.log(`    ${n.padEnd(20)} starter=${u.starter}  total=${u.any}`);
  }

  try {
    assertFn(starters, memberUsage, { totalTime: res.result.totalTime, steps: res.result.steps.length });
    console.log(`  ✓ PASS`);
  } catch (e: unknown) {
    console.log(`  ✗ FAIL: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// --- Test 1: clan preference com 3 pokes ---
runTest(
  "Test 1: Sh.Golem + Omastar + Sh.Vaporeon em Orebound → rocks priorizados",
  [findPoke("Shiny Golem"), findPoke("Omastar"), findPoke("Shiny Vaporeon")],
  "orebound",
  (_starters, usage) => {
    const rockStarters = (usage["Shiny Golem"].starter) + (usage["Omastar"].starter);
    const waterStarters = usage["Shiny Vaporeon"].starter;
    if (rockStarters === 0) throw new Error("esperado rock como starter em alguma lure");
    if (waterStarters > rockStarters) throw new Error(`rock=${rockStarters} water=${waterStarters}`);
  }
);

// --- Test 2: 2 pokes forçam ambos a serem usados ---
runTest(
  "Test 2: Sh.Golem + Sh.Vaporeon em Orebound → ambos devem ser usados",
  [findPoke("Shiny Golem"), findPoke("Shiny Vaporeon")],
  "orebound",
  (_starters, usage) => {
    if (usage["Shiny Golem"].any === 0) throw new Error("Shiny Golem não apareceu");
    if (usage["Shiny Vaporeon"].any === 0) throw new Error("Shiny Vaporeon não apareceu");
  }
);

// --- Test 3: rotação ideal Magby/Pansear com Sh.Rampardos device ---
// Bag: Sh.Rampardos (T1H rock), Sh.Golem (T2 rock), Hippowdon (T2 ground),
//      Omastar (T3 rock/water), TR Tyranitar (TR rock), Rampardos (T2 rock)
// Config: lvl 366, Orebound, Magby hunt, device X-Boost T7, setup boost 80 + X-Atk T8
// Hippo é ground mas fica como SECOND (não starter). Ground não bloqueado no second.
// Expected:
//   - Sh.Rampardos solo_device em 3 lures (ele tem device, solo finaliza com setup maximal)
//   - Sh.Golem + Hippo dupla (Sh.Golem com Harden)
//   - Omastar + TR Tyranitar dupla (Omastar com Harden) OU TR Tyranitar + Omastar
//   - Rampardos solo_elixir + elixir def (sem Harden) + elixir atk
const magbyBag = [
  findPoke("Shiny Rampardos"),
  findPoke("Shiny Golem"),
  findPoke("Hippowdon Female"),
  findPoke("Omastar"),
  findPoke("TR Tyranitar"),
  findPoke("Rampardos"),
];
runTest(
  "Test 3: Sh.Rampardos device + Sh.Golem+Hippo + Omastar+Tyra + Rampardos elixir",
  magbyBag,
  "orebound",
  (_starters, usage) => {
    // Sh.Rampardos deve ser usado como starter (preferencialmente como device holder)
    if (usage["Shiny Rampardos"].starter === 0) {
      throw new Error("Sh.Rampardos não foi usado como starter em nenhuma lure");
    }
    // Sh.Golem deve aparecer (starter ou second)
    if (usage["Shiny Golem"].any === 0) {
      throw new Error("Sh.Golem não apareceu");
    }
    // Hippowdon é ground — NÃO pode ser starter (filtrado pelo bestStarterElements)
    if (usage["Hippowdon Female"].starter > 0) {
      throw new Error(`Hippowdon (ground) não deveria ser starter (apareceu ${usage["Hippowdon Female"].starter}x)`);
    }
    // Omastar e TR Tyranitar devem aparecer
    if (usage["Omastar"].any === 0) throw new Error("Omastar não apareceu");
    if (usage["TR Tyranitar"].any === 0) throw new Error("TR Tyranitar não apareceu");
    // Rampardos deve aparecer (pode ser starter em solo_elixir)
    if (usage["Rampardos"].any === 0) throw new Error("Rampardos não apareceu");
  }
);
