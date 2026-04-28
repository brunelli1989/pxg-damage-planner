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
  // ⚠️ quando tem ação pendente em `todo`. `observacao` é informativo apenas.
  const uncalibrated = Boolean(pokemon.todo);

  const baseCard = "rounded-lg p-2.5 cursor-pointer border-2 transition-[border-color,transform] duration-150 ease-out hover:-translate-y-px";
  const stateCard = disabled
    ? "opacity-40 cursor-not-allowed bg-bg-card border-[#333] hover:translate-y-0"
    : selected
    ? "bg-border-card border-accent-blue"
    : "bg-bg-card border-[#333] hover:border-[#555]";

  return (
    <div className={`${baseCard} ${stateCard}`} onClick={() => !disabled && onToggle(pokemon.id)}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-semibold text-sm">{pokemon.name}</span>
        {uncalibrated && (
          <span
            className="calibration-warning text-xs ml-auto mr-1.5 cursor-help opacity-85 hover:opacity-100"
            title={
              `Ação pendente: ${pokemon.todo}` +
              (pokemon.observacao ? `\n\nObservação: ${pokemon.observacao}` : "")
            }
          >
            ⚠️
          </span>
        )}
        <span
          className="text-[0.7rem] font-bold px-1.5 py-0.5 rounded text-bg-app"
          style={{ backgroundColor: TIER_COLORS[pokemon.tier] ?? "#888" }}
        >
          {pokemon.tier}
        </span>
      </div>

      <div className="flex gap-2 mb-2 text-[0.75rem]">
        <span className={`px-1 py-0.5 rounded-sm font-semibold text-white ${hasCC ? "bg-[#27ae60]" : "bg-[#c0392b]"}`}>
          {cc}
        </span>
      </div>
    </div>
  );
}
