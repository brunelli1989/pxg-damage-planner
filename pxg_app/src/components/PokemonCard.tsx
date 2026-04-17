import type { Pokemon } from "../types";

interface Props {
  pokemon: Pokemon;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}

const TIER_COLORS: Record<string, string> = {
  T1H: "#ffd700",
  T2: "#c0c0c0",
  T3: "#cd7f32",
  TR: "#4a90d9",
  TM: "#9b59b6",
};

function ccLabel(pokemon: Pokemon): string {
  const hasStun = pokemon.skills.some((s) => s.cc === "stun");
  const hasSilence = pokemon.skills.some((s) => s.cc === "silence");
  if (hasStun && hasSilence) return "stun/silence";
  if (hasStun) return "stun";
  if (hasSilence) return "silence";
  return "No CC";
}

export function PokemonCard({ pokemon, selected, disabled, onToggle }: Props) {
  const cc = ccLabel(pokemon);
  const hasCC = cc !== "No CC";

  return (
    <div
      className={`pokemon-card ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
      onClick={() => !disabled && onToggle(pokemon.id)}
    >
      <div className="card-header">
        <span className="pokemon-name">{pokemon.name}</span>
        <span
          className="tier-badge"
          style={{ backgroundColor: TIER_COLORS[pokemon.tier] ?? "#888" }}
        >
          {pokemon.tier}
        </span>
      </div>

      <div className="card-meta">
        <span className={`cc-indicator ${hasCC ? "has-cc" : "no-cc"}`}>{cc}</span>
      </div>
    </div>
  );
}
