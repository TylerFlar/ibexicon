# Ibexicon

Any-length Wordle solver with smart explore/exploit, deployable on GitHub Pages.

## Quickstart

```bash
npm install
npm run dev
```

Then open the shown local URL (default http://localhost:5173) and you should see:

Ibexicon: Hello Solver

---

## Evaluation (Milestone 7 Scaffolding)

Simulation tooling for benchmarking solver policies is being built. A scaffolded CLI exists now and will soon run full parallel evaluations with prior‑weighted secret sampling.

Run with explicit parameters (lengths 4–8, 1000 trials each, 6 attempts, four policies):

```bash
npm run eval:run -- --lengths 4,5,6,7,8 --trials 1000 --attempts 6 --policies composite,pure-eig,pure-solve,unique-letters
```

CI / smoke mode (short, deterministic):

```bash
npm run eval:ci
```

Planned outputs (future work) will appear in `eval/results/` as timestamped JSON + CSV including git SHA and aggregated metrics.

---

## Wordlists from en-full.txt

Generates per-length English word lists and Empirical Bayes (EB) prior probability files from a single corpus file via a streaming builder.

### 1. Provide the source corpus

Place the source file at `data/en-full.txt` with lines in the form:

```
you 22484400
i 19975318
the 17594291
```

Each line is: `<word><whitespace><count>` (counts are positive integers). Lines beginning with `#` or blank lines are ignored.

### 2. Install (dev) dependencies

The build script relies on Commander, Zod, Chalk, and Rimraf (added as dev dependencies). If you haven't already:

```bash
npm install
```

### 3. Generate wordlists & priors

Run:

```bash
npm run build:data
```

This reads `data/en-full.txt` and produces, for every observed word length `L`:

- `public/wordlists/en/en-<L>.txt` – one word per line, sorted by descending raw frequency then ascending lexicographic word for ties.
- `public/wordlists/en/en-<L>-priors.json` – EB-smoothed prior probabilities using a letter-position model blended with counts.
- `public/wordlists/en/manifest.json` – metadata listing lengths, vocab sizes, token totals, and build parameters.

All lengths are discovered dynamically; there is no hard-coded length limit.

### 4. EB Prior (conceptual overview)

The EB prior blends empirical word frequency with a letter-position model. Parameters (CLI flags, defaults shown):

- `--alpha <0.5>`: Laplace/Jeffreys smoothing per letter-position.
- `--muFactorShort <0.05>`: μ = muFactorShort·N for lengths ≤ `--longThreshold`.
- `--muFactorLong <0.10>`: μ = muFactorLong·N for lengths > `--longThreshold`.
- `--longThreshold <8>`: boundary between short and long lengths.
- `--tau <1.0>`: temperature; if ≠ 1, probabilities are reweighted by P^(1/τ) and renormalized.
- `--exclude-lengths <csv>`: optionally skip specific lengths.

Formula:

```
P(word) = (freq(word) + μ * P_pos(word)) / (N + μ)
```

`P_pos(word)` multiplies per-position probabilities built from smoothed letter counts and is normalized across all words of length L before blending. Temperature (τ) adjusts sharpness after EB.

---

Below are the original Vite + React + TypeScript template notes (kept for reference).

---

## Worker mode (Milestone 4)

Heavy scoring (information gain + solve probability over the current candidate secret set) is offloaded to a single Web Worker to keep the UI responsive. The worker supports:

- RPC-style methods: `warmup`, `score`, `cancel`, `dispose`.
- Chunked secret iteration (default chunks of 8000) with progress events.
- Cooperative cancellation via worker message or `AbortSignal`.
- Transfer-friendly compact prior payload (`Object.entries(priors)`).
- Strict TypeScript types and module worker syntax (Vite).

### Client API

```ts
import { SolverWorkerClient, makeAbortController } from '@/worker/client'

const client = new SolverWorkerClient()
await client.warmup()

const ac = makeAbortController()

const { suggestions, canceled } = await client.score(
  {
    words, // string[] current alive secrets
    priors, // Record<string, number> (unnormalized or normalized)
    attemptsLeft: 6,
    attemptsMax: 6,
    topK: 3,
    tau: null, // or a number for temperature shaping
    seed: 123, // optional RNG seed for sampling path
    sampleCutoff: 5000,
    sampleSize: 3000,
    prefilterLimit: 2000,
    chunkSize: 8000, // override default if desired
    onProgress: (p) => console.log('Progress', (p * 100).toFixed(1) + '%'),
  },
  ac.signal,
)

if (canceled) {
  console.log('Scoring canceled')
} else {
  console.table(suggestions)
}

// To cancel mid-flight:
ac.abort() // or client.cancel()

// When finished with the worker:
client.dispose()
```

### Progress & cancellation

`onProgress` receives a fraction `0..1` after each processed chunk (across all guesses × secret chunks). Cancellation is cooperative: the scoring loop checks `shouldCancel` at chunk boundaries and throws a `CanceledError` internally which the worker translates into a `{ type: 'canceled' }` message. From the client side you can either call `client.cancel()` or abort an attached `AbortSignal` (`AbortController.abort()`).

### Module worker & paths

The worker is instantiated with:

```ts
new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
```

Vite handles bundling. If deploying under a sub-path (GitHub Pages), ensure `import.meta.env.BASE_URL` (Vite's `base` config) matches so the manifest and wordlists fetch correctly.

### BASE_URL note

All network fetches for wordlists & priors use `import.meta.env.BASE_URL` (default `/`) as a prefix, so adjust Vite's `base` if serving from a non-root path.

### Testing

Integration tests exercise scoring & cancellation. In the jsdom test environment an inline worker polyfill runs scoring on the main thread while preserving the same message protocol for determinism and speed.

---

## Precomputed Pattern Tables (Milestone 8)

Hot seed guess × secret feedback patterns can be precomputed for shorter lengths (defaults: L ≤ 10, N ≤ 20k, top M = 1500 seeds) to accelerate early scoring. A binary asset per length is written to:

```
public/wordlists/en/ibxptab-<L>.bin
```

Binary format (little-endian):

```
u32 magic   = 0x49585054  // 'IXPT'
u16 version = 1
u8  L
u8  reserved = 0
u32 N            // number of secrets
u32 hash32       // FNV-1a of canonical en-<L>.txt content (joined by '\n')
u32 M            // number of seeds stored
u32 seedIndex[M] // indices into the word list (0..N-1)
u16 patterns[M][N] // row-major; for each seed then each secret the feedback pattern code
```

Pattern codes are numeric base‑3 packed values (trits: gray=0, yellow=1, green=2) produced by the existing `feedbackPattern` helper; for L ≤ 10 each fits in 16 bits (max 59048).

Seed selection heuristic (documented for reproducibility):

1. Rank all words by prior probability descending (tie → lexicographic). Rank r ∈ [0, N-1].
2. priorRankScore = (N − 1 − r)/(N − 1) (best prior → 1).
3. uniqueLettersScore = (# distinct letters)/L.
4. seedScore = 0.7 * priorRankScore + 0.3 * uniqueLettersScore.
5. Keep the top M by (seedScore desc, word asc) — default M = 1500.

### Build the tables

```bash
npm run build:ptab
```

Options (pass after `--`):

```
--lengths 4,5,6      # restrict to specific lengths
--maxWords 15000     # skip if N > maxWords (default 20000)
--maxLen 9           # override length cutoff (default 10)
--seeds 1200         # change number of stored seed guesses
```

If `public/wordlists/en/manifest.json` exists its `lengths` array drives discovery; otherwise the script scans for `en-*.txt` files. Existing `.bin` files are overwritten.

### Skipping / constraints

Lengths with N > maxWords or L > maxLen (or > 10 which breaks the 16‑bit pattern bound) are skipped.

### Consumption (planned)

The solver worker will (future work) attempt to fetch `ibxptab-<L>.bin`, validate the hash against the current word list ordering, then reuse precomputed pattern rows with fallback to on‑demand computation + IndexedDB + in‑memory LRU cache.

---

## React + TypeScript + Vite Template Notes

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
