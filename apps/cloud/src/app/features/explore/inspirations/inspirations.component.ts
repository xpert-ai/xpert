import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { catchError, map, of, tap } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  TKnowledgePipelineTemplate,
  XpertTemplateService
} from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'

@Component({
  standalone: true,
  selector: 'xp-explore-inspirations',
  imports: [CommonModule, TranslateModule, IconComponent],
  templateUrl: './inspirations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreInspirationsComponent {
  readonly search = input('')

  readonly #templateService = inject(XpertTemplateService)
  readonly #toastr = injectToastr()

  readonly loading = signal(true)
  readonly #items = toSignal(
    this.#templateService.getAllKnowledgePipelines({}).pipe(
      map((result) => result?.templates ?? []),
      tap(() => this.loading.set(false)),
      catchError((error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
        return of([] as TKnowledgePipelineTemplate[])
      })
    ),
    { initialValue: [] as TKnowledgePipelineTemplate[] }
  )

  readonly items = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.#items()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [item.title, item.name, item.description, item.author, item.category, ...(item.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })
}
