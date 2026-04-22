import { useMemo, useState } from "react";
import type { Pokemon, PokemonElement, Tier } from "../types";
import { PokemonCard } from "./PokemonCard";

const ALL_ELEMENTS: PokemonElement[] = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
  "crystal",
];

const ALL_TIERS: Tier[] = ["T1A", "T1B", "T1H", "T1C", "T2", "T3", "TM", "TR"];

interface Props {
  allPokemon: Pokemon[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  elementsByPokeId: Record<string, string[]>;
}

export function PokemonSelector({ allPokemon, selectedIds, onToggle, elementsByPokeId }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<Tier | "">("");

  const filtered = useMemo(() => {
    let list = allPokemon;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (typeFilter) {
      list = list.filter((p) => (elementsByPokeId[p.id] ?? []).includes(typeFilter));
    }
    if (tierFilter) {
      list = list.filter((p) => p.tier === tierFilter);
    }
    return list;
  }, [allPokemon, search, typeFilter, tierFilter, elementsByPokeId]);

  // Seleciona primeiro os marcados, depois o resto (filtrado)
  const sorted = useMemo(() => {
    const selected = filtered.filter((p) => selectedIds.includes(p.id));
    const rest = filtered.filter((p) => !selectedIds.includes(p.id));
    return [...selected, ...rest];
  }, [filtered, selectedIds]);

  return (
    <section className="pokemon-selector">
      <h2>
        Selecione seus Pokémon disponíveis ({selectedIds.length} selecionados)
      </h2>

      <input
        type="text"
        className="poke-search"
        placeholder={`Buscar em ${allPokemon.length} pokémons...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="poke-type-chips">
        <button
          className={`type-chip ${tierFilter === "" ? "active" : ""}`}
          onClick={() => setTierFilter("")}
        >
          todos tiers
        </button>
        {ALL_TIERS.map((t) => (
          <button
            key={t}
            className={`type-chip ${tierFilter === t ? "active" : ""}`}
            onClick={() => setTierFilter(tierFilter === t ? "" : t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="poke-type-chips">
        <button
          className={`type-chip ${typeFilter === "" ? "active" : ""}`}
          onClick={() => setTypeFilter("")}
        >
          todos
        </button>
        {ALL_ELEMENTS.map((t) => (
          <button
            key={t}
            className={`type-chip type-${t} ${typeFilter === t ? "active" : ""}`}
            onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pokemon-grid">
        {sorted.map((p) => {
          const isSelected = selectedIds.includes(p.id);
          return (
            <PokemonCard
              key={p.id}
              pokemon={p}
              selected={isSelected}
              disabled={false}
              onToggle={onToggle}
            />
          );
        })}
      </div>

      {sorted.length === 0 && (
        <p className="bag-hint">Nenhum pokémon encontrado</p>
      )}
      {selectedIds.length === 0 && sorted.length > 0 && (
        <p className="bag-hint">Clique nos pokémons acima para selecionar</p>
      )}
    </section>
  );
}
