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
