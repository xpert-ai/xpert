interface PreviewState {
  active: string | null
  locked: boolean
}
type PreviewAction =
  | { type: 'open'; id: string }
  | { type: 'close'; id: string }
  | { type: 'lock'; id: string; locked: boolean }

// Ownership is per rendered trigger, not Bot: the sidebar keeps its hidden layout mounted.
export function previewScopeReducer(state: PreviewState, action: PreviewAction): PreviewState {
  if (action.type === 'open') {
    if (state.locked || state.active === action.id) return state
    return { active: action.id, locked: false }
  }
  if (state.active !== action.id) return state
  if (action.type === 'close') return { active: null, locked: false }
  return { ...state, locked: action.locked }
}
