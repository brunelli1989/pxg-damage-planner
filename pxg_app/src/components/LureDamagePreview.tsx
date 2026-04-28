import { useMemo } from "react";
import type { DamageConfig, RotationResult } from "../types";
import { estimateLureDamagePerMob, lureFinalizesBox } from "../engine/damage";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

interface Props {
  result: RotationResult;
  config: DamageConfig;
}

export function LureDamagePreview({ result, config }: Props) {
  // Engine aplica override hasDevice=true no device holder. Espelhamos isso aqui
  // pro dano mostrado bater com o que o engine usou pra decidir a rotação.
  const effectiveConfig = useMemo(() => {
    if (!result.devicePokemonId) return config;
    const baseSetup = config.pokeSetups[result.devicePokemonId];
    if (!baseSetup || baseSetup.hasDevice) return config;
    return {
      ...config,
      pokeSetups: {
        ...config.pokeSetups,
        [result.devicePokemonId]: { ...baseSetup, hasDevice: true },
      },
    };
  }, [config, result.devicePokemonId]);

  const mob = effectiveConfig.mob;

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 1.5, mb: 0.5 }}>
        <Typography variant="h2">Dano por Lure</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          vs <strong>{mob.name}</strong>
        </Typography>
        {mob.types.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {mob.types.map((t) => (
              <Chip
                key={t}
                label={t}
                size="small"
                sx={{ height: 20, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
              />
            ))}
          </Box>
        )}
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          HP: <strong>{mob.hp.toLocaleString()}</strong>
        </Typography>
      </Box>

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 2 }}>
        Estimativa de dano por mob (1 dos 6 da box). "Finaliza" indica se o dano por mob ≥ HP do mob.
      </Typography>

      <TableContainer>
        <Table size="small" sx={{ "& td, & th": { borderColor: "divider" } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>#</TableCell>
              <TableCell sx={headerCellSx}>Pokes</TableCell>
              <TableCell align="right" sx={headerCellSx}>Dano/mob</TableCell>
              <TableCell sx={headerCellSx}>% HP</TableCell>
              <TableCell align="center" sx={headerCellSx}>Finaliza?</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {result.steps.map((step, i) => {
              const dmg = estimateLureDamagePerMob(step.lure, effectiveConfig);
              const pct = (dmg / mob.hp) * 100;
              const finalizes = lureFinalizesBox(step.lure, effectiveConfig);
              const pokes = [
                step.lure.starter.name,
                step.lure.second?.name,
                ...step.lure.extraMembers.map((m) => m.poke.name),
              ]
                .filter(Boolean)
                .join(" + ");
              const cappedPct = Math.min(100, pct);

              return (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>{i + 1}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{pokes}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {Math.round(dmg).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ minWidth: 200 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={cappedPct}
                        color={finalizes ? "success" : "error"}
                        sx={{ flex: 1, height: 6, borderRadius: 3 }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ minWidth: 56, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
                      >
                        {pct.toFixed(1)}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    {finalizes ? (
                      <CheckCircleIcon sx={{ color: "success.main", fontSize: 22 }} />
                    ) : (
                      <CancelIcon sx={{ color: "error.main", fontSize: 22 }} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

const headerCellSx = {
  fontWeight: 700,
  color: "text.secondary",
  fontSize: "0.72rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};
