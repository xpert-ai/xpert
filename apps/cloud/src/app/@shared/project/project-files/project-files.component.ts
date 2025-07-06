import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog'
import { NgmConfirmDeleteComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { Subscription, firstValueFrom, of, startWith, switchMap, tap } from 'rxjs'
import { IStorageFile, ProjectAPIService, StorageFileService, ToastrService, listAnimation } from '../../../@core'
import { MaterialModule } from '../../material.module'

@Component({
  standalone: true,
  selector: 'pac-project-files',
  templateUrl: './project-files.component.html',
  styleUrls: ['project-files.component.scss'],
  providers: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    ButtonGroupDirective,
    AppearanceDirective,
    DensityDirective,
    NgmSearchComponent
  ],
  animations: [listAnimation]
})
export class ProjectFilesDialogComponent {
  private readonly _dialog = inject(MatDialog)
  private readonly _data = inject<{ projectId: string }>(MAT_DIALOG_DATA)
  private readonly _toastrService = inject(ToastrService)
  private readonly projectService = inject(ProjectAPIService)
  private readonly storageFileService = inject(StorageFileService)

  readonly #files = signal<IStorageFile[]>([])
  readonly activedFile = signal(null)
  readonly searchControl = new FormControl('')
  readonly search = toSignal(this.searchControl.valueChanges.pipe(startWith('')))
  readonly filteredFiles = computed(() => {
    const text = this.search()?.toLowerCase()
    return text ? this.#files().filter((file) => file.originalName?.toLowerCase().includes(text)) : this.#files()
  })

  private uploadSubscribtion: Subscription
  file: File | null = null
  readonly isLoading = signal(false)
  constructor() {
    this.projectService.getOne(this._data.projectId, ['files']).subscribe((project) => {
      this.#files.set(project.files)
    })
  }

  activeLink(file: IStorageFile) {
    this.activedFile.set(file)
  }

  onFileSelected(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0]
    if (this.file) {
      this.isLoading.set(true)
      this.uploadSubscribtion = of(this.file)
        .pipe(
          switchMap((file) => {
            const formData = new FormData()
            formData.append('file', file)
            return this.storageFileService._create(formData)
          }),
          switchMap((file: any | IStorageFile) => {
            return this.projectService
              .updateFiles(
                this._data.projectId,
                [...this.#files(), file].map(({ id }) => id)
              )
              .pipe(
                tap(() => {
                  this.#files.update((files) => [...files, file])
                  this.activeLink(file)
                })
              )
          })
        )
        .subscribe({
          next: (project) => {
            this.isLoading.set(false)
          },
          error: (err) => {
            this.isLoading.set(false)
          }
        })
    }
  }

  async deleteFile(event, file: IStorageFile) {
    event.stopPropagation()
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: file.originalName } }).afterClosed()
    )

    if (!confirm) return

    try {
      await firstValueFrom(this.projectService.removeFile(this._data.projectId, file.id))
      this.#files.update((files) => files.filter(({ id }) => id !== file.id))
    } catch (error) {
      this._toastrService.error(error)
    }
  }

  isImage(file: IStorageFile) {
    return file.mimetype?.startsWith('image')
  }
}
