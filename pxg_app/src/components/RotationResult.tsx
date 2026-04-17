import type { Lure, RotationResult as RotationResultType } from "../types";
import { SkillBadge } from "./SkillBadge";

interface Props {
  result: RotationResultType;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function lureFinisherLabel(lure: Lure): string {
  if (lure.usesDevice) return "Device";
  if (lure.usesElixirAtk) return "Elixir Atk";
  return "Dupla";
}

function lureFinisherClass(lure: Lure): string {
  if (lure.usesDevice) return "device";
  if (lure.usesElixirAtk) return "elixir";
  return "dupla";
}

export function RotationResultView({ result }: Props) {
  return (
    <section className="rotation-result">
      <div className="result-header">
        <h2>Rotação Ótima ({result.steps.length} lures por ciclo)</h2>
        <div className="result-stats">
          <span className="stat stat-primary">
            Boxes/h: <strong>{Math.round((3600 * result.steps.length) / result.totalTime)}</strong>
          </span>
          <span className="stat stat-primary">
            Pokémons/h: <strong>{Math.round((3600 * result.steps.length * 6) / result.totalTime)}</strong>
          </span>
          <span className="stat">
            Ciclo: <strong>{formatTime(result.totalTime)}</strong>
          </span>
          <span className="stat">
            Ocioso: <strong>{formatTime(result.totalIdle)}</strong>
          </span>
        </div>
      </div>

      <div className="rotation-steps">
        {result.steps.map((step, i) => {
          const lure = step.lure;
          const activeDuration = step.timeEnd - step.timeStart - step.idleBefore;
          return (
            <div key={i} className="rotation-step">
              <div className="step-number">{i + 1}</div>
              <div className="step-content">
                <div className="step-header">
                  <span className="step-pokemon">{lure.starter.name}</span>
                  <span className={`step-tier tier-${lure.starter.tier.toLowerCase()}`}>
                    {lure.starter.tier}
                  </span>
                  {lure.second && (
                    <>
                      <span className="step-plus">+</span>
                      <span className="step-pokemon">{lure.second.name}</span>
                      <span className={`step-tier tier-${lure.second.tier.toLowerCase()}`}>
                        {lure.second.tier}
                      </span>
                    </>
                  )}
                  <span className={`step-finish ${lureFinisherClass(lure)}`}>
                    {lureFinisherLabel(lure)}
                  </span>
                  {lure.starterUsesHarden && (
                    <span className="step-defense harden">Harden</span>
                  )}
                  {lure.starterUsesElixirDef && (
                    <span className="step-defense elixir-def">Elixir Def</span>
                  )}
                </div>

                <div className="step-skills">
                  <span className="step-skills-group">
                    <span className="group-label">{lure.starter.name}:</span>
                    {lure.starterSkills.map((skill, j) => (
                      <span key={skill.name} className="step-skill-item">
                        {j > 0 && <span className="skill-arrow">→</span>}
                        <SkillBadge skill={skill} compact />
                      </span>
                    ))}
                  </span>
                  {lure.second && lure.secondSkills.length > 0 && (
                    <span className="step-skills-group">
                      <span className="group-label">{lure.second.name}:</span>
                      {lure.secondSkills.map((skill, j) => (
                        <span key={skill.name} className="step-skill-item">
                          {j > 0 && <span className="skill-arrow">→</span>}
                          <SkillBadge skill={skill} compact />
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                <div className="step-timing">
                  <span>Duração: {formatTime(activeDuration)}</span>
                  {step.idleBefore > 0 && (
                    <span className="idle-warning">
                      Espera: {formatTime(step.idleBefore)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rotation-loop">↩ Volta ao passo 1</div>
    </section>
  );
}
