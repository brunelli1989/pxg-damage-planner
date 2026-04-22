import type { Pokemon } from "../types";

interface Props {
  pokemon: Pokemon;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}

const TIER_COLORS: Record<string, string> = {
  T1A: "#ff6b9d",
  T1B: "#ffa07a",
  T1H: "#ffd700",
  T1C: "#e8c872",
  T2: "#c0c0c0",
  T3: "#cd7f32",
  TR: "#4a90d9",
  TM: "#9b59b6",
};

function ccLabel(pokemon: Pokemon): string {
  // Mostra qualquer CC (incluindo stun/silence frontal, que ainda vale como second).
  const kinds = new Set(pokemon.skills.filter((s) => s.cc !== null).map((s) => s.cc));
  if (kinds.size === 0) return "No CC";
  return Array.from(kinds).join("/");
}

export function PokemonCard({ pokemon, selected, disabled, onToggle }: Props) {
  const cc = ccLabel(pokemon);
  const hasCC = cc !== "No CC";
  // ⚠️ quando tem ação pendente em `todo` (RECALIBRAR, calibrate skills, etc).
  // `observacao` é informativo apenas — não dispara warning, mas aparece no tooltip.
  const uncalibrated = Boolean(pokemon.todo);

  return (
    <div
      className={`pokemon-card ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
      onClick={() => !disabled && onToggle(pokemon.id)}
    >
      <div className="card-header">
        <span className="pokemon-name">{pokemon.name}</span>
        {uncalibrated && (
          <span
            className="calibration-warning"
            title={
              `Ação pendente: ${pokemon.todo}` +
              (pokemon.observacao ? `\n\nObservação: ${pokemon.observacao}` : "")
            }
          >
            ⚠️
          </span>
        )}
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
