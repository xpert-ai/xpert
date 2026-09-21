import { XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'
import type { ClawXpertWorkbenchLayoutState } from '../../clawxpert-workbench-layout-storage.service'

export const CHAT_MINIMIZED_TO_PET_ATTRIBUTE = 'data-chat-minimized-to-pet'

export const CHATKIT_DISPLAY_MODE_ATTRIBUTE = 'data-display-mode'

export const CHATKIT_OPEN_ATTRIBUTE = 'data-chat-open'

export const CLAWXPERT_CHATKIT_MIN_WIDTH_PX = 384

export const CLAWXPERT_CHATKIT_DEFAULT_WIDTH_PX = 460

export const CLAWXPERT_CHATKIT_MAX_WIDTH_PX = 960

const CLAWXPERT_CHAT_COLUMN_MAX_WIDTH_PX = 840

export const CLAWXPERT_CHAT_COLUMN_MAX_WIDTH = `${CLAWXPERT_CHAT_COLUMN_MAX_WIDTH_PX}px`

export const WORKSPACE_LAYOUT_TRANSITION_CLASSES =
  'transition-[grid-template-columns,grid-template-rows,gap] duration-500 ease-out motion-reduce:transition-none'

export const CHAT_SHELL_TRANSITION_CLASSES =
  'transition-[padding,opacity,border-color,background-color,box-shadow,border-radius] duration-500 ease-out motion-reduce:transition-none'

export const DETAIL_PANEL_SHELL_TRANSITION_CLASSES =
  'transition-[max-height,opacity,transform] duration-500 ease-out motion-reduce:transition-none will-change-transform'

export const DETAIL_PANEL_CONTENT_TRANSITION_CLASSES =
  'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none will-change-transform'

export function clampChatkitWidth(width: number) {
  return Math.min(CLAWXPERT_CHATKIT_MAX_WIDTH_PX, Math.max(CLAWXPERT_CHATKIT_MIN_WIDTH_PX, Math.round(width)))
}

export function toConfiguredWorkbenchLayoutState(
  layout: XpertWorkbenchInitialLayoutEnum | null
): ClawXpertWorkbenchLayoutState | null {
  if (layout === null) {
    return 'minimized'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.TwoColumns) {
    return 'normal'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.OverlayDialog) {
    return 'overlay'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.ChatkitMaximized) {
    return 'minimized'
  }
  if (layout === XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized) {
    return 'maximized'
  }
  return null
}

export function resolveEmbeddedChatkitElement(host: HTMLElement) {
  return host.querySelector<HTMLElement>('xpertai-chatkit') ?? host
}

export function isChatkitVisuallyMinimizedToPet(chatkitElement: HTMLElement) {
  return (
    chatkitElement.dataset.chatMinimizedToPet === 'true' ||
    (chatkitElement.dataset.displayMode === 'pet' && chatkitElement.dataset.chatOpen !== 'true')
  )
}
