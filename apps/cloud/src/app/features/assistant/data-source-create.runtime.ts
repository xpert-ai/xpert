import { DestroyRef, inject } from '@angular/core'
import { IDataSource, PermissionsEnum } from '@xpert-ai/contracts'
import { ZardDialogRef, ZardDialogService } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { Store } from '../../@core/state/store.service'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import type { XpDataSourceCreationComponent } from '../setting/data-sources/creation/creation.component'
import { registerDataSourceCreateCommand } from './data-source-create-client-command'

export function injectDataSourceCreateCommand() {
  const registry = inject(ViewClientCommandRegistry)
  const store = inject(Store)
  const dialog = inject(ZardDialogService)
  const destroyRef = inject(DestroyRef)
  let active: Promise<Partial<IDataSource> | undefined> | undefined
  let dialogRef: ZardDialogRef<XpDataSourceCreationComponent, Partial<IDataSource>, undefined> | undefined
  const unregister = registerDataSourceCreateCommand(registry, {
    canCreate: () => store.hasPermission(PermissionsEnum.DATA_SOURCE_EDIT),
    create: () => {
      if (!active) {
        active = (async () => {
          const { XpDataSourceCreationComponent } = await import('../setting/data-sources/creation/creation.component')
          if (destroyRef.destroyed) return undefined
          dialogRef = dialog.open<XpDataSourceCreationComponent, undefined, Partial<IDataSource>>(
            XpDataSourceCreationComponent,
            {
              backdropClass: 'xp-overlay-share-sheet',
              panelClass: ['xp-overlay-pane-share-sheet', '!p-0'],
              width: 'min(780px, calc(100vw - 48px))',
              maxWidth: 'calc(100vw - 48px)'
            }
          )
          return firstValueFrom(dialogRef.closed, { defaultValue: undefined })
        })().finally(() => {
          active = undefined
          dialogRef = undefined
        })
      }
      return active
    }
  })
  destroyRef.onDestroy(() => {
    unregister()
    dialogRef?.close()
  })
}
