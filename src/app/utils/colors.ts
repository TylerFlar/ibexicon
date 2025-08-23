// Color utilities for heatmaps and charts
// Colorblind-safe(ish) sequential heat scale + helpers
// Intent: smooth progression light -> dark, with hue shift for perceptual ordering

// simple light->dark scale; value in [0,1]
export function heatColor(t: number): string {
  // blue-gray to orange; clamp
  const x = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * (0.95 * x + 0.05));
  const g = Math.round(255 * (0.75 * x + 0.2));
  const b = Math.round(255 * (0.30 * (1 - x) + 0.2));
  return `rgb(${r},${g},${b})`;
}

export function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

// Generate an array of N colors across the heat scale
export function heatScale(steps: number): string[] {
  if (steps <= 1) return [heatColor(0.5)];
  const out: string[] = [];
  for (let i = 0; i < steps; i++) out.push(heatColor(i / (steps - 1)));
  return out;
}

// Map a numeric value in [min,max] to heat color; gracefully handles min==max
export function heatColorRange(value: number, min: number, max: number): string {
  if (max <= min) return heatColor(0.5);
  return heatColor((value - min) / (max - min));
}

// Discrete bucket color (k buckets); index clamped
export function heatBucket(index: number, buckets: number): string {
  if (buckets <= 0) return heatColor(0.5);
  const i = Math.min(buckets - 1, Math.max(0, Math.round(index)));
  if (buckets === 1) return heatColor(0.5);
  return heatColor(i / (buckets - 1));
}

// Convert rgb(...) string to hex (#RRGGBB)
export function rgbToHex(rgb: string): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb.replace(/\s+/g, ''));
  if (!m) return rgb; // passthrough
  const nums = m.slice(1, 4).map(n => Math.max(0, Math.min(255, parseInt(n, 10))));
  const [r, g, b] = nums as [number, number, number];
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Convenience: given numeric array, return {min,max,colors[]}
export function mapValuesToColors(values: number[]): { min: number; max: number; colors: string[] } {
  if (!values.length) return { min: 0, max: 0, colors: [] };
  let min = values[0]!; // length > 0 guaranteed
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const colors = values.map(v => heatColorRange(v, min, max));
  return { min, max, colors };
}
