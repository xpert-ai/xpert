import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { getErrorMessage, injectSkillPackageAPI, injectToastr, ISkillPackage } from '@cloud/app/@core'
import { forkJoin } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-skill-upload-dialog',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, NgmSpinComponent],
  template: `
    <div class="w-[420px] overflow-hidden rounded-2xl bg-components-card-bg text-text-primary shadow-2xl">
      <div class="flex items-center justify-between border-b border-divider-regular px-4 py-3">
        <div class="text-lg font-semibold">
          {{ 'PAC.Skill.UploadSkills' | translate : { Default: 'Upload Skills' } }}
        </div>
        <button type="button" class="text-text-tertiary transition-colors hover:text-text-primary" (click)="close()">
          <i class="ri-close-line text-xl"></i>
        </button>
      </div>

      <div class="p-4 space-y-4">
        <div class="rounded-lg border-2 border-dashed border-divider-regular bg-background-default-subtle p-4">
          <p class="mb-2 text-sm text-text-secondary">
            {{ 'PAC.Skill.UploadSkillsHint' | translate : { Default: 'Upload a zip containing one or more skill folders (each with SKILL.md).' } }}
          </p>
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between rounded-md bg-components-input-bg-normal px-3 py-2 transition-colors hover:bg-hover-bg"
            [disabled]="loading()"
            (click)="openFilePicker()"
          >
            <div class="flex items-center gap-2">
              <i class="ri-upload-2-line"></i>
              <span class="text-sm text-text-primary">
                {{ 'PAC.Skill.ChooseFile' | translate : { Default: 'Choose file' } }}
              </span>
            </div>
            <span class="text-xs text-text-tertiary">{{ files().length }}</span>
            <input
              #fileInput
              type="file"
              class="hidden"
              accept=".zip,application/zip"
              multiple
              (change)="onFileChange($event)"
            />
          </button>

          @if (files().length) {
            <div class="mt-3 max-h-40 overflow-auto space-y-2">
              @for (file of files(); track fileTrackBy($index, file)) {
                <div class="flex items-center justify-between rounded-md border border-divider-regular bg-components-card-bg/80 px-3 py-2">
                  <div class="min-w-0 truncate text-sm text-text-primary">{{ file.name }}</div>
                  <button
                    type="button"
                    class="ml-2 text-text-tertiary transition-colors hover:text-text-destructive"
                    [disabled]="loading()"
                    (click)="removeFile($index)"
                  >
                    <i class="ri-delete-bin-line"></i>
                  </button>
                </div>
              }
            </div>
          }
        </div>

        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="btn btn-secondary btn-medium"
            [disabled]="loading()"
            (click)="close()"
          >
            {{ 'PAC.ACTIONS.Cancel' | translate : { Default: 'Cancel' } }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-medium"
            [class.btn-disabled]="!files().length"
            [disabled]="!files().length || loading()"
            (click)="upload()"
          >
            @if (loading()) {
              <ngm-spin size="small" class="mr-1" /> {{ 'PAC.ACTIONS.Uploading' | translate : { Default: 'Uploading' } }}
            } @else {
              <i class="ri-cloud-upload-line mr-1"></i>
              {{ 'PAC.ACTIONS.Upload' | translate : { Default: 'Upload' } }}
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class XpertSkillUploadDialogComponent implements AfterViewInit {
  readonly #dialogRef = inject(DialogRef<ISkillPackage[] | null>)
  readonly #data = inject<{ workspaceId: string }>(DIALOG_DATA)
  readonly #skillPackageAPI = injectSkillPackageAPI()
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly fileInputRef = viewChild('fileInput', { read: ElementRef<HTMLInputElement> })

  readonly files = signal<File[]>([])
  readonly loading = signal(false)

  ngAfterViewInit() {
    queueMicrotask(() => {
      this.openFilePicker()
    })
  }

  openFilePicker() {
    this.fileInputRef()?.nativeElement.click()
  }

  fileTrackBy(index: number, file: File) {
    return `${file.name}-${file.size}-${file.lastModified}-${index}`
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files?.length) {
      const selected = Array.from(input.files)
      const current = this.files()
      const existed = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`))
      const merged = [...current]

      for (const file of selected) {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (!existed.has(key)) {
          merged.push(file)
        }
      }

      this.files.set(merged)
      input.value = ''
    }
  }

  removeFile(index: number) {
    const files = this.files()
    if (index < 0 || index >= files.length) {
      return
    }
    this.files.set(files.filter((_, i) => i !== index))
  }

  upload() {
    const workspaceId = this.#data.workspaceId
    const files = this.files()
    if (!workspaceId || !files.length || this.loading()) {
      return
    }

    this.loading.set(true)
    forkJoin(files.map((file) => this.#skillPackageAPI.uploadPackage(workspaceId, file))).subscribe({
      next: (results) => {
        this.loading.set(false)
        const packages = results.flatMap((items) => items ?? [])
        this.#toastr.success(
          this.#translate.instant('PAC.Skill.SkillUploadSuccess', { Default: 'Skills uploaded successfully' })
        )
        this.#dialogRef.close(packages ?? [])
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.danger(getErrorMessage(err))
      }
    })
  }

  close() {
    this.#dialogRef.close(null)
  }
}
