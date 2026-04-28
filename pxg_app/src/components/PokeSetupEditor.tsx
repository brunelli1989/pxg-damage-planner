import { useEffect, useMemo, useState } from "react";
import type { DamageConfig, HeldKind, HeldItem, Pokemon, PokeSetup, Tier, XAtkTier } from "../types";
import { estimatePokeSoloDamage } from "../engine/damage";
import { getOptimalSkillOrder } from "../engine/scoring";
import { DEFAULT_POKE_SETUP } from "../hooks/useDamageConfig";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import CalculateIcon from "@mui/icons-material/Calculate";

const X_ATK_TIERS_ALL: XAtkTier[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const MAX_BOOST = 80;
function minBoostForTier(tier: Tier): number {
  if (tier === "TR") return 70;
  if (tier === "TM") return 80;
  return 0;
}
function clampBoost(tier: Tier, v: number): number {
  return Math.min(Math.max(v, minBoostForTier(tier)), MAX_BOOST);
}

const TIER_ORDER: Record<Tier, number> = { T1A: 0, T1B: 1, T1H: 2, T1C: 3, T2: 4, T3: 5, TM: 6, TR: 7 };

type SortCol = "name" | "boost" | "heldKind" | "heldTier" | "noDevice" | "withDevice" | "noDeviceElixir" | "withDeviceElixir";
type SortDir = "asc" | "desc";

interface Props {
  pokes: Pokemon[];
  config: DamageConfig;
  onChange: (pokeId: string, setup: Partial<PokeSetup>) => void;
}

interface DamageRow {
  noDevice: number;
  withDevice: number;
  noDeviceElixir: number;
  withDeviceElixir: number;
}

const COLS: { id: SortCol; label: string; numeric: boolean; tooltip?: string }[] = [
  { id: "name", label: "Pokémon", numeric: false },
  { id: "boost", label: "Boost", numeric: true },
  { id: "heldKind", label: "X-Held", numeric: false },
  { id: "heldTier", label: "Tier", numeric: false },
  { id: "noDevice", label: "Sem device", numeric: true },
  { id: "withDevice", label: "Com device", numeric: true },
  { id: "noDeviceElixir", label: "+ Elixir (s/ device)", numeric: true },
  { id: "withDeviceElixir", label: "+ Elixir (c/ device)", numeric: true },
];

export function PokeSetupEditor({ pokes, config, onChange }: Props) {
  const [estimates, setEstimates] = useState<Record<string, DamageRow>>({});
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "name", dir: "asc" });

  const toggleSort = (col: SortCol) => {
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
  };

  const sortedPokes = useMemo(() => {
    const getValue = (p: Pokemon): string | number => {
      const setup = config.pokeSetups[p.id] ?? DEFAULT_POKE_SETUP;
      const est = estimates[p.id];
      switch (sort.col) {
        case "name": return p.name.toLowerCase();
        case "boost": return clampBoost(p.tier, setup.boost);
        case "heldKind": return setup.held.kind;
        case "heldTier": return setup.held.tier * 10 + TIER_ORDER[p.tier];
        case "noDevice": return est?.noDevice ?? -1;
        case "withDevice": return est?.withDevice ?? -1;
        case "noDeviceElixir": return est?.noDeviceElixir ?? -1;
        case "withDeviceElixir": return est?.withDeviceElixir ?? -1;
      }
    };
    const sorted = [...pokes].sort((a, b) => {
      const av = getValue(a), bv = getValue(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [pokes, config.pokeSetups, estimates, sort]);

  useEffect(() => {
    for (const p of pokes) {
      const stored = config.pokeSetups[p.id];
      if (stored && stored.boost !== clampBoost(p.tier, stored.boost)) {
        onChange(p.id, { boost: clampBoost(p.tier, stored.boost) });
      }
    }
  }, [pokes, config.pokeSetups, onChange]);

  if (pokes.length === 0) return null;

  const handleEstimate = () => {
    const configWithDefaults: DamageConfig = {
      ...config,
      pokeSetups: { ...config.pokeSetups },
    };
    for (const p of pokes) {
      if (!configWithDefaults.pokeSetups[p.id]) {
        configWithDefaults.pokeSetups[p.id] = DEFAULT_POKE_SETUP;
      }
    }

    const next: Record<string, DamageRow> = {};
    for (const p of pokes) {
      const ordered = getOptimalSkillOrder(p);
      next[p.id] = {
        noDevice: estimatePokeSoloDamage(p, ordered, configWithDefaults, false, false),
        withDevice: estimatePokeSoloDamage(p, ordered, configWithDefaults, true, false),
        noDeviceElixir: estimatePokeSoloDamage(p, ordered, configWithDefaults, false, true),
        withDeviceElixir: estimatePokeSoloDamage(p, ordered, configWithDefaults, true, true),
      };
    }
    setEstimates(next);
  };

  const fmtDmg = (n: number | undefined) => (n !== undefined && n >= 0 ? Math.round(n).toLocaleString() : "—");

  // Pra destaque visual: melhor valor por linha (entre as 4 colunas de dano)
  const bestPerRow = (est: DamageRow | undefined): keyof DamageRow | null => {
    if (!est) return null;
    let bestKey: keyof DamageRow = "noDevice";
    let bestVal = est.noDevice;
    (["withDevice", "noDeviceElixir", "withDeviceElixir"] as (keyof DamageRow)[]).forEach((k) => {
      if (est[k] > bestVal) { bestVal = est[k]; bestKey = k; }
    });
    return bestKey;
  };

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h2">Setup dos Pokémons</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<CalculateIcon />}
          onClick={handleEstimate}
        >
          Estimar dano
        </Button>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ mb: 2, display: "block" }}>
        X-Held: X-Attack (T1-T8) ou X-Boost (T1-T7). Só 1 held por poke. Boost mínimo: TR ≥70, TM ≥80.
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ "& td, & th": { borderColor: "divider" } }}>
          <TableHead>
            <TableRow>
              {COLS.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.numeric ? "right" : "left"}
                  sx={{ fontWeight: 600, color: "text.secondary", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}
                >
                  <TableSortLabel
                    active={sort.col === col.id}
                    direction={sort.col === col.id ? sort.dir : "asc"}
                    onClick={() => toggleSort(col.id)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedPokes.map((p) => {
              const setup = config.pokeSetups[p.id] ?? {
                ...DEFAULT_POKE_SETUP,
                boost: clampBoost(p.tier, DEFAULT_POKE_SETUP.boost),
              };
              const heldKind = setup.held.kind;
              const maxTier: XAtkTier = heldKind === "x-boost" ? 7 : 8;
              const availableTiers = X_ATK_TIERS_ALL.filter((t) => t <= maxTier);
              const minBoost = minBoostForTier(p.tier);

              const setHeld = (next: Partial<HeldItem>) => {
                onChange(p.id, { held: { ...setup.held, ...next } });
              };

              const est = estimates[p.id];
              const best = bestPerRow(est);

              const dmgCellSx = (key: keyof DamageRow) => ({
                fontVariantNumeric: "tabular-nums" as const,
                fontWeight: best === key ? 700 : 400,
                color: best === key ? "secondary.main" : "text.primary",
              });

              return (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={clampBoost(p.tier, setup.boost)}
                      onChange={(e) => onChange(p.id, { boost: clampBoost(p.tier, Number(e.target.value)) })}
                      slotProps={{ htmlInput: { min: minBoost, max: MAX_BOOST } }}
                      sx={{ width: 80, "& input": { textAlign: "right" } }}
                      title={`${p.tier}: boost ${minBoost}-${MAX_BOOST}`}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={heldKind}
                      onChange={(e) => {
                        const kind = e.target.value as HeldKind;
                        let tier = setup.held.tier;
                        if (kind === "x-boost" && tier > 7) tier = 7;
                        if (kind === "none") tier = 0;
                        setHeld({ kind, tier: tier as XAtkTier });
                      }}
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="none">Nenhum</MenuItem>
                      <MenuItem value="x-attack">X-Attack</MenuItem>
                      <MenuItem value="x-boost">X-Boost</MenuItem>
                      <MenuItem value="x-critical">X-Critical</MenuItem>
                      <MenuItem value="x-defense">X-Defense</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={setup.held.tier}
                      disabled={heldKind === "none"}
                      onChange={(e) => setHeld({ tier: Number(e.target.value) as XAtkTier })}
                      sx={{ minWidth: 80 }}
                    >
                      {availableTiers.map((t) => (
                        <MenuItem key={t} value={t}>{t === 0 ? "—" : `T${t}`}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right" sx={dmgCellSx("noDevice")}>{fmtDmg(est?.noDevice)}</TableCell>
                  <TableCell align="right" sx={dmgCellSx("withDevice")}>{fmtDmg(est?.withDevice)}</TableCell>
                  <TableCell align="right" sx={dmgCellSx("noDeviceElixir")}>{fmtDmg(est?.noDeviceElixir)}</TableCell>
                  <TableCell align="right" sx={dmgCellSx("withDeviceElixir")}>{fmtDmg(est?.withDeviceElixir)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
