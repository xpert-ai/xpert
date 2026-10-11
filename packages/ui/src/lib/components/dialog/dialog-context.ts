import { InjectionToken, type Signal } from '@angular/core'

export type XpDialogPurpose = 'standard' | 'workflow'
export type XpDialogActionRole = 'header' | 'inline' | 'footer'

export interface XpDialogContext {
  purpose: Signal<XpDialogPurpose>
}

export interface XpDialogActionContext extends XpDialogContext {
  role: Signal<XpDialogActionRole | undefined>
}

export const XP_DIALOG_CONTEXT = new InjectionToken<XpDialogContext>('XP_DIALOG_CONTEXT')
export const XP_DIALOG_ACTION_CONTEXT = new InjectionToken<XpDialogActionContext>('XP_DIALOG_ACTION_CONTEXT')
