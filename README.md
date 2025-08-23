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
