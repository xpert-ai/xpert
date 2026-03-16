import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, DestroyRef, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { injectWorkspace } from '@metad/cloud/state'
import { OverlayAnimation1 } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { map, tap } from 'rxjs/operators'
import { injectUser, IXpertWorkspace, OrderTypeEnum, Store, XpertWorkspaceService } from '../../../@core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'pac-workspace-selector',
  templateUrl: 'workspace-selector.component.html',
  styleUrl: 'workspace-selector.component.scss',
  host: {
    class: 'pac-workspace-selector'
  },
  imports: [FormsModule, CdkMenuModule, TranslateModule, ...ZardTooltipImports],
  animations: [OverlayAnimation1]
})
export class WorkspaceSelectorComponent {
  private readonly store = inject(Store)
  private readonly destroyRef = inject(DestroyRef)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly router = inject(Router)

  readonly selectedWorkspace = injectWorkspace()
  readonly me = injectUser()

  readonly loading = signal(true)
  readonly workspaces = toSignal(
    this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(
      map(({ items }) => items),
      tap(() => this.loading.set(false))
    ),
    { initialValue: null }
  )
  readonly selectedWorkspaces = model<string[]>([])

  selectWorkspace(ws: IXpertWorkspace) {
    this.store.setWorkspace(ws)
    this.router.navigate(['/xpert/w/', ws.id])
  }

  routeWorkspace(ws: IXpertWorkspace) {
    if (!ws || !ws.id) return
    this.router.navigate(['/xpert/w/', ws.id])
  }
}
