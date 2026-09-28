import { createContext, useContext, useCallback, useReducer, type ReactNode } from 'react'
import { previewScopeReducer } from './preview-scope-state'

interface PreviewScope {
  active: string | null
  locked: boolean
  open: (id: string) => void
  close: (id: string) => void
  lock: (id: string, locked: boolean) => void
}
const Context = createContext<PreviewScope | null>(null)
export function AssistantPreviewScope({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(previewScopeReducer, { active: null, locked: false })
  const open = useCallback((id: string) => dispatch({ type: 'open', id }), [])
  const close = useCallback((id: string) => dispatch({ type: 'close', id }), [])
  const lock = useCallback((id: string, locked: boolean) => dispatch({ type: 'lock', id, locked }), [])
  return <Context.Provider value={{ ...state, open, close, lock }}>{children}</Context.Provider>
}
export function usePreviewScope() {
  const scope = useContext(Context)
  if (!scope) throw new Error('Assistant preview requires a scope')
  return scope
}
