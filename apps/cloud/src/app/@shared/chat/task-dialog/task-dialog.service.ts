import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { inject, Injectable } from '@angular/core'
import { IXpertTask } from '../../../@core'
import { XpertTaskDialogComponent } from './task-dialog.component'

type CreateTaskDialogOptions = {
  total?: number | null
  xpertId?: string | null
  agentKey?: string | null
  lockXpertSelection?: boolean
}

@Injectable({ providedIn: 'root' })
export class XpertTaskDialogService {
  readonly #dialog = inject(Dialog)

  openCreateTask(options?: CreateTaskDialogOptions): DialogRef<IXpertTask | undefined> {
    const xpertId = options?.xpertId?.trim()
    const agentKey = options?.agentKey?.trim()

    return this.#dialog.open<IXpertTask>(XpertTaskDialogComponent, {
      data: {
        total: options?.total ?? undefined,
        lockXpertSelection: !!options?.lockXpertSelection,
        ...(xpertId
          ? {
              task: {
                xpertId,
                ...(agentKey ? { agentKey } : {})
              }
            }
          : {})
      },
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet'
    })
  }
}
