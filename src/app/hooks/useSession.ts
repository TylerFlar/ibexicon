import React, { useEffect, useReducer, useCallback } from 'react'
import {
  initialState,
  reducer,
  loadPersisted,
  persist,
  type SessionState,
  type Action,
  type Trit,
} from '../state/session'

export interface UseSessionResult extends SessionState {
  dispatch: React.Dispatch<Action>
  setLength(length: number): void
  setDataset(id: string, length: number): void
  setGuessInput(value: string): void
  addGuess(guess: string, trits: Trit[]): void
  editTrit(row: number, col: number, value: Trit): void
  undo(): void
  clear(): void
  toggleColorblind(): void
  setAttemptsMax(value: number): void
  setPolicy(value: 'auto' | 'composite' | 'pure-eig' | 'in-set-only' | 'unique-letters'): void
  setAccelMode(value: 'auto' | 'js' | 'wasm'): void
  setTheme(value: 'system' | 'light' | 'dark'): void
}

export function useSession(): UseSessionResult {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadPersisted() ?? initialState(5))

  // Persist on change
  useEffect(() => {
    persist(state)
  }, [state])

  // Action helpers
  const setLength = useCallback((length: number) => dispatch({ type: 'setLength', length }), [])
  const setDataset = useCallback(
    (id: string, length: number) => dispatch({ type: 'setDataset', id, length }),
    [],
  )
  const setGuessInput = useCallback(
    (value: string) => dispatch({ type: 'setGuessInput', value }),
    [],
  )
  const addGuess = useCallback(
    (guess: string, trits: Trit[]) => dispatch({ type: 'addGuess', payload: { guess, trits } }),
    [],
  )
  const editTrit = useCallback(
    (row: number, col: number, value: Trit) =>
      dispatch({ type: 'editTrit', payload: { row, col, value } }),
    [],
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const toggleColorblind = useCallback(() => dispatch({ type: 'toggleColorblind' }), [])
  const setAttemptsMax = useCallback(
    (value: number) => dispatch({ type: 'setAttemptsMax', value }),
    [],
  )
  const setPolicy = useCallback(
    (value: 'auto' | 'composite' | 'pure-eig' | 'in-set-only' | 'unique-letters') =>
      dispatch({ type: 'setPolicy', value }),
    [],
  )
  const setAccelMode = useCallback(
    (value: 'auto' | 'js' | 'wasm') => dispatch({ type: 'setAccelMode', value }),
    [],
  )
  const setTheme = useCallback(
    (value: 'system' | 'light' | 'dark') => dispatch({ type: 'setTheme', value }),
    [],
  )

  return {
    ...state,
    dispatch,
    setLength,
    setDataset,
    setGuessInput,
    addGuess,
    editTrit,
    undo,
    clear,
    toggleColorblind,
    setAttemptsMax,
    setPolicy,
    setAccelMode,
    setTheme,
  }
}
