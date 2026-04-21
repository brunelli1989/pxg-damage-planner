import type { DamageConfig, Pokemon, PokeSetup } from "../types";
import pokemonData from "../data/pokemon.json";
import mobsData from "../data/mobs.json";
import { findBestForBag } from "./rotation";
import { estimateLureDamagePerMob } from "./damage";

const allPokemon = pokemonData as Pokemon[];
const mobs = mobsData as Array<{ name: string; types: string[]; hp?: number; defFactor?: number }>;

function tryFindPoke(name: string): Pokemon | null {
  return allPokemon.find((x) => x.name === name) ?? null;
}

function findPoke(name: string): Pokemon {
  const p = tryFindPoke(name);
  if (!p) throw new Error(`Pokemon not found: ${name}`);
  return p;
}

function setup(boost: number, atkTier: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, hasDevice = false): PokeSetup {
  return { boost, held: { kind: "x-attack", tier: atkTier }, hasDevice };
}

const pinsir = mobs.find((m) => m.name === "Pinsir");
if (!pinsir) throw new Error("Pinsir not in mobs.json");

// Cenário: nvl 600, Volcanic, hunt Pinsir 400+, device bloqueado (sem X-Held no device), Disk 3.
const baseConfig: Omit<DamageConfig, "pokeSetups"> = {
  playerLvl: 600,
  clan: "volcanic",
  hunt: "400+",
  mob: {
    name: "Pinsir",
    types: pinsir.types as DamageConfig["mob"]["types"],
    hp: pinsir.hp ?? 0,
    defFactor: pinsir.defFactor,
  },
  device: { kind: "none", tier: 0 },
  skillCalibrations: {},
};

interface Scenario {
  name: string;
  /** Null entries = poke missing from pokemon.json — scenario will be skipped */
  bag: { poke: Pokemon | null; setup: PokeSetup }[];
  /** Expected bottleneck that the rotation should wait on between lures */
  expectedWait: string;
  playerLvl?: number;
}

const scenarios: Scenario[] = [
  {
    name: "1. Sh.Heatmor +80/T8 + Ninetales +70/T8 + Sh.Ninetales +70/T8",
    bag: [
      { poke: findPoke("Shiny Heatmor"), setup: setup(80, 8) },
      { poke: findPoke("Ninetales"), setup: setup(70, 8) },
      { poke: tryFindPoke("Shiny Ninetales"), setup: setup(70, 8) },
    ],
    expectedWait: "somente Shiny Heatmor",
  },
  {
    name: "2. Sh.Heatmor +80/T8 + TR Charizard +70/T8 + Sh.Chandelure +70/T8",
    bag: [
      { poke: findPoke("Shiny Heatmor"), setup: setup(80, 8) },
      { poke: findPoke("TR Charizard"), setup: setup(70, 8) },
      { poke: findPoke("Shiny Chandelure"), setup: setup(70, 8) },
    ],
    expectedWait: "somente Shiny Heatmor",
  },
  {
    name: "3. Sh.Heatmor +80/T8 + elixir atk + Sh.Magby +70/T8",
    bag: [
      { poke: findPoke("Shiny Heatmor"), setup: setup(80, 8) },
      { poke: findPoke("Shiny Magby"), setup: setup(70, 8) },
    ],
    expectedWait: "Shiny Heatmor + cooldown do elixir atk",
  },
  {
    name: "4. Arcanine +70/T7 + Sh.Heatmor +80/T8 + Ninetales +70/T8 + Sh.Ninetales +70/T8",
    bag: [
      { poke: findPoke("Arcanine"), setup: setup(70, 7) },
      { poke: findPoke("Shiny Heatmor"), setup: setup(80, 8) },
      { poke: findPoke("Ninetales"), setup: setup(70, 8) },
      { poke: tryFindPoke("Shiny Ninetales"), setup: setup(70, 8) },
    ],
    expectedWait: "Arcanine e Shiny Heatmor",
  },
  {
    name: "5. Arcanine +70/T7 + Sh.Heatmor +80/T8 + TR Charizard +70/T8 + Sh.Chandelure +70/T8",
    bag: [
      { poke: findPoke("Arcanine"), setup: setup(70, 7) },
      { poke: findPoke("Shiny Heatmor"), setup: setup(80, 8) },
      { poke: findPoke("TR Charizard"), setup: setup(70, 8) },
      { poke: findPoke("Shiny Chandelure"), setup: setup(70, 8) },
    ],
    expectedWait: "Arcanine e Shiny Heatmor",
  },
  {
    // Cenário proposital: nivel 400 + held baixo força dupla a falhar em Pinsir 400+,
    // validando que o generator produz group lure de 3-4 membros.
    name: "6. [nvl 400, held baixo] Arcanine +70/T4 + Sh.Heatmor +70/T4 + Ninetales +70/T4 + TR Charizard +70/T4",
    bag: [
      { poke: findPoke("Arcanine"), setup: setup(70, 4) },
      { poke: findPoke("Shiny Heatmor"), setup: setup(70, 4) },
      { poke: findPoke("Ninetales"), setup: setup(70, 4) },
      { poke: findPoke("TR Charizard"), setup: setup(70, 4) },
    ],
    expectedWait: "group lure 3-4 membros (trio/quarteto)",
    playerLvl: 400,
  },
];

