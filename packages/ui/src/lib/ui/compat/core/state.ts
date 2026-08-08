import { Draft, produce } from 'immer'

export function write<S>(updater: (state: Draft<S>) => void): (state: S) => S {
  return (state) => produce(state, updater)
}
