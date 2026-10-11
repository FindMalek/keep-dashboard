import type { SensorReading } from "../shared/types";
import { HOST_SYS, listDir, readNumber, readText } from "../lib/host";

const GROUPS: Record<string, string> = {
  coretemp: "cpu",
  k10temp: "cpu",
  acpitz: "board",
  jc42: "memory",
  amdgpu: "gpu",
  nvme: "disk",
};

function labelFor(group: string, raw: string | null, index: number): string {
  if (!raw) return group === "memory" ? `dimm ${index}` : group;
  return raw
    .replace(/^Package id \d+$/, "package")
    .replace(/^Core (\d+)$/, "core $1")
    .toLowerCase();
}

export async function collectSensors(): Promise<SensorReading[]> {
  const readings: SensorReading[] = [];
  let dimm = 0;

  for (const hwmon of (await listDir(`${HOST_SYS}/class/hwmon`)).sort()) {
    const base = `${HOST_SYS}/class/hwmon/${hwmon}`;
    const name = (await readText(`${base}/name`))?.trim() ?? "";
    const group = GROUPS[name.replace(/_\d+$/, "")];
    if (!group) continue;

    const inputs = (await listDir(base)).filter((file) => /^temp\d+_input$/.test(file)).sort();
    for (const input of inputs) {
      const milli = await readNumber(`${base}/${input}`);
      if (milli === null || milli <= 0) continue;
      const label = (await readText(`${base}/${input.replace("_input", "_label")}`))?.trim() ?? null;
      readings.push({ group, label: labelFor(group, label, group === "memory" ? ++dimm : 0), tempC: milli / 1000 });
    }
  }

  return readings;
}
