import { useMemo, useState } from "react";
import type { Pokemon, PokemonElement } from "../types";
import { PokemonCard } from "./PokemonCard";

const ALL_ELEMENTS: PokemonElement[] = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

interface Props {
  allPokemon: Pokemon[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  elementsByPokeId: Record<string, string[]>;
}

export function PokemonSelector({ allPokemon, selectedIds, onToggle, elementsByPokeId }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const filtered = useMemo(() => {
    let list = allPokemon;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (typeFilter) {
      list = list.filter((p) => (elementsByPokeId[p.id] ?? []).includes(typeFilter));
    }
    return list;
  }, [allPokemon, search, typeFilter, elementsByPokeId]);

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
