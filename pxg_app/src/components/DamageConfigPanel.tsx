import type {
  ClanName,
  DamageConfig,
  HuntLevel,
  MobConfig,
  MobEntry,
  DeviceHeld,
  DeviceHeldKind,
  XAtkTier,
} from "../types";
import clansData from "../data/clans.json";
import mobsData from "../data/mobs.json";
import { DEFAULT_MOB_DEF_FACTOR } from "../engine/damage";

const mobs = mobsData as MobEntry[];

const TIERS: XAtkTier[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function mobMarker(mobs: MobEntry[]): string {
  const measured = mobs.filter((m) => m.defFactor !== undefined).length;
  if (measured === mobs.length) return " ✓";
  if (measured === 0) return " ⚠️";
  return " ⚠️✓";
}

interface Props {
  config: DamageConfig;
  onPlayerLvlChange: (v: number) => void;
  onClanChange: (v: ClanName | null) => void;
  onHuntChange: (v: HuntLevel) => void;
  onMobChange: (mob: Partial<MobConfig>) => void;
  onDeviceChange: (device: Partial<DeviceHeld>) => void;
}

export function DamageConfigPanel({
  config,
  onPlayerLvlChange,
  onClanChange,
  onHuntChange,
  onMobChange,
  onDeviceChange,
}: Props) {
  const mobsForHunt = mobs
    .filter((m) => m.hunt === config.hunt)
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  const groupedMobs = mobsForHunt.reduce<Record<string, MobEntry[]>>((acc, m) => {
    (acc[m.group] ??= []).push(m);
    return acc;
  }, {});

  const handleMobSelect = (groupName: string) => {
    if (groupName === "__custom__") {
      onMobChange({ name: config.mob.name });
      return;
    }
    const groupMobs = groupedMobs[groupName];
    if (!groupMobs || groupMobs.length === 0) return;

    // Seleciona o mais difícil do grupo (maior HP × defFactor se disponível), senão primeiro
    const hardest =
      groupMobs.reduce<MobEntry | null>((best, m) => {
        const score = (m.hp ?? 0) * (m.defFactor ?? 0);
        const bestScore = best ? (best.hp ?? 0) * (best.defFactor ?? 0) : -1;
        return score > bestScore ? m : best;
      }, null) ?? groupMobs[0];

    const groupDisplayName = groupMobs.length > 1 ? groupName : hardest.name;

    onMobChange({
      name: groupDisplayName,
      types: hardest.types,
      hp: hardest.hp ?? config.mob.hp,
      defFactor: hardest.defFactor ?? config.mob.defFactor,
    });
  };

  // Match current mob.name against groupName (multi) or individual name (solo)
  const currentGroup = Object.entries(groupedMobs).find(([groupName, groupMobs]) => {
    if (groupMobs.length > 1) return groupName === config.mob.name;
    return groupMobs[0].name === config.mob.name;
  });
  const currentSelectionKey = currentGroup ? currentGroup[0] : "__custom__";

  const type1 = config.mob.types[0] ?? "—";
  const type2 = config.mob.types[1] ?? "—";

  // Maior HP dentro do grupo atualmente selecionado
  const selectedGroupMobs = currentGroup ? currentGroup[1] : [];
  const maxHpInGroup = selectedGroupMobs.reduce((max, m) => Math.max(max, m.hp ?? 0), 0);
  const maxHpMob = selectedGroupMobs.find((m) => m.hp === maxHpInGroup);

  const mobDisplay = (m: MobEntry) => `${m.name} (${m.types.join("/")})${mobMarker([m])}`;

  return (
    <section className="damage-config">
      <h2>Configuração de Dano</h2>

      <div className="damage-config-row">
        <label>
          Player lvl:
          <input
            type="number"
            min={1}
            max={1000}
            value={config.playerLvl}
            onChange={(e) => onPlayerLvlChange(Number(e.target.value))}
          />
        </label>

        <label>
          Clã:
          <select
            value={config.clan ?? ""}
            onChange={(e) => onClanChange((e.target.value || null) as ClanName | null)}
          >
            <option value="">Nenhum</option>
            {clansData.map((c) => (
              <option key={c.name} value={c.name}>
                {c.displayName} ({c.bonuses.map((b) => `+${Math.round(b.atk * 100)}% ${b.element}`).join(", ")})
              </option>
            ))}
          </select>
        </label>

        <label>
          Hunt:
          <select
            value={config.hunt}
            onChange={(e) => onHuntChange(e.target.value as HuntLevel)}
          >
            <option value="300">Hunt 300</option>
            <option value="400+">Hunt 400+</option>
          </select>
        </label>
      </div>

      <div className="damage-config-row">
        <label>
          Mob alvo:
          <select
            value={currentSelectionKey}
            onChange={(e) => handleMobSelect(e.target.value)}
          >
            {Object.entries(groupedMobs).map(([groupName, groupMobs]) => {
              if (groupMobs.length > 1) {
                const allTypes = [...new Set(groupMobs.flatMap((m) => m.types))];
                return (
                  <option key={groupName} value={groupName}>
                    {groupName} ({allTypes.join("/")}){mobMarker(groupMobs)}
                  </option>
                );
              }
              return (
                <option key={groupName} value={groupName}>
                  {mobDisplay(groupMobs[0])}
                </option>
              );
            })}
            <option value="__custom__">— Custom —</option>
          </select>
          <span className="hint">
            Tipo 1: <strong>{type1}</strong> | Tipo 2: <strong>{type2}</strong>
            {config.mob.defFactor === undefined && (
              <span
                className="calibration-warning"
                title={`A defesa real deste mob ainda não foi medida. Estou usando uma estimativa média (${DEFAULT_MOB_DEF_FACTOR}) dos mobs já testados.`}
              >
                ⚠️ defesa aproximada
              </span>
            )}
          </span>
          <span className="hint legend">
            Legenda: <strong>✓</strong> = defesa medida no jogo · <strong>⚠️</strong> = defesa estimada (dano pode variar)
          </span>
        </label>

        <label>
          Maior HP do grupo:
          <input
            type="text"
            value={maxHpInGroup > 0 ? `${maxHpInGroup.toLocaleString()}${maxHpMob ? ` (${maxHpMob.name})` : ""}` : "—"}
            disabled
            readOnly
          />
        </label>
      </div>

      <div className="damage-config-row">
        <label>
          Held do device:
          <select
            value={config.device.kind}
            onChange={(e) => onDeviceChange({ kind: e.target.value as DeviceHeldKind })}
          >
            <option value="none">Nenhum</option>
            <option value="x-attack">X-Attack</option>
            <option value="x-boost">X-Boost</option>
            <option value="x-critical">X-Critical</option>
            <option value="x-defense">X-Defense</option>
          </select>
        </label>

        <label>
          Tier do device:
          <select
            value={config.device.tier}
            disabled={config.device.kind === "none"}
            onChange={(e) => onDeviceChange({ tier: Number(e.target.value) as XAtkTier })}
          >
            {TIERS.filter((t) =>
              config.device.kind === "x-boost" ? t <= 7 : true
            ).map((t) => (
              <option key={t} value={t}>
                {t === 0 ? "—" : `T${t}`}
              </option>
            ))}
          </select>
          <span className="hint">X-Attack vai até T8, X-Boost até T7. Device é atribuído a 1 poke (checkbox no setup).</span>
        </label>
      </div>
    </section>
  );
}
