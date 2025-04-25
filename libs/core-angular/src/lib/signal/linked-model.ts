import { computed, effect, signal, WritableSignal } from '@angular/core'

// Define the options interface for linkedModel
interface LinkedModelOptions<T> {
  initialValue: T // Initial value
  compute: () => T // Compute function, defines the logic for deriving the value
  update: (newValue: T, currentValue?: T) => T | void // Update function, defines how to update the current value based on the new value
}

export function linkedModel<T>(options: LinkedModelOptions<T>): WritableSignal<T> {
  const { initialValue, compute, update } = options
  const internalState = computed(compute)
  let currentValue = initialValue
  const derived = signal<T>(initialValue)

  // Use effect to automatically synchronize
  effect(
    () => {
      currentValue = internalState()
      derived.set(currentValue)
    },
    { allowSignalWrites: true }
  )

  effect(() => {
    if (derived() !== currentValue) {
      update(derived(), currentValue)
      currentValue = derived()
    }
  }, { allowSignalWrites: true })

  return derived
}

export function attrModel<T, K extends keyof T>(model: WritableSignal<T>, name: K) {
  return linkedModel<T[K]>({
    initialValue: null,
    compute: () => model()?.[name],
    update: (value) => {
      model.update((state) => ({ ...(state ?? {}), [name]: value } as T))
    }
  })
}