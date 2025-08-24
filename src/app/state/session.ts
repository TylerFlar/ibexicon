// Session state & reducer for Assistant mode
// This file defines a strict state machine for an assistant session
// including localStorage persistence with an idle-throttled writer.

export type Trit = 0 | 1 | 2 // 0 gray,1 yellow,2 green

export interface GuessEntry {
  guess: string
  trits: Trit[]
}

export interface Settings {
  length: number
  attemptsMax: number
  colorblind: boolean
  datasetId?: string // id of the currently selected wordlist set (implies length)
  policyMode: 'auto' | 'composite' | 'pure-eig' | 'in-set-only' | 'unique-letters'
}

export interface SessionState {
  settings: Settings
  history: GuessEntry[]
  guessInput: string
}

export type Action =
  | { type: 'setLength'; length: number }
  | { type: 'setDataset'; id: string; length: number }
  | { type: 'setGuessInput'; value: string }
  | { type: 'addGuess'; payload: { guess: string; trits: Trit[] } }
  | { type: 'editTrit'; payload: { row: number; col: number; value: Trit } }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'toggleColorblind' }
  | { type: 'setAttemptsMax'; value: number }
  | { type: 'setPolicy'; value: Settings['policyMode'] }

export function initialState(length: number): SessionState {
  return {
    settings: {
      length,
      attemptsMax: 10,
      colorblind: false,
      datasetId: `en-${length}`,
      policyMode: 'auto',
    },
    history: [],
    guessInput: '',
  }
}

function sanitizeGuessInput(value: string, length: number): string {
  // Accept only lowercase a-z; trim elsewhere; cut to length
  const cleaned = value.toLowerCase().replace(/[^a-z]/g, '')
  return cleaned.slice(0, length)
}

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'setLength': {
      const length = Math.max(1, Math.min(64, Math.floor(action.length))) // arbitrary upper bound
      if (length === state.settings.length) return state
      // Changing length invalidates existing guesses; clear history per assumption.
      return {
        settings: {
          ...state.settings,
          length,
          datasetId: state.settings.datasetId?.endsWith(String(length))
            ? state.settings.datasetId
            : `en-${length}`,
          policyMode: state.settings.policyMode,
        },
        history: [],
        guessInput: '',
      }
    }
    case 'setDataset': {
      const { id, length } = action
      if (state.settings.datasetId === id) return state
      return {
        settings: { ...state.settings, datasetId: id, length },
        history: [],
        guessInput: '',
      }
    }
    case 'setGuessInput': {
      const guessInput = sanitizeGuessInput(action.value, state.settings.length)
      if (guessInput === state.guessInput) return state
      return { ...state, guessInput }
    }
    case 'addGuess': {
      const { guess, trits } = action.payload
      if (guess.length !== state.settings.length || trits.length !== state.settings.length) {
        return state // invalid lengths ignored silently; could throw if preferred
      }
      // Ensure trits are 0|1|2
      if (!trits.every((t) => t === 0 || t === 1 || t === 2)) return state
      return {
        ...state,
        history: [...state.history, { guess, trits: [...trits] }],
        guessInput: '',
      }
    }
    case 'editTrit': {
      const { row, col, value } = action.payload
      if (!(value === 0 || value === 1 || value === 2)) return state
      if (row < 0 || row >= state.history.length) return state
      const entry = state.history[row]
      if (!entry) return state
      if (col < 0 || col >= entry.trits.length) return state
      const newEntry: GuessEntry = {
        guess: entry.guess,
        trits: entry.trits.map((t, i) => (i === col ? value : t)),
      }
      const history = state.history.map((h, i) => (i === row ? newEntry : h))
      return { ...state, history }
    }
    case 'undo': {
      if (state.history.length === 0) return state
      return { ...state, history: state.history.slice(0, -1) }
    }
    case 'clear': {
      return { ...state, history: [], guessInput: '' }
    }
    case 'toggleColorblind': {
      return {
        ...state,
        settings: { ...state.settings, colorblind: !state.settings.colorblind },
      }
    }
    case 'setAttemptsMax': {
      const attemptsMax = Math.max(1, Math.min(100, Math.floor(action.value)))
      return { ...state, settings: { ...state.settings, attemptsMax } }
    }
    case 'setPolicy': {
      if (state.settings.policyMode === action.value) return state
      return { ...state, settings: { ...state.settings, policyMode: action.value } }
    }
    default:
      return state
  }
}

export const STORAGE_KEY = 'ibexicon:v2' // bump version to invalidate old cached games

// Basic runtime validation to ensure shape before accepting persisted data
function isValidPersist(obj: any): obj is SessionState {
  if (!obj || typeof obj !== 'object') return false
  const { settings, history, guessInput } = obj as SessionState
  if (!settings || typeof settings !== 'object') return false
  const requiredSettings = ['length', 'attemptsMax', 'colorblind'] as const
  if (!requiredSettings.every((k) => k in settings)) return false
  // policyMode optional in older persists; if missing we'll add default later
  if (!Array.isArray(history)) return false
  if (typeof guessInput !== 'string') return false
  if (
    typeof settings.length !== 'number' ||
    typeof settings.attemptsMax !== 'number' ||
    typeof settings.colorblind !== 'boolean' ||
    (settings.datasetId && typeof settings.datasetId !== 'string') ||
    (settings.policyMode &&
      settings.policyMode !== 'auto' &&
      settings.policyMode !== 'composite' &&
      settings.policyMode !== 'pure-eig' &&
      settings.policyMode !== 'in-set-only' &&
      settings.policyMode !== 'unique-letters') ||
    false
  )
    return false
  // History entries
  for (const h of history) {
    if (!h || typeof h !== 'object') return false
    if (typeof h.guess !== 'string' || !Array.isArray(h.trits)) return false
    if (!h.trits.every((t: any) => t === 0 || t === 1 || t === 2)) return false
    if (h.trits.length !== settings.length) return false
  }
  return true
}

export function loadPersisted(): SessionState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (isValidPersist(parsed)) {
      // We now intentionally drop any persisted history/guessInput to avoid carrying over games.
      const policyMode = parsed.settings.policyMode || 'auto'
      return {
        settings: { ...parsed.settings, policyMode },
        history: [],
        guessInput: '',
      }
    }
  } catch {
    // ignore
  }
  return null
}

let writeScheduled = false
let lastStateString = ''

export function persist(state: SessionState): void {
  if (typeof window === 'undefined') return
  // Avoid scheduling duplicate work & avoid writing identical JSON
  // Only persist settings (not history) to avoid caching in-progress games between sessions.
  const json = JSON.stringify({ settings: state.settings, history: [], guessInput: '' })
  if (json === lastStateString) return
  lastStateString = json
  if (writeScheduled) return
  writeScheduled = true
  const schedule = (cb: () => void) => {
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: any) => number)
      | undefined
    if (ric) ric(cb, { timeout: 500 })
    else setTimeout(cb, 0)
  }
  schedule(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lastStateString)
    } catch {
      // ignore storage quota errors
    } finally {
      writeScheduled = false
    }
  })
}
