import type { Pokemon } from "../types";
import pokemonData from "../data/pokemon.json";
import { hasHardCC, hasSilence } from "./scoring";

const allPokemon = pokemonData as Pokemon[];

const frontalOnlyCCPokes = [
  "Lycanroc",
  "Shiny Rhydon",
  "TR Piloswine",
  "Shiny Haunter",
  "Shiny Lairon",
  "Shiny Kadabra",
];

const areaCCPokes = [
  "Shiny Rampardos",
  "Shiny Heatmor",
  "Shiny Hariyama",
  "Shiny Floatzel",
  "Mega Pidgeot",
];

let failures = 0;

for (const name of frontalOnlyCCPokes) {
  const p = allPokemon.find((x) => x.name === name);
  if (!p) {
    console.log(`SKIP ${name} (not found)`);
    continue;
  }
  const got = hasHardCC(p);
  const ok = got === false;
  console.log(`${ok ? "OK" : "FAIL"}: ${name} hasHardCC = ${got} (expected false)`);
  if (!ok) failures++;
}

for (const name of areaCCPokes) {
  const p = allPokemon.find((x) => x.name === name);
  if (!p) {
    console.log(`SKIP ${name} (not found)`);
    continue;
  }
  const got = hasHardCC(p);
  const ok = got === true;
  console.log(`${ok ? "OK" : "FAIL"}: ${name} hasHardCC = ${got} (expected true)`);
  if (!ok) failures++;
}

// hasSilence — Nidoqueen tem Toxic Spikes/silence? Let's pick a known silence poke if any.
// Apenas valida que pokes com silence área funcionam e silence frontal não.
const silenceCases = allPokemon.filter((p) =>
  p.skills.some((s) => s.cc === "silence")
);
for (const p of silenceCases.slice(0, 5)) {
  const hasAreaSilence = p.skills.some((s) => s.cc === "silence" && s.type !== "frontal");
  const got = hasSilence(p);
  const ok = got === hasAreaSilence;
  console.log(`${ok ? "OK" : "FAIL"}: ${p.name} hasSilence = ${got} (expected ${hasAreaSilence})`);
  if (!ok) failures++;
}

console.log(failures === 0 ? "\nAll tests pass ✓" : `\n${failures} FAILURES`);
