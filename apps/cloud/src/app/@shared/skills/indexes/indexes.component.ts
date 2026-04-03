import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import {
  getErrorMessage,
  injectToastr,
  ISkillRepository,
  ISkillRepositoryIndex,
  SkillRepositoryIndexService
} from '@cloud/app/@core'
import { debouncedSignal } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-skill-indexes',
  templateUrl: './indexes.component.html',
  styleUrls: ['./indexes.component.scss'],
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, TranslateModule]
})
export class XpertSkillIndexesComponent {
  readonly indexService = inject(SkillRepositoryIndexService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly selectedRepository = input<ISkillRepository | null>(null)
  readonly indexes = model<ISkillRepositoryIndex[]>([])

  // Outputs
  readonly installing = output<ISkillRepositoryIndex>()

  //States
  readonly repositoryId = computed(() => this.selectedRepository()?.id)
  readonly search = model<string>('')
  readonly marketplaceOnly = model<boolean>(false)
  readonly sortBy = model<'stars' | 'recent'>('stars')
  readonly loadingIndexes = signal(false)

  readonly #searchTerm = debouncedSignal(this.search, 300)

  readonly filteredIndexes = computed(() => {
    const term = this.#searchTerm()?.toLowerCase().trim()
    const sort = this.sortBy()
    let items = [...(this.indexes() ?? [])]

    if (term) {
      items = items.filter((item) => {
        const haystack = [item.name, item.skillId, item.skillPath, item.description, ...(item.tags ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
    }

    if (this.marketplaceOnly()) {
      items = items.filter((item) => (item.tags ?? []).some((tag) => tag.toLowerCase().includes('marketplace')))
    }

    items.sort((a, b) => {
      if (sort === 'recent') {
        return (
          new Date(b.updatedAt ?? b.createdAt ?? '').getTime() - new Date(a.updatedAt ?? a.createdAt ?? '').getTime()
        )
      }
      return (b.tags?.length ?? 0) - (a.tags?.length ?? 0)
    })

    return items
  })

  constructor() {
    effect(() => {
      const repoId = this.repositoryId()
      if (repoId) {
        this.loadIndexes(repoId)
      }
    }, { allowSignalWrites: true })
  }

  install(item: ISkillRepositoryIndex) {
    this.installing.emit(item)
  }

  loadIndexes(repositoryId: string) {
    this.loadingIndexes.set(true)
    this.indexService.getAllByRepository(repositoryId).subscribe({
      next: ({ items }) => {
        this.loadingIndexes.set(false)
        this.indexes.set(items ?? [])
      },
      error: (err) => {
        this.loadingIndexes.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
