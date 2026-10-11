import { Dialog } from '@angular/cdk/dialog'
import { hasModifierKey } from '@angular/cdk/keycodes'
import { Injectable, inject } from '@angular/core'

import { map, take, takeUntil } from 'rxjs'

import { ZardDialogRef } from '../dialog/dialog-ref'
import { ZardDialogService } from '../dialog/dialog.service'
import { ZardAlertDialogComponent, type ZardAlertDialogOptions } from './alert-dialog.component'

import { ZardAlertDialogContentComponent } from './alert-dialog-content.component'

export interface ZardAlertDialogConfirmOptions extends ZardAlertDialogOptions {
  /** Compatibility option; all confirmation flows use the shared frame. */
  layout?: 'standard'
}

@Injectable({
  providedIn: 'root'
})
export class ZardAlertDialogService {
  private readonly dialog = inject(ZardDialogService)
  private readonly cdkDialog = inject(Dialog)
  private nextId = 0

  open(options: ZardAlertDialogOptions) {
    return this.dialog.open<ZardAlertDialogComponent, ZardAlertDialogOptions, boolean>(ZardAlertDialogComponent, {
      data: options,
      disableClose: options.maskClosable === false,
      width: options.width ?? '448px',
      panelClass: options.customClasses,
      viewContainerRef: options.viewContainerRef
    }) as ZardDialogRef<ZardAlertDialogComponent, boolean>
  }

  confirm(options: ZardAlertDialogConfirmOptions) {
    const closed = this.openStandard(options).closed
    return closed.pipe(
      map((result) => !!result),
      take(1)
    )
  }

  private openStandard(options: ZardAlertDialogOptions) {
    const id = `xp-alert-dialog-${this.nextId++}`
    const ref = this.cdkDialog.open<boolean>(ZardAlertDialogContentComponent, {
      id,
      data: options,
      role: 'alertdialog',
      ariaLabelledBy: options.title ? id + '-title' : null,
      ariaDescribedBy: options.description ? id + '-description' : null,
      width: options.width ?? '448px',
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: ['xp-overlay-pane-dialog', ...(options.customClasses?.split(/\s+/).filter(Boolean) ?? [])],
      viewContainerRef: options.viewContainerRef,
      disableClose: options.maskClosable === false,
      autoFocus: '[data-testid="z-alert-dialog-cancel"], [data-testid="z-alert-dialog-action"]'
    })
    // Legacy confirmations allow Escape even when clicking the backdrop is disabled.
    if (options.maskClosable === false) {
      ref.keydownEvents.pipe(takeUntil(ref.closed)).subscribe((event) => {
        if (event.key === 'Escape' && !hasModifierKey(event)) {
          event.preventDefault()
          ref.close()
        }
      })
    }
    return ref
  }
}
