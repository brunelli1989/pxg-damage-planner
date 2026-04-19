import type { RotationResult } from "../types";

interface Props {
  result: RotationResult;
}

const POKEMON_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
];

export function SkillTimeline({ result }: Props) {
  const totalTime = result.totalTime;
  if (totalTime === 0) return null;

  return (
    <section className="skill-timeline">
      <h3>Timeline</h3>
      <div className="timeline-bar">
        {result.steps.map((step, i) => {
          const lure = step.lure;
          const activeTime = step.timeEnd - step.timeStart - step.idleBefore;
          const activeWidth = (activeTime / totalTime) * 100;
          const idleWidth = (step.idleBefore / totalTime) * 100;
          const shortName = (p: { name: string }) => p.name.split(" ").pop();
          const parts = [lure.starter, lure.second, ...lure.extraMembers.map((m) => m.poke)]
            .filter((p): p is NonNullable<typeof p> => p !== null);
          const label = parts.map(shortName).join("+");

          return (
            <span key={i} className="timeline-segment-group">
              {step.idleBefore > 0 && (
                <span
                  className="timeline-idle"
                  style={{ width: `${idleWidth}%` }}
                  title={`Espera: ${Math.round(step.idleBefore)}s`}
                >
                  {Math.round(step.idleBefore)}s
                </span>
              )}
              <span
                className="timeline-active"
                style={{
                  width: `${activeWidth}%`,
                  backgroundColor: POKEMON_COLORS[i % POKEMON_COLORS.length],
                }}
                title={`${label}: ${Math.round(activeTime)}s`}
              >
                {label}
              </span>
            </span>
          );
        })}
      </div>
      <div className="timeline-labels">
        <span>0s</span>
        <span>{Math.round(totalTime / 2)}s</span>
        <span>{Math.round(totalTime)}s</span>
      </div>
    </section>
  );
}
