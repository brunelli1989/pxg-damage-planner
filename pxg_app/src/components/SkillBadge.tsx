import type { Skill } from "../types";

interface Props {
  skill: Skill;
  compact?: boolean;
}

const VARIANT_CLASSES: Record<string, string> = {
  stun: "bg-danger/20 text-danger border-danger/35",
  silence: "bg-lure-purple-soft text-[#9b59b6] border-lure-purple-strong",
  buff: "bg-success/20 text-success border-success/35",
  normal: "bg-white/[0.067] text-text-muted border-white/[0.13]",
};

export function SkillBadge({ skill, compact }: Props) {
  const variant = skill.cc === "stun"
    ? "stun"
    : skill.cc === "silence"
    ? "silence"
    : skill.buff
    ? "buff"
    : "normal";

  const typeIcon = skill.type === "frontal" ? "⬆" : "";
  const tooltip = `${skill.name} — CD: ${skill.cooldown}s | ${skill.type}${skill.cc ? ` | ${skill.cc}` : ""}${skill.buff ? ` | buff ${skill.buff}` : ""}`;

  return (
    <span
      className={`inline-flex items-center gap-[3px] text-[0.7rem] px-[6px] py-[2px] rounded-sm border ${VARIANT_CLASSES[variant]}`}
      title={tooltip}
    >
      {compact ? skill.name : `${skill.name} (${skill.cooldown}s)`}
      {typeIcon && <span className="text-[0.6rem]">{typeIcon}</span>}
    </span>
  );
}
