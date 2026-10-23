import { MAX_FILL_RUNS } from "./constants";

const TOLERANCE = 200; // summed RGB difference; absorbs anti-aliased stroke edges

/**
 * Scanline flood fill over RGBA pixel data. Returns a flat [y, x1, x2, ...] span list,
 * or null when the region is too detailed to store (more than MAX_FILL_RUNS spans).
 */
export function floodRuns(data: Uint8ClampedArray, w: number, h: number, sx: number, sy: number): number[] | null {
  const i0 = (sy * w + sx) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2];
  const match = (p: number) => {
    const i = p * 4;
    return Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) <= TOLERANCE;
  };
  const seen = new Uint8Array(w * h);
  const runs: number[] = [];
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const row = y * w;
    if (seen[row + x] || !match(row + x)) continue;
    let x1 = x;
    while (x1 > 0 && !seen[row + x1 - 1] && match(row + x1 - 1)) x1--;
    let x2 = x;
    while (x2 < w - 1 && !seen[row + x2 + 1] && match(row + x2 + 1)) x2++;
    for (let i = x1; i <= x2; i++) seen[row + i] = 1;
    runs.push(y, x1, x2);
    if (runs.length / 3 > MAX_FILL_RUNS) return null;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inRun = false;
      for (let i = x1; i <= x2; i++) {
        const ok = !seen[ny * w + i] && match(ny * w + i);
        if (ok && !inRun) {
          stack.push(i, ny);
          inRun = true;
        } else if (!ok) inRun = false;
      }
    }
  }
  return runs;
}
