import { computed } from '@angular/core'
import {
  CHAT_SHELL_TRANSITION_CLASSES,
  DETAIL_PANEL_CONTENT_TRANSITION_CLASSES,
  DETAIL_PANEL_SHELL_TRANSITION_CLASSES
} from './layout'

export function createWorkspacePanelClasses(state: {
  showDetailPanel: () => boolean
  overlayDialog: () => boolean
  chatkitHiddenFromWorkspace: () => boolean
  isChatMinimizedToPet: () => boolean
}) {
  const detailPanelShellClasses = computed(() =>
    state.showDetailPanel()
      ? `min-h-0 min-w-0 overflow-hidden ${DETAIL_PANEL_SHELL_TRANSITION_CLASSES} translate-x-0 opacity-100`
      : `pointer-events-none min-h-0 min-w-0 overflow-hidden ${DETAIL_PANEL_SHELL_TRANSITION_CLASSES} -translate-x-6 opacity-0`
  )
  const detailPanelContentClasses = computed(() =>
    state.showDetailPanel()
      ? `flex h-full min-h-0 flex-col overflow-hidden ${DETAIL_PANEL_CONTENT_TRANSITION_CLASSES} translate-x-0 opacity-100`
      : `pointer-events-none flex h-full min-h-0 flex-col overflow-hidden ${DETAIL_PANEL_CONTENT_TRANSITION_CLASSES} -translate-x-3 opacity-0`
  )
  const chatShellClasses = computed(() => {
    if (state.overlayDialog()) {
      return `relative min-h-0 min-w-0 overflow-visible p-0 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-0 lg:max-w-0 lg:justify-self-end`
    }

    if (state.chatkitHiddenFromWorkspace()) {
      if (state.isChatMinimizedToPet()) {
        return `relative min-h-0 min-w-0 overflow-visible p-0 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-0 lg:max-w-0 lg:justify-self-end`
      }

      return `pointer-events-none relative min-h-0 min-w-0 overflow-hidden p-0 opacity-0 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-0 lg:max-w-0 lg:justify-self-end`
    }

    return state.showDetailPanel()
      ? `relative min-h-0 min-w-0 opacity-100 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-full lg:max-w-[var(--clawxpert-chatkit-width)] lg:justify-self-end`
      : `relative min-h-0 min-w-0 rounded-none border border-transparent bg-transparent shadow-none opacity-100 ${CHAT_SHELL_TRANSITION_CLASSES} lg:w-full`
  })
  return { detailPanelShellClasses, detailPanelContentClasses, chatShellClasses }
}
