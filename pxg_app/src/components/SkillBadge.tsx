import type { Skill } from "../types";

interface Props {
  skill: Skill;
  compact?: boolean;
}

export function SkillBadge({ skill, compact }: Props) {
  const colorClass = skill.cc === "stun"
    ? "badge-stun"
    : skill.cc === "silence"
    ? "badge-silence"
    : skill.buff
    ? "badge-buff"
    : "badge-normal";

  const typeIcon = skill.type === "frontal" ? "⬆" : "";

  return (
    <span className={`skill-badge ${colorClass}`} title={`${skill.name} — CD: ${skill.cooldown}s | ${skill.type}${skill.cc ? ` | ${skill.cc}` : ""}${skill.buff ? ` | buff ${skill.buff}` : ""}`}>
      {compact ? skill.name : `${skill.name} (${skill.cooldown}s)`}
      {typeIcon && <span className="type-icon">{typeIcon}</span>}
    </span>
  );
}
