import { useEffect, useReducer, useCallback } from 'react'
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
  setGuessInput(value: string): void
  addGuess(guess: string, trits: Trit[]): void
  editTrit(row: number, col: number, value: Trit): void
  undo(): void
  clear(): void
  toggleColorblind(): void
  setTauAuto(value: boolean): void
  setTau(value: number): void
  setTopK(value: number): void
  setAttemptsMax(value: number): void
}

export function useSession(): UseSessionResult {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => loadPersisted() ?? initialState(5),
  )

  // Persist on change
  useEffect(() => {
    persist(state)
  }, [state])

  // Action helpers
  const setLength = useCallback(
    (length: number) => dispatch({ type: 'setLength', length }),
    [],
  )
  const setGuessInput = useCallback(
    (value: string) => dispatch({ type: 'setGuessInput', value }),
    [],
  )
  const addGuess = useCallback(
    (guess: string, trits: Trit[]) =>
      dispatch({ type: 'addGuess', payload: { guess, trits } }),
    [],
  )
  const editTrit = useCallback(
    (row: number, col: number, value: Trit) =>
      dispatch({ type: 'editTrit', payload: { row, col, value } }),
    [],
  )
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const toggleColorblind = useCallback(
    () => dispatch({ type: 'toggleColorblind' }),
    [],
  )
  const setTauAuto = useCallback(
    (value: boolean) => dispatch({ type: 'setTauAuto', value }),
    [],
  )
  const setTau = useCallback(
    (value: number) => dispatch({ type: 'setTau', value }),
    [],
  )
  const setTopK = useCallback(
    (value: number) => dispatch({ type: 'setTopK', value }),
    [],
  )
  const setAttemptsMax = useCallback(
    (value: number) => dispatch({ type: 'setAttemptsMax', value }),
    [],
  )

  return {
    ...state,
    dispatch,
    setLength,
    setGuessInput,
    addGuess,
    editTrit,
    undo,
    clear,
    toggleColorblind,
    setTauAuto,
    setTau,
    setTopK,
    setAttemptsMax,
  }
}
