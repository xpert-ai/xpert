import { AppPlatformDefinition } from '@xpert-ai/contracts'
import { PlatformAppState } from './app-platform-delivery.entity'

export function platformReady(definition: AppPlatformDefinition, states: PlatformAppState[]) {
  return definition.apps.filter(app => app.required && app.enabled).every(app => states.some(state => state.key === app.key && state.status === 'ready'))
}

/** A failed upgrade does not revoke previously delivered business data. Removal does. */
export function platformAppAvailable(state: PlatformAppState | undefined) {
  return !!state && state.status !== 'disabled' && (state.status === 'ready' || !!state.appliedDigest)
}

export function platformNeedsProvision(states: PlatformAppState[]) {
  return states.some(state => state.status !== 'ready' && state.status !== 'disabled')
}

export function reconcilePlatformApps(definition: AppPlatformDefinition, states: PlatformAppState[]): PlatformAppState[] {
  const existing = new Map(states.map(state => [state.key, state]))
  return [
    ...definition.apps.map(app => {
      const state = existing.get(app.key)
      if (!app.enabled) return { ...state, key: app.key, status: 'disabled' as const, attempts: state?.attempts ?? 0 }
      return state ? { ...state, status: state.status === 'disabled' ? 'pending' as const : state.status }
        : { key: app.key, status: 'pending' as const, attempts: 0 }
    }),
    ...states.filter(state => !definition.apps.some(app => app.key === state.key)).map(state => ({ ...state, status: 'disabled' as const }))
  ]
}
