import type { Pokemon, Skill } from "../types";
import { resolveSkillPower, getDefaultSkillPower } from "./damage";

const pokeT2: Pokemon = {
  id: "test-t2",
  name: "Test T2 burst_dd CC",
  tier: "T2",
  role: "burst_dd",
  skills: [
    { name: "stun", cooldown: 40, type: "area", cc: "stun", buff: null, power: 0 },
  ],
};

const defaultT2 = getDefaultSkillPower(pokeT2);

function mkSkill(partial: Partial<Skill>): Skill {
  return {
    name: "test",
    cooldown: 40,
    type: "area",
    cc: null,
    buff: null,
    ...partial,
  };
}

let failures = 0;
function check(label: string, got: number, expected: number) {
  const ok = Math.abs(got - expected) < 1e-6;
  console.log(`${ok ? "OK" : "FAIL"}: ${label} → got ${got}, expected ${expected}`);
  if (!ok) failures++;
}

// 1. Skill sem power + sem buff → usa fallback (tier, role)
check(
  "no power, no buff → fallback",
  resolveSkillPower(mkSkill({}), pokeT2),
  defaultT2
);

// 2. Skill sem power + buff:self → 0 (buff não dá dano)
check(
  "no power, buff:self → 0",
  resolveSkillPower(mkSkill({ buff: "self" }), pokeT2),
  0
);

// 3. Skill sem power + buff:next → 0 (buff não dá dano)
check(
  "no power, buff:next → 0",
  resolveSkillPower(mkSkill({ buff: "next" }), pokeT2),
  0
);

// 4. Skill com power explícito 0 (CC-only) → 0 (não cai no fallback)
check(
  "power=0 (CC-only) → 0",
  resolveSkillPower(mkSkill({ power: 0, cc: "stun" }), pokeT2),
  0
);

// 5. Skill com power explícito calibrado → retorna calibrado
check(
  "calibrated power → calibrated value",
  resolveSkillPower(mkSkill({ power: 25.5 }), pokeT2),
  25.5
);

// 6. Pokemon sem role → fallback retorna 0
const pokeNoRole: Pokemon = { ...pokeT2, role: undefined };
check(
  "no role → fallback = 0",
  resolveSkillPower(mkSkill({}), pokeNoRole),
  0
);

// 7. Buff skill com power explícito (raro) → retorna o power (respeita override)
check(
  "buff:self com power explícito → respeita power",
  resolveSkillPower(mkSkill({ buff: "self", power: 5 }), pokeT2),
  5
);

console.log(failures === 0 ? "\nAll tests pass ✓" : `\n${failures} FAILURES`);
