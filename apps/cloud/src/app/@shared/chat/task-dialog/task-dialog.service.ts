import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { inject, Injectable } from '@angular/core'
import { IXpert, IXpertTask } from '../../../@core'
import { XpertTaskDialogComponent } from './task-dialog.component'

type CreateTaskDialogOptions = {
  total?: number | null
  xpertId?: string | null
  agentKey?: string | null
  lockXpertSelection?: boolean
  availableXperts?: IXpert[]
  projectId?: string | null
  task?: Partial<IXpertTask>
  connectorOnly?: boolean
}

@Injectable({ providedIn: 'root' })
export class XpertTaskDialogService {
  readonly #dialog = inject(Dialog)

  openCreateTask(options?: CreateTaskDialogOptions): DialogRef<IXpertTask | undefined> {
    const xpertId = options?.xpertId?.trim()
    const agentKey = options?.agentKey?.trim()
    const task = {
      ...options?.task,
      ...(options?.projectId ? { projectId: options.projectId } : {}),
      ...(xpertId
        ? {
            xpertId,
            ...(agentKey ? { agentKey } : {})
          }
        : {})
    }

    return this.#dialog.open<IXpertTask>(XpertTaskDialogComponent, {
      data: {
        total: options?.total ?? undefined,
        lockXpertSelection: !!options?.lockXpertSelection,
        availableXperts: options?.availableXperts,
        ...(options?.connectorOnly ? { connectorOnly: true } : {}),
        ...(Object.keys(task).length ? { task } : {})
      },
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet'
    })
  }
}
