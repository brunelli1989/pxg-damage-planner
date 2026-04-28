import type { Lure, RotationResult as RotationResultType } from "../types";
import { SkillBadge } from "./SkillBadge";
import { ELIXIR_PRICE, REVIVE_PRICE } from "../engine/cooldown";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import LoopIcon from "@mui/icons-material/Loop";
import ScheduleIcon from "@mui/icons-material/Schedule";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ShieldIcon from "@mui/icons-material/Shield";

interface Props {
  result: RotationResultType;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function countConsumablesPerCycle(result: RotationResultType) {
  let elixirAtk = 0, reviveNormal = 0, reviveSuperior = 0;
  for (const step of result.steps) {
    if (step.lure.usesElixirAtk) elixirAtk++;
    if (step.lure.reviveTier === "normal") reviveNormal++;
    if (step.lure.reviveTier === "superior") reviveSuperior++;
  }
  return { elixirAtk, reviveNormal, reviveSuperior };
}

function lureFinisherLabel(lure: Lure): string {
  if (lure.usesDevice) return "Device";
  if (lure.usesElixirAtk) return lure.type === "solo_elixir" ? "Swordsman Elixir" : "+ Swordsman Elixir";
  if (lure.type === "group") {
    const count = 2 + lure.extraMembers.length;
    return `Group (${count})`;
  }
  return "Dupla";
}

const FINISHER_COLOR: Record<string, "warning" | "error" | "success" | "secondary"> = {
  device: "warning",
  elixir: "error",
  dupla: "success",
  group: "success",
  revive: "secondary",
};

function lureFinisherKey(lure: Lure): keyof typeof FINISHER_COLOR {
  if (lure.usesDevice) return "device";
  if (lure.usesElixirAtk) return "elixir";
  if (lure.type === "group") return "group";
  return "dupla";
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

function TierChip({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? "#888";
  const lightText = ["TR", "TM"].includes(tier);
  return (
    <Chip
      label={tier}
      size="small"
      sx={{
        bgcolor: color,
        color: lightText ? "#fff" : "#1a1a2e",
        fontWeight: 700,
        fontSize: "0.65rem",
        height: 18,
      }}
    />
  );
}

interface KpiProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  highlight?: boolean;
}

function Kpi({ label, value, icon, highlight }: KpiProps) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1.25,
        borderRadius: 1.5,
        bgcolor: highlight ? "rgba(74, 144, 217, 0.12)" : "transparent",
        border: 1,
        borderColor: highlight ? "primary.main" : "divider",
        minWidth: 110,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
        {icon}
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: highlight ? "1.4rem" : "1.05rem", fontWeight: 700, color: highlight ? "primary.light" : "text.primary", lineHeight: 1.1 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function RotationResultView({ result }: Props) {
  const c = countConsumablesPerCycle(result);
  const cyclePerHour = 3600 / result.totalTime;
  const elixirAtkPerHour = c.elixirAtk * cyclePerHour;
  const reviveNormalPerHour = c.reviveNormal * cyclePerHour;
  const reviveSuperiorPerHour = c.reviveSuperior * cyclePerHour;
  const totalCostPerHour =
    elixirAtkPerHour * ELIXIR_PRICE +
    reviveNormalPerHour * REVIVE_PRICE.normal +
    reviveSuperiorPerHour * REVIVE_PRICE.superior;
  const hasConsumables = c.elixirAtk + c.reviveNormal + c.reviveSuperior > 0;

  const boxesPerHour = Math.round((3600 * result.steps.length) / result.totalTime);
  const pokesPerHour = Math.round((3600 * result.steps.length * 6) / result.totalTime);

  const consumablesText: string[] = [];
  if (c.elixirAtk > 0) consumablesText.push(`${elixirAtkPerHour.toFixed(1)} swordsman`);
  if (c.reviveNormal > 0) consumablesText.push(`${reviveNormalPerHour.toFixed(1)} revive`);
  if (c.reviveSuperior > 0) consumablesText.push(`${reviveSuperiorPerHour.toFixed(1)} revive+`);

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      {/* Header com título e KPIs */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Rotação Ótima
          <Box component="span" sx={{ ml: 1, color: "text.secondary", fontSize: "0.9rem", fontWeight: 400 }}>
            ({result.steps.length} {result.steps.length === 1 ? "lure" : "lures"} por ciclo)
          </Box>
        </Typography>

        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Kpi label="Boxes / hora" value={boxesPerHour} highlight />
          <Kpi label="Pokémons / hora" value={pokesPerHour} highlight />
          <Kpi label="Tempo do ciclo" value={formatTime(result.totalTime)} icon={<ScheduleIcon sx={{ fontSize: 14, color: "text.secondary" }} />} />
          <Kpi label="Tempo ocioso" value={formatTime(result.totalIdle)} icon={<HourglassEmptyIcon sx={{ fontSize: 14, color: "text.secondary" }} />} />
          {hasConsumables && (
            <Tooltip title={`Custo total: $${Math.round(totalCostPerHour).toLocaleString()}/hora`}>
              <Box>
                <Kpi
                  label="Consumíveis / hora"
                  value={
                    <Box>
                      <Box sx={{ fontSize: "0.85rem", lineHeight: 1.3 }}>{consumablesText.join(" + ")}</Box>
                      <Box sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500 }}>
                        ${Math.round(totalCostPerHour).toLocaleString()}/h
                      </Box>
                    </Box>
                  }
                />
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Steps */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {result.steps.map((step, i) => {
          const lure = step.lure;
          const activeDuration = step.timeEnd - step.timeStart - step.idleBefore;
          const finisherKey = lureFinisherKey(lure);
          return (
            <Box
              key={i}
              sx={{
                display: "flex",
                gap: 2,
                p: 2,
                bgcolor: "background.default",
                borderRadius: 1.5,
                border: 1,
                borderColor: "divider",
                transition: "border-color 0.15s",
                "&:hover": { borderColor: "primary.main" },
              }}
            >
              <Avatar
                sx={{
                  bgcolor: "primary.main",
                  color: "white",
                  width: 32,
                  height: 32,
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* Linha 1: pokes + finisher */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.95rem" }}>{lure.starter.name}</Typography>
                  <TierChip tier={lure.starter.tier} />
                  {lure.second && (
                    <>
                      <Typography sx={{ color: "text.disabled", fontWeight: 600 }}>+</Typography>
                      <Typography sx={{ fontWeight: 600, fontSize: "0.95rem" }}>{lure.second.name}</Typography>
                      <TierChip tier={lure.second.tier} />
                    </>
                  )}
                  {lure.extraMembers.map((m) => (
                    <Box key={m.poke.id} sx={{ display: "contents" }}>
                      <Typography sx={{ color: "text.disabled", fontWeight: 600 }}>+</Typography>
                      <Typography sx={{ fontWeight: 600, fontSize: "0.95rem" }}>{m.poke.name}</Typography>
                      <TierChip tier={m.poke.tier} />
                    </Box>
                  ))}
                  <Box sx={{ flex: 1 }} />
                  <Chip
                    label={lureFinisherLabel(lure)}
                    size="small"
                    color={FINISHER_COLOR[finisherKey]}
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: "0.7rem", height: 22 }}
                  />
                  {lure.reviveTier && (() => {
                    const target =
                      lure.starter.id === lure.revivePokemonId ? lure.starter.name
                      : lure.second?.id === lure.revivePokemonId ? lure.second.name
                      : lure.extraMembers.find((m) => m.poke.id === lure.revivePokemonId)?.poke.name;
                    const label = lure.reviveTier === "superior" ? "Revive+" : "Revive";
                    return (
                      <Tooltip title={`${target} casta o kit 2×`}>
                        <Chip
                          icon={<LoopIcon sx={{ fontSize: 14 }} />}
                          label={`${label} (${target})`}
                          size="small"
                          color="secondary"
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: "0.7rem", height: 22 }}
                        />
                      </Tooltip>
                    );
                  })()}
                  {lure.starterUsesHarden && (
                    <Tooltip title="Starter usa Harden pra defesa">
                      <Chip
                        icon={<ShieldIcon sx={{ fontSize: 14 }} />}
                        label="Harden"
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.7rem",
                          height: 22,
                          color: "#3498db",
                          borderColor: "#3498db",
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>

                {/* Linha 2: skills */}
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.25, mb: 1 }}>
                  <SkillsRow label={lure.starter.name} skills={lure.starterSkills} />
                  {lure.second && lure.secondSkills.length > 0 && (
                    <SkillsRow label={lure.second.name} skills={lure.secondSkills} />
                  )}
                  {lure.extraMembers.map((m) => (
                    <SkillsRow key={m.poke.id} label={m.poke.name} skills={m.skills} />
                  ))}
                </Box>

                {/* Linha 3: timing */}
                <Box sx={{ display: "flex", gap: 2, fontSize: "0.75rem", color: "text.disabled" }}>
                  <Typography component="span" variant="caption">
                    Duração: <strong>{formatTime(activeDuration)}</strong>
                  </Typography>
                  {step.idleBefore > 0 && (
                    <Typography component="span" variant="caption" sx={{ color: "error.main", fontWeight: 600 }}>
                      Espera: {formatTime(step.idleBefore)}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box
        sx={{
          mt: 2,
          textAlign: "center",
          py: 1,
          color: "primary.light",
          fontSize: "0.85rem",
          fontWeight: 600,
          border: 1,
          borderStyle: "dashed",
          borderColor: "primary.dark",
          borderRadius: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <LoopIcon sx={{ fontSize: 16 }} />
        Volta ao passo 1
      </Box>
    </Paper>
  );
}

function SkillsRow({ label, skills }: { label: string; skills: import("../types").Skill[] }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.25, mr: 2 }}>
      <Typography sx={{ fontSize: "0.7rem", color: "text.disabled", fontWeight: 600, mr: 0.5 }}>
        {label}:
      </Typography>
      {skills.map((skill, j) => (
        <Box key={skill.name} sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
          {j > 0 && <Box component="span" sx={{ color: "#555", fontSize: "0.75rem", mx: 0.25 }}>→</Box>}
          <SkillBadge skill={skill} compact />
        </Box>
      ))}
    </Box>
  );
}
