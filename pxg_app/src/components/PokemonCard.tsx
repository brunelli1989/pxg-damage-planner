import { memo } from "react";
import type { Pokemon } from "../types";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

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

const ROLE_LABELS: Record<string, string> = {
  offensive_tank: "Off-Tank",
  burst_dd: "BDD",
  otdd: "OTDD",
  tank: "Tank",
  speedster: "Speed",
  support: "Sup",
  disrupter: "Disrupt",
};

function ccLabel(pokemon: Pokemon): string {
  const kinds = new Set(pokemon.skills.filter((s) => s.cc !== null).map((s) => s.cc));
  if (kinds.size === 0) return "No CC";
  return Array.from(kinds).join("/");
}

function PokemonCardImpl({ pokemon, selected, disabled, onToggle }: Props) {
  const cc = ccLabel(pokemon);
  const hasCC = cc !== "No CC";
  const uncalibrated = Boolean(pokemon.todo);
  const skillCount = pokemon.skills.length;
  const roleLabel = pokemon.role ? ROLE_LABELS[pokemon.role] : null;
  const tierColor = TIER_COLORS[pokemon.tier] ?? "#888";

  return (
    <Card
      sx={{
        opacity: disabled ? 0.4 : 1,
        border: 2,
        borderColor: selected ? "primary.main" : "transparent",
        bgcolor: selected ? "rgba(74, 144, 217, 0.08)" : "background.paper",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        "&:hover": disabled ? {} : {
          transform: "translateY(-2px)",
          boxShadow: 6,
        },
        position: "relative",
        overflow: "hidden",
        // Performance: browser pula render de cards fora do viewport.
        // contain-intrinsic-size reserva espaço sem renderizar conteúdo.
        contentVisibility: "auto",
        containIntrinsicSize: "0 140px",
      }}
    >
      {/* Faixa de cor do tier no topo */}
      <Box sx={{ height: 4, bgcolor: tierColor }} />

      <CardActionArea
        disabled={disabled}
        onClick={() => onToggle(pokemon.id)}
        sx={{ alignItems: "stretch" }}
      >
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          {/* Header: nome + tier badge + warning */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, mb: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {pokemon.name}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexShrink: 0 }}>
              {uncalibrated && (
                <Tooltip
                  title={
                    `Ação pendente: ${pokemon.todo}` +
                    (pokemon.observacao ? `\n\nObservação: ${pokemon.observacao}` : "")
                  }
                >
                  <WarningAmberIcon sx={{ fontSize: 16, color: "warning.main" }} />
                </Tooltip>
              )}
              <Chip
                label={pokemon.tier}
                size="small"
                sx={{
                  bgcolor: tierColor,
                  color: "#1a1a2e",
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  height: 20,
                }}
              />
            </Box>
          </Box>

          {/* Tipos */}
          {pokemon.elements && pokemon.elements.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {pokemon.elements.map((el) => {
                const colors = ELEMENT_COLORS[el] ?? { bg: "#444", text: "#fff" };
                return (
                  <Chip
                    key={el}
                    label={el}
                    size="small"
                    sx={{
                      bgcolor: colors.bg,
                      color: colors.text,
                      fontSize: "0.65rem",
                      height: 18,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontWeight: 600,
                    }}
                  />
                );
              })}
            </Box>
          )}

          {/* Footer: CC, Role, skill count */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Chip
              label={cc}
              size="small"
              color={hasCC ? "success" : "error"}
              sx={{
                height: 20,
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            />
            {roleLabel && (
              <Chip
                label={roleLabel}
                size="small"
                variant="outlined"
                sx={{
                  height: 20,
                  fontSize: "0.65rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "text.secondary",
                  borderColor: "divider",
                }}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" color="text.disabled">
              {skillCount > 0 ? `${skillCount} skills` : "—"}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

/**
 * memo evita re-render quando pokemon/selected/disabled/onToggle não mudam.
 * Crítico aqui pq a grade pode ter 586 cards — sem memo, qualquer mudança
 * em PokemonSelector (como filtro de tier) re-renderiza todos.
 * onToggle precisa ser estável (useCallback no parent — já é em App.tsx).
 */
export const PokemonCard = memo(PokemonCardImpl);
