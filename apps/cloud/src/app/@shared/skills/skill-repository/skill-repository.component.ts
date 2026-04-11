import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { getErrorMessage, ISkillRepository, ISkillRepositoryIndex } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@xpert-ai/headless-ui'
import { SkillRepositoryIndexService, SkillRepositoryService, ToastrService } from '../../../@core/services'
import { XpertSkillIndexesComponent } from '../indexes/indexes.component'

@Component({
  standalone: true,
  selector: 'xp-skill-repository',
  templateUrl: './skill-repository.component.html',
  styleUrls: ['./skill-repository.component.css'],
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, TranslateModule, ZardSegmentedComponent, ZardSegmentedItemComponent, XpertSkillIndexesComponent]
})
export class XpertSkillRepositoryComponent {
  readonly repositoryService = inject(SkillRepositoryService)
  readonly indexService = inject(SkillRepositoryIndexService)
  readonly toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ repository: ISkillRepository }>(DIALOG_DATA)

  readonly repository = model<ISkillRepository>(this.#data?.repository)
  readonly indexes = signal<ISkillRepositoryIndex[]>([])
  readonly mode = model<'incremental' | 'full'>('incremental')

  readonly loading = signal(false)
  readonly loadingIndexes = signal(false)


  close() {
    this.#dialogRef.close()
  }

  reloadIndexes() {
    this.loading.set(true)
    const repositoryId = this.repository()?.id
    this.indexService.sync(repositoryId, this.mode()).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastr.success('Repository indexes reloaded')
        this.loadIndexes(repositoryId)
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
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
        this.toastr.error(getErrorMessage(err))
      }
    })
  }
}
