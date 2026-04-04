import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { getErrorMessage, ISkillRepositoryIndex } from '@cloud/app/@core'
import { XpertSkillRepositoriesComponent, XpertSkillRepositoryRegisterComponent } from '@cloud/app/@shared/skills'
import { TranslateModule } from '@ngx-translate/core'
import { SkillRepositoryIndexService, ToastrService } from '../../../@core/services'

@Component({
  standalone: true,
  selector: 'pac-settings-skill-repository',
  templateUrl: './skill-repository.component.html',
  styleUrls: ['./skill-repository.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    XpertSkillRepositoriesComponent
  ]
})
export class SkillRepositoryComponent {
  readonly indexService = inject(SkillRepositoryIndexService)

  readonly toastr = inject(ToastrService)
  readonly #dialog = inject(Dialog)

  readonly indexes = signal<ISkillRepositoryIndex[]>([])

  readonly search = model<string>('')
  readonly marketplaceOnly = model<boolean>(false)
  readonly sortBy = model<'stars' | 'recent'>('stars')

  // Children
  readonly repositories = viewChild('repositories', { read: XpertSkillRepositoriesComponent })

  readonly selectedRepositoryId = model<string | null>(null)
  readonly loadingRepos = signal(false)
  readonly loadingIndexes = signal(false)

  readonly filteredIndexes = computed(() => {
    const term = this.search().toLowerCase().trim()
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

  readonly loading = signal(false)
  readonly showSelectedRepository = signal(false)

  openRegisterRepositoryModal() {
    this.#dialog.open<string>(XpertSkillRepositoryRegisterComponent).closed.subscribe((repositoryId: string | null) => {
      if (repositoryId) {
        this.selectedRepositoryId.set(repositoryId)
        this.showSelectedRepository.set(true)
        this.repositories().loadRepositories()
        // this.repositories().loadIndexes(repositoryId)
      }
    })
  }

  reloadIndexes() {
    this.loading.set(true)
    const repositoryId = this.selectedRepositoryId()
    this.indexService.sync(repositoryId).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastr.success('Repository indexes reloaded')
        // this.loadIndexes(repositoryId)
        this.showSelectedRepository.set(false)
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
  }

  displayName(item: ISkillRepositoryIndex) {
    return item.name || item.skillId || item.skillPath
  }

  onMarketplaceOnlyChange(event: Event) {
    const input = event.target as HTMLInputElement
    this.marketplaceOnly.set(input.checked)
  }
}
