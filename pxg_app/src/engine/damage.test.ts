import type { DamageConfig, Pokemon, Skill } from "../types";
import { computeSkillDamage, deriveSkillPower } from "./damage";

const shinyRampardos: Pokemon = {
  id: "shiny-rampardos",
  name: "Shiny Rampardos",
  tier: "T1H",
  role: "burst_dd",
  skills: [],
};

/**
 * Validação contra dados reais medidos em combate.
 * Rodar com: npx tsx src/engine/damage.test.ts
 * (ou criar um pequeno harness de teste)
 */

const cfgChar1Orebound: DamageConfig = {
  playerLvl: 364,
  clan: "orebound",
  hunt: "300",
  mob: { name: "dummy", types: ["psychic"], hp: 0, defFactor: 1 }, // dummy neutro
  device: { kind: "x-attack", tier: 4 },
  pokeSetups: {
    "shiny-rampardos": { boost: 70, held: { kind: "x-attack", tier: 7 }, hasDevice: false },
  },
  skillCalibrations: {},
};

const cfgChar2NoClan: DamageConfig = {
  playerLvl: 600,
  clan: null,
  hunt: "300",
  mob: { name: "dummy", types: ["psychic"], hp: 0, defFactor: 1 },
  device: { kind: "x-attack", tier: 4 },
  pokeSetups: {
    "shiny-rampardos": { boost: 70, held: { kind: "x-attack", tier: 7 }, hasDevice: false },
  },
  skillCalibrations: {},
};

const rockWrecker: Skill = {
  name: "Rock Wrecker",
  cooldown: 50,
  type: "area",
  cc: null,
  buff: null,
  element: "rock",
};

// Step 1: derive skill_power from char1 observation
const observedChar1 = 25400;
const derivedPower = deriveSkillPower(observedChar1, cfgChar1Orebound, "shiny-rampardos", rockWrecker);
console.log(`Derived skill_power (Sh.Ramp RW): ${derivedPower.toFixed(3)}`);
// Esperado: ~26.07

// Step 2: predict char 2 using derived power
const rockWreckerCal: Skill = { ...rockWrecker, power: derivedPower };
const predictedChar2 = computeSkillDamage(cfgChar2NoClan, shinyRampardos, rockWreckerCal);
const observedChar2 = 28185;
const errChar2 = Math.abs(predictedChar2 - observedChar2) / observedChar2;
console.log(`Sh.Ramp RW char 2: predito ${predictedChar2.toFixed(0)}, obs ${observedChar2}, err ${(errChar2 * 100).toFixed(2)}%`);
// Esperado: <1% error

// Step 3: Device validation
const cfgWithDevice: DamageConfig = {
  ...cfgChar1Orebound,
  pokeSetups: {
    "shiny-rampardos": { boost: 70, held: { kind: "x-attack", tier: 7 }, hasDevice: true },
  },
  skillCalibrations: { "shiny-rampardos:Rock Wrecker": derivedPower },
};
const predictedDevice = computeSkillDamage(cfgWithDevice, shinyRampardos, rockWreckerCal);
const observedDevice = 29148;
const errDevice = Math.abs(predictedDevice - observedDevice) / observedDevice;
console.log(`Sh.Ramp RW com device: predito ${predictedDevice.toFixed(0)}, obs ${observedDevice}, err ${(errDevice * 100).toFixed(2)}%`);

// Step 4: Type effectiveness (rock vs fire = 2x)
const cfgFireMob: DamageConfig = {
  ...cfgChar1Orebound,
  mob: { name: "fire dummy", types: ["fire"], hp: 0, defFactor: 1 },
  skillCalibrations: { "shiny-rampardos:Rock Wrecker": derivedPower },
};
const predictedFire = computeSkillDamage(cfgFireMob, shinyRampardos, rockWreckerCal);
const observedFire = 50778;
const errFire = Math.abs(predictedFire - observedFire) / observedFire;
console.log(`Sh.Ramp RW em fire dummy: predito ${predictedFire.toFixed(0)}, obs ${observedFire}, err ${(errFire * 100).toFixed(2)}%`);

