import { Suspense, lazy, useState, useCallback, useEffect, useTransition } from "react";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CircularProgress from "@mui/material/CircularProgress";
import type { DiskLevel, Pokemon, RotationResult } from "./types";
import pokemonData from "./data/pokemon.json";
import { PokemonSelector } from "./components/PokemonSelector";
import { RotationResultView } from "./components/RotationResult";
import { SkillTimeline } from "./components/SkillTimeline";
import { DamageConfigPanel } from "./components/DamageConfigPanel";
import { PokeSetupEditor } from "./components/PokeSetupEditor";
import { LureDamagePreview } from "./components/LureDamagePreview";

// Code split: OtddPage só baixa quando user clica na tab pela primeira vez.
const OtddPage = lazy(() =>
  import("./components/OtddPage").then((m) => ({ default: m.OtddPage }))
);
import { useRotation } from "./hooks/useRotation";
import { useDamageConfig } from "./hooks/useDamageConfig";
import { ELIXIR_PRICE, REVIVE_PRICE } from "./engine/cooldown";

const CONSUMABLE_PRICES = {
  elixir: ELIXIR_PRICE,
  reviveNormal: REVIVE_PRICE.normal,
  reviveSuperior: REVIVE_PRICE.superior,
};

const allPokemon: Pokemon[] = (pokemonData as Pokemon[]).slice().sort((a, b) =>
  a.name.localeCompare(b.name)
);

const pokeElements: Record<string, string[]> = Object.fromEntries(
  allPokemon.map((p) => [p.id, p.elements ?? []])
);

const DISK_STORAGE_KEY = "pxg_disk_level";
const SELECTED_STORAGE_KEY = "pxg_selected_ids";

