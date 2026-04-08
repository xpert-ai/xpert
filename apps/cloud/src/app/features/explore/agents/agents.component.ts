import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import {
  getErrorMessage,
  IXpertProject,
  injectToastr,
  TXpertTemplate,
  XpertTemplateService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertProjectInstallComponent } from '@cloud/app/@shared/chat'
import { NgmHighlightDirective, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, map, of, tap } from 'rxjs'
import { ExploreAgentInstallComponent } from './install/install.component'

@Component({
  standalone: true,
  selector: 'xp-explore-agents',
  imports: [CommonModule, TranslateModule, NgmSpinComponent, NgmHighlightDirective, EmojiAvatarComponent],
  templateUrl: './agents.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreAgentsComponent {
  readonly search = input('')
  readonly eXpertTypeEnum = XpertTypeEnum

  readonly #templateService = inject(XpertTemplateService)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()

  readonly loading = signal(true)
  readonly #items = toSignal(
    this.#templateService.getAll().pipe(
      map((result) => result?.recommendedApps ?? []),
      tap(() => this.loading.set(false)),
      catchError((error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
        return of([] as TXpertTemplate[])
      })
    ),
    { initialValue: [] as TXpertTemplate[] }
  )

  readonly items = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.#items()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [item.title, item.name, item.description, item.category].filter(Boolean).join(' ').toLowerCase().includes(term)
    )
  })

  install(item: TXpertTemplate) {
    if (item.type === XpertTypeEnum.Agent || item.type === XpertTypeEnum.Copilot) {
      this.#dialog.open(ExploreAgentInstallComponent, {
        data: item
      })
      return
    }

    if (item.type === 'project') {
      this.#dialog
        .open<IXpertProject>(XpertProjectInstallComponent, {
          data: {
            template: item
          }
        })
        .closed.subscribe({
          next: (project) => {
            if (project) {
              this.#router.navigate(['/chat', 'p', project.id])
            }
          }
        })
    }
  }

  typeLabel(type: TXpertTemplate['type']) {
    switch (type) {
      case XpertTypeEnum.Copilot:
        return 'Copilot'
      case XpertTypeEnum.Agent:
        return 'Agent'
      case 'project':
        return 'Project'
      default:
        return 'Template'
    }
  }

  typeIcon(type: TXpertTemplate['type']) {
    switch (type) {
      case XpertTypeEnum.Copilot:
        return 'ri-sparkling-line'
      case 'project':
        return 'ri-team-line'
      default:
        return 'ri-robot-3-line'
    }
  }
}