for (const sc of scenarios) {
  console.log(`\n=== ${sc.name} ===`);
  console.log(`  expected wait: ${sc.expectedWait}`);

  const missing = sc.bag.filter((x) => x.poke === null);
  if (missing.length > 0) {
    console.log(`  → SKIP: ${missing.length} poke(s) not in pokemon.json`);
    continue;
  }

  const pokeSetups: DamageConfig["pokeSetups"] = {};
  for (const { poke, setup: s } of sc.bag) pokeSetups[poke!.id] = s;
  const cfg: DamageConfig = {
    ...baseConfig,
    pokeSetups,
    ...(sc.playerLvl !== undefined ? { playerLvl: sc.playerLvl } : {}),
  };
  const bag = sc.bag.map((x) => x.poke!);

  const res = findBestForBag(bag, 3, { damageConfig: cfg });
  if (!res) {
    console.log("  → NO viable rotation (bag filtered out by damage check)");
    continue;
  }
  const { result } = res;
  const boxesPerHour = Math.round((3600 * result.steps.length) / result.totalTime);
  console.log(`  → ${result.steps.length} lures | totalTime ${result.totalTime.toFixed(1)}s | ${boxesPerHour} boxes/h`);
  result.steps.forEach((step, i) => {
    const l = step.lure;
    const names = [l.starter.name, l.second?.name, ...l.extraMembers.map((m) => m.poke.name)].filter(
      Boolean
    );
    const pokes = names.join(" + ");
    const fin = l.usesDevice ? "Dev" : l.usesElixirAtk ? "+Elixir" : "";
    const tag = `${l.type}${fin ? " " + fin : ""}`;
    const idle = `idle ${step.idleBefore.toFixed(1)}s before, ${step.idleMidLure.toFixed(1)}s mid`;
    console.log(`    ${i + 1}. ${pokes.padEnd(60)} [${tag}]  ${idle}`);

    const dmg = estimateLureDamagePerMob(l, cfg);
    const hp = cfg.mob.hp;
    const pct = ((dmg / hp) * 100).toFixed(1);
    console.log(`       dano/mob: ${Math.round(dmg).toLocaleString()} / ${hp.toLocaleString()} (${pct}%)  ${dmg >= hp ? "✓" : "✗"}`);

    if (l.starterUsesHarden) console.log(`       defesa: Harden`);

    const allMembers = [
      { poke: l.starter, skills: l.starterSkills },
      ...(l.second ? [{ poke: l.second, skills: l.secondSkills }] : []),
      ...l.extraMembers.map((m) => ({ poke: m.poke, skills: m.skills })),
    ];
    const holderPoke = l.usesElixirAtk
      ? allMembers.find((m) => m.poke.id === l.elixirAtkHolderId)?.poke
      : null;
    if (holderPoke) console.log(`       elixir atk: ${holderPoke.name} (+70% atk nas skills dele)`);

    for (const m of allMembers) {
      const buffed = m.poke.id === holderPoke?.id;
      const skillList = m.skills.map((s) => `${s.name}(${s.cooldown}s,${s.type})`).join(" → ");
      console.log(`       ${m.poke.name}${buffed ? " [buffed]" : ""}: ${skillList}`);
    }
  });
}
