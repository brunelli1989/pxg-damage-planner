import type { DiskLevel } from "../types";

interface Props {
  diskLevel: DiskLevel;
  onChange: (level: DiskLevel) => void;
}

const DISK_OPTIONS: { level: DiskLevel; label: string; detail: string }[] = [
  { level: 0, label: "Sem Disco", detail: "" },
  { level: 1, label: "Disk 1.0", detail: "1s a cada 8s" },
  { level: 2, label: "Disk 2.0", detail: "1s a cada 6s" },
  { level: 3, label: "Disk 3.0", detail: "1s a cada 4s" },
  { level: 4, label: "Disk 4.0", detail: "1s a cada 3s" },
];

export function DiskSelector({ diskLevel, onChange }: Props) {
  return (
    <div className="disk-selector">
      <label htmlFor="disk-select">Nightmare Disk:</label>
      <select
        id="disk-select"
        value={diskLevel}
        onChange={(e) => onChange(Number(e.target.value) as DiskLevel)}
      >
        {DISK_OPTIONS.map((opt) => (
          <option key={opt.level} value={opt.level}>
            {opt.label} {opt.detail && `(${opt.detail})`}
          </option>
        ))}
      </select>
    </div>
  );
}
