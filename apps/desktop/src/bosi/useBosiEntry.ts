import { useCallback, useEffect, useRef, useState } from 'react'
import type { BosiSetup } from '@xpert-ai/contracts'
import { invoke } from '../host'

// Restoring another conversation must not hide the personal assistant's setup entry.
export function useBosiEntry(scope: string, enabled: boolean) {
  const [entry, setEntry] = useState<{ scope: string; setup: BosiSetup | null }>()
  const request = useRef(0)
  const currentScope = useRef(scope)
  currentScope.current = scope
  const update = useCallback(
    (setup: BosiSetup) => {
      if (currentScope.current !== scope) return
      request.current++
      setEntry({ scope, setup })
    },
    [scope]
  )
  useEffect(() => {
    if (!enabled) return
    const version = ++request.current
    void invoke('bosiSetup', {}).then(
      (setup) => {
        if (version === request.current) setEntry({ scope, setup })
      },
      () => {
        // Keep the entry on failure; opening it runs the wizard's visible error/retry flow.
        if (version === request.current) setEntry({ scope, setup: null })
      }
    )
    return () => {
      request.current++
    }
  }, [scope, enabled])
  return { setup: entry?.scope === scope ? entry.setup : null, loading: enabled && entry?.scope !== scope, update }
}
