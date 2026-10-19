/** Run-scoped evidence for multi-tool writes. A file write is not a domain commit. */
export function createMutationEvidence<T>() {
  let generation = 0,
    committed = 0
  let receipt: T | undefined
  return {
    begin() {
      return ++generation
    },
    accept(token: number, value: T) {
      if (token !== generation) return
      committed = token
      receipt = value
    },
    get pending() {
      return generation > committed
    },
    get receipt() {
      return receipt
    }
  }
}