// Step 5: Combat context (Pansear, fire, def 0.8996)
const cfgPansear: DamageConfig = {
  ...cfgChar1Orebound,
  mob: { name: "Pansear", types: ["fire"], hp: 0, defFactor: 0.8996 },
  skillCalibrations: { "shiny-rampardos:Rock Wrecker": derivedPower },
};
const predictedPansear = computeSkillDamage(cfgPansear, shinyRampardos, rockWreckerCal);
const observedPansear = 45677;
const errPansear = Math.abs(predictedPansear - observedPansear) / observedPansear;
console.log(`Sh.Ramp RW em Pansear: predito ${predictedPansear.toFixed(0)}, obs ${observedPansear}, err ${(errPansear * 100).toFixed(2)}%`);

// Step 6: Pansear + device
const cfgPansearDevice: DamageConfig = {
  ...cfgPansear,
  pokeSetups: { "shiny-rampardos": { boost: 70, held: { kind: "x-attack", tier: 7 }, hasDevice: true } },
};
const predictedPansearDevice = computeSkillDamage(cfgPansearDevice, shinyRampardos, rockWreckerCal);
const observedPansearDevice = 52476;
const errPansearDevice = Math.abs(predictedPansearDevice - observedPansearDevice) / observedPansearDevice;
console.log(`Sh.Ramp RW em Pansear + device: predito ${predictedPansearDevice.toFixed(0)}, obs ${observedPansearDevice}, err ${(errPansearDevice * 100).toFixed(2)}%`);

// Step 7: X-Boost device (2X rule, validado 2026-04-20)
// Wiki: X-Boost "aumenta o bônus do Pokémon em X e o DOBRO desse valor como bônus de ataque".
// T7 @ lvl 366 (range 150-399) → tabela X=36, eff_boost contribution = 72.
// Sh.Rampardos FR 24.28, Torkoal def 0.55, fire 2x eff, X-Atk T7 + device X-Boost T7.
const falling: Skill = {
  name: "Falling Rocks",
  cooldown: 40,
  type: "area",
  cc: null,
  buff: null,
  element: "rock",
  power: 24.28,
};
const cfgXBoost: DamageConfig = {
  playerLvl: 366,
  clan: "orebound",
  hunt: "400+",
  mob: { name: "Torkoal", types: ["fire"], hp: 439109, defFactor: 0.55 },
  device: { kind: "x-boost", tier: 7 },
  pokeSetups: {
    "shiny-rampardos": { boost: 70, held: { kind: "x-attack", tier: 7 }, hasDevice: true },
  },
  skillCalibrations: {},
};
const predictedXBoost = computeSkillDamage(cfgXBoost, shinyRampardos, falling);
const observedXBoost = 29783;
const errXBoost = Math.abs(predictedXBoost - observedXBoost) / observedXBoost;
console.log(`Sh.Ramp FR + device X-Boost T7: predito ${predictedXBoost.toFixed(0)}, obs ${observedXBoost}, err ${(errXBoost * 100).toFixed(2)}%`);
// Esperado ~29,940 com 2X rule; sem a correção seria ~27,939 (+6.6% off).

// Step 8: Dual-type defender rule (validado 2026-04-20 com Pidgeot)
// PxG usa só o ÚLTIMO tipo listado. Pidgeot [normal, flying] → rock SE (2×) via Flying.
// Observado: full combo Sh.Rampardos (5 skills, Σ power=119.49) em 3 Pidgeots = 408.3k total
// → 136.1k per mob → def = 0.587 @ eff=2.
const pidgeotFR: Skill = { ...falling };
const cfgPidgeot: DamageConfig = {
  playerLvl: 366,
  clan: "orebound",
  hunt: "400+",
  mob: { name: "Pidgeot", types: ["normal", "flying"], hp: 468889, defFactor: 0.59 },
  device: { kind: "x-boost", tier: 7 },
  pokeSetups: {
    "shiny-rampardos": { boost: 70, held: { kind: "x-attack", tier: 7 }, hasDevice: false },
  },
  skillCalibrations: {},
};
const predictedPidgeot = computeSkillDamage(cfgPidgeot, shinyRampardos, pidgeotFR);
const observedPidgeotFR = 27684; // @ def=0.587, scaled pra 0.59: 27684 × (0.59/0.587) ≈ 27,826
const errPidgeot = Math.abs(predictedPidgeot - observedPidgeotFR) / observedPidgeotFR;
console.log(`Sh.Ramp FR em Pidgeot (dual-type rule): predito ${predictedPidgeot.toFixed(0)}, obs ~${observedPidgeotFR}, err ${(errPidgeot * 100).toFixed(2)}%`);
// Sem a fix (eff=1.0 antigo): predito ~14k → erro ~50%.

console.log("\nSe todos os erros estão <1%, engine está correto.");
