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

i 19975318
the 17594291

## Dataset Automation (Unified Flow)

The legacy one-corpus builder and EB prior pipeline have been replaced by a single unified script that ingests any new word list, fetches Datamuse frequencies, creates priors, updates the manifest, and (optionally) builds the pattern table.

### Add a new dataset

1. Create/obtain a text file with one lowercase word per line (uniform length).
2. Run the automation script:

```bash
npm run add:dataset -- --id=mylist-5 --words=public/wordlists/en/mylist-5.txt --category="Custom" --displayName="My List 5"
```

Flags (selected):

- `--id` unique dataset id (used in asset names e.g. `ptab-<id>.bin`).
- `--words` path to word list file.
- `--category` UI grouping label.
- `--displayName` human label shown in selector (defaults to id if omitted).
- `--priorsOut` override priors output file (auto-derives if omitted).
- `--concurrency` Datamuse fetch parallelism (default 8).
- `--delay` ms delay between each fetch per worker (default 80) to stay polite.
- `--addK` additive smoothing constant (default 0.5).
- `--fallbackScale` scale applied to min observed count for missing freq (default 0.1).
- `--seeds` number of seed rows for pattern table (default 1500).
- `--skipPtab` skip building the pattern table.
- `--forcePriors` overwrite an existing priors file.

The script will:

1. Fetch / cache Datamuse frequencies (resumable via `.cache.json`).
2. Produce normalized priors JSON.
3. Insert or update the entry in `public/wordlists/en/manifest.json`.
4. Build `public/wordlists/en/ptab-<id>.bin` unless `--skipPtab` is set.

Legacy builder docs below are retained for historical context but are no longer part of the active workflow.

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
public/wordlists/en/ptab-<datasetId>.bin
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
4. seedScore = 0.7 _ priorRankScore + 0.3 _ uniqueLettersScore.
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

The solver worker fetches `ptab-<datasetId>.bin` (with legacy fallback) and validates the hash against the current word list ordering, then reuses precomputed pattern rows with fallback to on‑demand computation + IndexedDB + in‑memory LRU cache.

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
