import type { DamageConfig, RotationResult } from "../types";
import { estimateLureDamagePerMob, lureFinalizesBox } from "../engine/damage";

interface Props {
  result: RotationResult;
  config: DamageConfig;
}

export function LureDamagePreview({ result, config }: Props) {
  return (
    <section className="lure-damage">
      <h2>
        Dano por Lure (vs {config.mob.name} [{config.mob.types.join("/")}] HP {config.mob.hp.toLocaleString()})
      </h2>
      <table className="lure-damage-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pokes</th>
            <th>Dano/mob (estimado)</th>
            <th>% HP</th>
            <th>Finaliza?</th>
          </tr>
        </thead>
        <tbody>
          {result.steps.map((step, i) => {
            const dmg = estimateLureDamagePerMob(step.lure, config);
            const pct = (dmg / config.mob.hp) * 100;
            const finalizes = lureFinalizesBox(step.lure, config);
            const pokes = step.lure.second
              ? `${step.lure.starter.name} + ${step.lure.second.name}`
              : step.lure.starter.name;

            return (
              <tr key={i} className={finalizes ? "finalizes" : "not-finalizes"}>
                <td>{i + 1}</td>
                <td>{pokes}</td>
                <td>{Math.round(dmg).toLocaleString()}</td>
                <td>{pct.toFixed(1)}%</td>
                <td>{finalizes ? "✓" : "✗"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
