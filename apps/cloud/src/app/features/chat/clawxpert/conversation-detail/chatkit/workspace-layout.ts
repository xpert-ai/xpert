import { computed, linkedSignal } from '@angular/core'
import { WORKSPACE_LAYOUT_TRANSITION_CLASSES } from './layout'

type WorkspaceLayout = 'workbench' | 'empty' | 'split' | 'chat'

export function createWorkspaceLayoutClasses(state: {
  overlayDialog: () => boolean
  isChatMinimizedToPet: () => boolean
  chatkitHiddenFromWorkspace: () => boolean
  showDetailPanel: () => boolean
  isResizingChatkit: () => boolean
}) {
  const layout = computed<WorkspaceLayout>(() => {
    if (state.overlayDialog()) return 'workbench'
    if (state.isChatMinimizedToPet()) return state.showDetailPanel() ? 'workbench' : 'empty'
    if (state.chatkitHiddenFromWorkspace()) return 'workbench'
    return state.showDetailPanel() ? 'split' : 'chat'
  })
  const animateLayout = linkedSignal({
    source: layout,
    computation: (current, previous) =>
      // Restoring ChatKit should reveal its saved width without growing from zero.
      !(current === 'split' && (previous?.source === 'workbench' || previous?.source === 'empty'))
  })

  return computed(() => {
    const transitionClasses =
      state.isResizingChatkit() || !animateLayout() ? 'transition-none' : WORKSPACE_LAYOUT_TRANSITION_CLASSES
    const base = `grid h-full min-h-0 grid-cols-1 ${transitionClasses}`

    switch (layout()) {
      case 'workbench':
        return `${base} grid-rows-[minmax(0,1fr)_0rem] lg:grid-cols-[minmax(0,1fr)_0rem] lg:grid-rows-1`
      case 'empty':
        return `${base} grid-rows-[0rem_0rem] lg:grid-cols-[0rem_0rem] lg:grid-rows-1`
      case 'split':
        return `${base} grid-rows-[minmax(0,1fr)_minmax(24rem,32rem)] lg:grid-cols-[minmax(0,1fr)_minmax(24rem,var(--clawxpert-chatkit-width))] lg:grid-rows-1`
      case 'chat':
        return `${base} grid-rows-[0rem_minmax(0,1fr)] lg:grid-cols-[0rem_minmax(0,1fr)] lg:grid-rows-1`
    }
  })
}
