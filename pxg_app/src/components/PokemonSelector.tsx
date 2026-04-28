import { useDeferredValue, useMemo, useState } from "react";
import type { Pokemon, PokemonElement, Tier } from "../types";
import { PokemonCard } from "./PokemonCard";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import SearchIcon from "@mui/icons-material/Search";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import CloseIcon from "@mui/icons-material/Close";
import { VirtuosoGrid } from "react-virtuoso";

const ALL_ELEMENTS: PokemonElement[] = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
  "crystal",
];

const ALL_TIERS: Tier[] = ["T1A", "T1B", "T1H", "T1C", "T2", "T3", "TM", "TR"];

const ELEMENT_COLORS: Record<string, { bg: string; text: string }> = {
  fire: { bg: "#f08030", text: "#fff" },
  water: { bg: "#6890f0", text: "#fff" },
  grass: { bg: "#78c850", text: "#fff" },
  electric: { bg: "#f8d030", text: "#222" },
  ice: { bg: "#98d8d8", text: "#222" },
  fighting: { bg: "#c03028", text: "#fff" },
  poison: { bg: "#a040a0", text: "#fff" },
  ground: { bg: "#e0c068", text: "#222" },
  flying: { bg: "#a890f0", text: "#fff" },
  psychic: { bg: "#f85888", text: "#fff" },
  bug: { bg: "#a8b820", text: "#fff" },
  rock: { bg: "#b8a038", text: "#fff" },
  ghost: { bg: "#705898", text: "#fff" },
  dragon: { bg: "#7038f8", text: "#fff" },
  dark: { bg: "#705848", text: "#fff" },
  steel: { bg: "#b8b8d0", text: "#222" },
  fairy: { bg: "#ee99ac", text: "#222" },
  normal: { bg: "#a8a878", text: "#fff" },
};

const FILTER_LABEL_SX = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "text.disabled",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  minWidth: 48,
};

interface Props {
  allPokemon: Pokemon[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClearSelection?: () => void;
  elementsByPokeId: Record<string, string[]>;
}

export function PokemonSelector({ allPokemon, selectedIds, onToggle, onClearSelection, elementsByPokeId }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<Tier | "">("");

  // Deferred values: filtros mudam imediato no input UI, mas a grid grande
  // re-renderiza num passo de menor prioridade — input fica responsivo.
  const deferredSearch = useDeferredValue(search);
  const deferredTypeFilter = useDeferredValue(typeFilter);
  const deferredTierFilter = useDeferredValue(tierFilter);

  const filtered = useMemo(() => {
    let list = allPokemon;
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (deferredTypeFilter) {
      list = list.filter((p) => (elementsByPokeId[p.id] ?? []).includes(deferredTypeFilter));
    }
    if (deferredTierFilter) {
      list = list.filter((p) => p.tier === deferredTierFilter);
    }
    return list;
  }, [allPokemon, deferredSearch, deferredTypeFilter, deferredTierFilter, elementsByPokeId]);

  const sorted = useMemo(() => {
    const selected = filtered.filter((p) => selectedIds.includes(p.id));
    const rest = filtered.filter((p) => !selectedIds.includes(p.id));
    return [...selected, ...rest];
  }, [filtered, selectedIds]);

  const isStale = deferredSearch !== search || deferredTypeFilter !== typeFilter || deferredTierFilter !== tierFilter;
  const hasFilters = search.trim() !== "" || typeFilter !== "" || tierFilter !== "";
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setTierFilter(("" as Tier | ""));
  };

  return (
    <Paper component="section" sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", sm: "row" },
          gap: 1.5,
          mb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <CatchingPokemonIcon sx={{ color: "primary.light", fontSize: 26 }} />
          <Typography variant="h2" sx={{ m: 0 }}>
            Pokémon disponíveis
          </Typography>
          <Chip
            label={`${selectedIds.length} ${selectedIds.length === 1 ? "selecionado" : "selecionados"}`}
            size="small"
            color={selectedIds.length > 0 ? "primary" : "default"}
            variant={selectedIds.length > 0 ? "filled" : "outlined"}
            sx={{ fontWeight: 700, height: 22 }}
          />
        </Box>
        {selectedIds.length > 0 && onClearSelection && (
          <Tooltip title="Desmarca todos os pokémons selecionados" arrow>
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<ClearAllIcon />}
              onClick={onClearSelection}
              sx={{ color: "text.secondary", "&:hover": { color: "error.light" } }}
            >
              Limpar seleção
            </Button>
          </Tooltip>
        )}
      </Box>