function loadDiskLevel(): DiskLevel {
  const raw = localStorage.getItem(DISK_STORAGE_KEY);
  if (raw === null) return 4;
  const n = Number(raw);
  if (n === 0 || n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 4;
}

function loadSelectedIds(): string[] {
  const raw = localStorage.getItem(SELECTED_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      const validIds = new Set(allPokemon.map((p) => p.id));
      return parsed.filter((id) => validIds.has(id));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function buildReport(
  selectedIds: string[],
  diskLevel: DiskLevel,
  result: RotationResult | null,
  damageConfig?: import("./types").DamageConfig
): string {
  const lines: string[] = [];
  lines.push(`=== PxG Rotation Generator — Dados ===`);
  lines.push(`Disk: ${diskLevel === 0 ? "Nenhum" : `Disk ${diskLevel}.0`}`);
  if (damageConfig) {
    lines.push(`Player: lvl ${damageConfig.playerLvl} | clã ${damageConfig.clan ?? "Nenhum"} | hunt ${damageConfig.hunt}`);
    const m = damageConfig.mob;
    const bestStr = m.bestStarterElements?.length ? ` | best starter: ${m.bestStarterElements.join(", ")}` : "";
    lines.push(`Mob: ${m.name} (${m.types.join("/")}) HP=${m.hp} def=${m.defFactor ?? "—"}${bestStr}`);
    const dev = damageConfig.device;
    lines.push(`Device held: ${dev.kind === "none" ? "—" : `${dev.kind} T${dev.tier}`}`);
    if (damageConfig.useElixirAtk === false) lines.push(`Swordsman Elixir: desligado`);
  }
  lines.push(`Pokémons selecionados (${selectedIds.length}):`);
  selectedIds.forEach((id) => {
    const p = allPokemon.find((x) => x.id === id);
    if (p) lines.push(`  - ${p.name} (${p.tier})`);
  });
  lines.push("");

  if (!result) {
    lines.push("(Nenhuma rotação gerada ainda)");
    return lines.join("\n");
  }

  const boxesPerHour = Math.round((3600 * result.steps.length) / result.totalTime);
  const pokesPerHour = boxesPerHour * 6;

  lines.push(`=== Resultado ===`);
  lines.push(`Ciclo: ${formatTime(result.totalTime)} | Ocioso: ${formatTime(result.totalIdle)} | Lures: ${result.steps.length}`);
  lines.push(`Boxes/h: ${boxesPerHour} | Pokémons/h: ${pokesPerHour}`);

  const elixirAtk = result.steps.filter((s) => s.lure.usesElixirAtk).length;
  const reviveNormal = result.steps.filter((s) => s.lure.reviveTier === "normal").length;
  const reviveSuperior = result.steps.filter((s) => s.lure.reviveTier === "superior").length;
  if (elixirAtk + reviveNormal + reviveSuperior > 0) {
    const cyclePerHour = 3600 / result.totalTime;
    const atkPerHour = elixirAtk * cyclePerHour;
    const rNormalPerHour = reviveNormal * cyclePerHour;
    const rSupPerHour = reviveSuperior * cyclePerHour;
    const cost = Math.round(
      atkPerHour * CONSUMABLE_PRICES.elixir +
      rNormalPerHour * CONSUMABLE_PRICES.reviveNormal +
      rSupPerHour * CONSUMABLE_PRICES.reviveSuperior
    );
    const parts: string[] = [];
    if (atkPerHour > 0) parts.push(`${atkPerHour.toFixed(1)} swordsman`);
    if (rNormalPerHour > 0) parts.push(`${rNormalPerHour.toFixed(1)} revive`);
    if (rSupPerHour > 0) parts.push(`${rSupPerHour.toFixed(1)} revive+`);
    lines.push(`Consumíveis/h: ${parts.join(" + ")} (~$${cost.toLocaleString()}/h)`);
  }

  const devicePoke = result.devicePokemonId
    ? allPokemon.find((p) => p.id === result.devicePokemonId)?.name
    : null;
  lines.push(`Device: ${devicePoke ?? "Nenhum"}`);
  lines.push("");

  lines.push(`=== Rotação (${result.steps.length} lures) ===`);
  result.steps.forEach((step, i) => {
    const lure = step.lure;
    const activeTime = step.timeEnd - step.timeStart - step.idleBefore;
    const typeLabel =
      lure.type === "group"
        ? `Group (${2 + lure.extraMembers.length})`
        : lure.type === "dupla"
          ? "Dupla"
          : "Solo";
    const finisherBase = lure.usesDevice
      ? "Device"
      : lure.usesElixirAtk
        ? lure.type === "solo_elixir"
          ? "Swordsman Elixir"
          : `${typeLabel} + Swordsman Elixir`
        : typeLabel;
    const reviveLabel = lure.reviveTier
      ? ` + ${lure.reviveTier === "superior" ? "Revive+" : "Revive"}`
      : "";
    const finisher = finisherBase + reviveLabel;
    const defStr = lure.starterUsesHarden ? ` | Defesa: Harden` : "";

    const names = [lure.starter.name, lure.second?.name, ...lure.extraMembers.map((m) => m.poke.name)].filter(
      Boolean
    );
    const pokes = names.join(" + ");

    lines.push(`${i + 1}. ${pokes} [${finisher}]${defStr}`);
    lines.push(`   Duração: ${formatTime(activeTime)}${step.idleBefore > 0 ? ` | Espera: ${formatTime(step.idleBefore)}` : ""}`);
  });

  return lines.join("\n");
}

type Page = "rotation" | "otdd";

const PAGE_STORAGE_KEY = "pxg_current_page";

function loadCurrentPage(): Page {
  const raw = localStorage.getItem(PAGE_STORAGE_KEY);
  return raw === "otdd" ? "otdd" : "rotation";
}

const tabBaseCls = "border px-6 py-2.5 rounded-md text-[0.95rem] font-semibold cursor-pointer transition-[background,color,border-color,box-shadow] duration-150";
const tabActiveCls = "bg-accent-blue text-white border-accent-blue shadow-[0_2px_8px_rgb(74_144_217/0.35)]";
const tabIdleCls = "bg-bg-card text-text-muted border-border-default hover:bg-bg-card-hover hover:text-text hover:border-accent-blue";

const headerBtnCls =
  "bg-bg-card text-text border border-[#444] px-4 py-2 rounded-md text-[0.85rem] cursor-pointer transition-[border-color,background] duration-200 hover:bg-border-card hover:border-accent-blue";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => loadCurrentPage());
  const [, startTabTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>(() => loadSelectedIds());
  const [diskLevel, setDiskLevel] = useState<DiskLevel>(() => loadDiskLevel());
  const [showResult, setShowResult] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // OtddPage só monta na primeira vez que o user clica nela.
  // Depois fica montada (escondida via display:none) — evita re-render caro.
  const [otddMounted, setOtddMounted] = useState<boolean>(currentPage === "otdd");

  const switchPage = (page: Page) => {
    if (page === "otdd" && !otddMounted) setOtddMounted(true);
    startTabTransition(() => setCurrentPage(page));
  };

  useEffect(() => {
    localStorage.setItem(PAGE_STORAGE_KEY, currentPage);
  }, [currentPage]);

  const damage = useDamageConfig();

  useEffect(() => {
    localStorage.setItem(DISK_STORAGE_KEY, String(diskLevel));
  }, [diskLevel]);

  useEffect(() => {
    localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);

  const { result, loading, progress, cancel } = useRotation(allPokemon, selectedIds, diskLevel, showResult, damage.config);
  const pool = allPokemon.filter((p) => selectedIds.includes(p.id));

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
    setShowResult(false);
  }, []);

  const handleGenerate = () => {
    if (pool.length > 0) setShowResult(true);
  };

  const handleCopy = async () => {
    const report = buildReport(selectedIds, diskLevel, result, damage.config);
    try {
      await navigator.clipboard.writeText(report);
      setCopyFeedback("Copiado!");
    } catch {
      setCopyFeedback("Falha ao copiar");
    }
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const devicePokeName = result?.devicePokemonId
    ? allPokemon.find((p) => p.id === result.devicePokemonId)?.name
    : null;

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="w-full p-5 text-text bg-bg-app min-h-screen">
      <header className="pb-4 border-b-2 border-[#333] mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="m-0 text-[1.75rem] font-bold text-white tracking-tight">PxG Rotation Generator</h1>
          <button
            className={headerBtnCls}
            title="Reseta disk, seleção de pokes e configs de dano"
            onClick={() => {
              if (!confirm("Limpar todas as configurações salvas (disk, seleção, dano)?")) return;
              localStorage.removeItem(DISK_STORAGE_KEY);
              localStorage.removeItem(SELECTED_STORAGE_KEY);
              localStorage.removeItem("pxg_damage_config");
              location.reload();
            }}
          >
            🗑️ Clear cache
          </button>
        </div>
        <nav className="flex gap-1.5">
          <button
            className={`${tabBaseCls} ${currentPage === "rotation" ? tabActiveCls : tabIdleCls}`}
            onClick={() => switchPage("rotation")}
          >
            Rotação
          </button>
          <button
            className={`${tabBaseCls} ${currentPage === "otdd" ? tabActiveCls : tabIdleCls}`}
            onClick={() => switchPage("otdd")}
          >
            OTDD
          </button>
        </nav>
      </header>

      {/* OtddPage: monta uma vez e fica viva. display:none preserva estado/scroll
          e evita re-simular dano quando troca de tab. Lazy = JS só baixa no
          primeiro mount. */}
      {otddMounted && (
        <main style={{ display: currentPage === "otdd" ? "block" : "none" }}>
          <Suspense fallback={<div style={{ padding: 24 }}>Carregando OTDD...</div>}>
            <OtddPage />
          </Suspense>
        </main>
      )}

      <main style={{ display: currentPage === "rotation" ? "block" : "none" }}>
        <PokemonSelector
          allPokemon={allPokemon}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          elementsByPokeId={pokeElements}
        />

        <DamageConfigPanel
          config={damage.config}
          diskLevel={diskLevel}
          onPlayerLvlChange={damage.setPlayerLvl}
          onClanChange={damage.setClan}
          onHuntChange={damage.setHunt}
          onMobChange={damage.setMob}
          onDeviceChange={damage.setDevice}
          onUseElixirAtkChange={damage.setUseElixirAtk}
          onReviveChange={damage.setRevive}
          onDiskLevelChange={setDiskLevel}
        />

        <PokeSetupEditor
          pokes={pool}
          config={damage.config}
          onChange={damage.setPokeSetup}
        />

        <Box sx={{ textAlign: "center", my: 4 }}>
          <Button
            variant="contained"
            size="large"
            color="primary"
            onClick={handleGenerate}
            disabled={pool.length === 0 || loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />}
            sx={{
              px: 5,
              py: 1.75,
              fontSize: "1rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              boxShadow: "0 4px 14px rgba(74, 144, 217, 0.35)",
              "&:hover": {
                boxShadow: "0 6px 20px rgba(74, 144, 217, 0.5)",
                transform: "translateY(-1px)",
              },
              "&:disabled": {
                boxShadow: "none",
              },
              transition: "all 0.2s",
            }}
          >
            {loading
              ? "Calculando rotação..."
              : pool.length === 0
                ? "Selecione pokémons primeiro"
                : `Gerar Rotação · ${pool.length} ${pool.length === 1 ? "poke" : "pokes"}`}
          </Button>
          {pool.length > 6 && !loading && (
            <Alert
              severity="info"
              variant="outlined"
              sx={{ mt: 2, maxWidth: 600, mx: "auto", fontSize: "0.85rem" }}
            >
              Mais de 6 selecionados — o gerador vai encontrar a melhor composição de 6
            </Alert>
          )}
        </Box>

        {loading && (
          <div className="flex items-center gap-4 p-5 bg-bg-card border border-accent-blue-soft rounded-lg mt-5">
            <div className="w-8 h-8 border-[3px] border-[#333] border-t-accent-blue rounded-full animate-spin shrink-0" />
            <div className="flex-1">
              <div className="text-[0.95rem] font-semibold text-text mb-2">Calculando melhor rotação...</div>
              {progress.total > 0 && (
                <>
                  <div className="h-1.5 bg-bg-app rounded-sm overflow-hidden mb-1">
                    <div
                      className="h-full bg-gradient-to-r from-accent-blue to-accent-blue-light transition-[width] duration-200 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[0.75rem] text-text-dim">
                    {progress.done.toLocaleString()} / {progress.total.toLocaleString()} composições ({pct}%)
                  </div>
                </>
              )}
              {progress.total === 0 && (
                <div className="text-[0.75rem] text-text-dim">Preparando workers...</div>
              )}
            </div>
            <button
              className="ml-auto bg-[#8b2e2e] text-white border-0 px-4 py-2 rounded-md cursor-pointer font-semibold transition-[background] duration-200 hover:bg-[#a63737]"
              onClick={() => {
                cancel();
                setShowResult(false);
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        {!loading && result && (
          <>
            <div className="mt-5 flex flex-col gap-2.5">
              {pool.length > 6 && (
                <div className="mt-5 p-3 bg-bg-card border border-accent-blue-soft rounded-lg">
                  <h3 className="text-[0.9rem] text-accent-blue m-0 mb-2">Melhor composição de 6:</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.selectedIds.map((id) => {
                      const poke = allPokemon.find((p) => p.id === id);
                      return (
                        <span key={id} className="bg-accent-blue/20 text-accent-blue-light px-2.5 py-0.5 rounded text-[0.8rem] font-semibold border border-accent-blue-soft">
                          {poke?.name ?? id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-bg-card border border-warn/35 rounded-lg">
                <span className="text-[0.875rem] text-warn font-semibold">Device:</span>
                {devicePokeName ? (
                  <span className="text-[0.875rem] text-warn-strong font-bold">{devicePokeName}</span>
                ) : (
                  <span className="text-[0.875rem] text-text-dim">Nenhum (todos usam swordsman)</span>
                )}
              </div>
              <div className="flex items-center gap-2.5 mt-1">
                <button className={headerBtnCls} onClick={handleCopy}>
                  📋 Copiar dados
                </button>
                {copyFeedback && <span className="text-[0.85rem] text-success font-semibold">{copyFeedback}</span>}
              </div>
            </div>
            <RotationResultView result={result} />
            <SkillTimeline result={result} />
            <LureDamagePreview result={result} config={damage.config} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
