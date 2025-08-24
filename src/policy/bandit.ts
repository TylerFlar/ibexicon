export type PolicyId = "composite" | "pure-eig" | "in-set-only" | "unique-letters"

export interface ArmState { a: number; b: number; updates: number }
export interface BanditState { arms: Record<PolicyId, ArmState>; totalUpdates: number }
export interface BanditConfig { halfLifeUpdates?: number }
const DEFAULT_HALF_LIFE = 20

function emptyState(): BanditState {
  return {
    totalUpdates: 0,
    arms: {
      "composite": { a: 1, b: 1, updates: 0 },
      "pure-eig": { a: 1, b: 1, updates: 0 },
      "in-set-only": { a: 1, b: 1, updates: 0 },
      "unique-letters": { a: 1, b: 1, updates: 0 },
    }
  }
}

function keyForLength(L: number) { return `ibexicon:bandit:v1:${L}` }

export function loadState(L: number): BanditState {
  try {
    if (typeof localStorage === "undefined") return emptyState()
    const raw = localStorage.getItem(keyForLength(L))
    if (!raw) return emptyState()
    const obj = JSON.parse(raw) as BanditState
    // sanity
    if (!obj || typeof obj !== "object" || !obj.arms) return emptyState()
    const base = emptyState()
    for (const k of Object.keys(base.arms) as PolicyId[]) {
      if (!obj.arms[k]) obj.arms[k] = { a:1, b:1, updates:0 }
      else {
        const a = obj.arms[k]!.a
        const b = obj.arms[k]!.b
        const u = obj.arms[k]!.updates
        if (!(a>0) || !(b>0)) obj.arms[k] = { a:1, b:1, updates: u|0 }
      }
    }
    if (typeof obj.totalUpdates !== "number" || obj.totalUpdates < 0) obj.totalUpdates = 0
    return obj
  } catch { return emptyState() }
}

export function saveState(L: number, s: BanditState) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(keyForLength(L), JSON.stringify(s)) } catch {}
}

export function resetState(L: number) {
  saveState(L, emptyState())
}

function decayFactor(halfLife: number, n: number): number {
  // per update multiplier to halve every 'halfLife' updates
  const gamma = Math.pow(0.5, 1 / Math.max(1, halfLife))
  return Math.pow(gamma, n)
}

/** Return a sampled policy using Thompson Sampling (Beta draws) */
export function samplePolicy(L: number): PolicyId {
  // Future: accept config for exploration tweaking
  const s = loadState(L)
  const arms = s.arms
  const draws: Array<[PolicyId, number]> = []
  for (const id of Object.keys(arms) as PolicyId[]) {
    const { a, b } = arms[id]!
    // Lightweight approximate Beta sampling
    let x=0, y=0
    const u1 = Math.random() || 1e-12
    const u2 = Math.random() || 1e-12
    x = Math.pow(u1, 1/a)
    y = Math.pow(u2, 1/b)
    const theta = x / (x + y)
    draws.push([id, theta])
  }
  draws.sort((a,b)=> b[1]-a[1])
  return draws[0]![0]
}

/** Update bandit with a normalized reward in [0,1] */
export function updatePolicy(L: number, id: PolicyId, reward01: number, cfg?: BanditConfig) {
  const s = loadState(L)
  const arm = s.arms[id]!
  const hl = cfg?.halfLifeUpdates ?? DEFAULT_HALF_LIFE
  const g = decayFactor(hl, 1)
  const r = Math.max(0, Math.min(1, reward01))
  // exponential decay of pseudo-counts (keep ≥1 to avoid degenerate Betas)
  arm.a = Math.max(1, 1 + (arm.a - 1) * g + r)
  arm.b = Math.max(1, 1 + (arm.b - 1) * g + (1 - r))
  arm.updates += 1
  s.totalUpdates += 1
  saveState(L, s)
}

/** Compute normalized reward from |S_before|, |S_after|. If S_before<=1: solved→1 else 0 */
export function rewardFromSizes(Sbefore: number, Safter: number): { r01: number, rawBits: number } {
  const b = Math.max(1, Sbefore|0)
  const a = Math.max(1, Safter|0)
  if (b <= 1) {
    return { r01: (a===1 ? 1 : 0), rawBits: Math.log2(b) - Math.log2(a) }
  }
  const num = Math.log2(b) - Math.log2(a)
  const den = Math.log2(b)
  const r01 = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0
  return { r01, rawBits: num }
}