      <TextField
        fullWidth
        size="small"
        placeholder={`Buscar em ${allPokemon.length} pokémons...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: "text.disabled", fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch("")} sx={{ color: "text.disabled" }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
        <Typography sx={FILTER_LABEL_SX}>Tier</Typography>
        <Chip
          label="todos"
          size="small"
          variant={tierFilter === "" ? "filled" : "outlined"}
          color={tierFilter === "" ? "primary" : "default"}
          onClick={() => setTierFilter("")}
          sx={{ fontWeight: 600, cursor: "pointer" }}
        />
        {ALL_TIERS.map((t) => (
          <Chip
            key={t}
            label={t}
            size="small"
            variant={tierFilter === t ? "filled" : "outlined"}
            color={tierFilter === t ? "primary" : "default"}
            onClick={() => setTierFilter(tierFilter === t ? "" : t)}
            sx={{ fontWeight: 700, cursor: "pointer", letterSpacing: "0.03em" }}
          />
        ))}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
        <Typography sx={FILTER_LABEL_SX}>Tipo</Typography>
        <Chip
          label="todos"
          size="small"
          variant={typeFilter === "" ? "filled" : "outlined"}
          color={typeFilter === "" ? "primary" : "default"}
          onClick={() => setTypeFilter("")}
          sx={{ fontWeight: 600, cursor: "pointer" }}
        />
        {ALL_ELEMENTS.map((t) => {
          const active = typeFilter === t;
          const colors = ELEMENT_COLORS[t];
          if (!colors) {
            // crystal e outros sem cor — fallback genérico
            return (
              <Chip
                key={t}
                label={t}
                size="small"
                variant={active ? "filled" : "outlined"}
                color={active ? "primary" : "default"}
                onClick={() => setTypeFilter(active ? "" : t)}
                sx={{ fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
              />
            );
          }
          return (
            <Chip
              key={t}
              label={t}
              size="small"
              onClick={() => setTypeFilter(active ? "" : t)}
              sx={{
                bgcolor: colors.bg,
                color: colors.text,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
                border: 2,
                borderColor: active ? "#fff" : "transparent",
                boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.25)" : undefined,
                "&:hover": {
                  bgcolor: colors.bg,
                  filter: "brightness(1.15)",
                },
              }}
            />
          );
        })}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          minHeight: 22,
        }}
      >
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          {hasFilters ? (
            <>
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>
                {sorted.length}
              </Box>
              {" de "}
              {allPokemon.length}
              {" pokémons"}
            </>
          ) : (
            <>
              {allPokemon.length}
              {" pokémons"}
            </>
          )}
        </Typography>
        {hasFilters && (
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<CloseIcon fontSize="small" />}
            onClick={clearFilters}
            sx={{ fontSize: "0.7rem", py: 0, color: "text.disabled", "&:hover": { color: "primary.light" } }}
          >
            Limpar filtros
          </Button>
        )}
      </Box>

      <Box
        sx={{
          height: 480,
          opacity: isStale ? 0.5 : 1,
          transition: "opacity 0.15s",
          // Virtuoso usa um Scroller interno; custom estilo do scrollbar
          "& [data-testid='virtuoso-scroller']": { pr: 0.5 },
        }}
      >
        <VirtuosoGrid
          data={sorted}
          totalCount={sorted.length}
          overscan={400}
          listClassName="poke-grid-list"
          itemContent={(_index, p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <PokemonCard
                pokemon={p}
                selected={isSelected}
                disabled={false}
                onToggle={onToggle}
              />
            );
          }}
        />
      </Box>

      {sorted.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1, textAlign: "center" }}>
          Nenhum pokémon encontrado{hasFilters ? " — tente ajustar os filtros" : ""}
        </Typography>
      )}
      {selectedIds.length === 0 && sorted.length > 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
          Clique nos pokémons acima para selecionar
        </Typography>
      )}
    </Paper>
  );
}
