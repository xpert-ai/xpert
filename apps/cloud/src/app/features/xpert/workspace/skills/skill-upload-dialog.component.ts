import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpDialogActionGroupDirective, XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  injectSkillPackageAPI,
  injectSkillRepositoryService,
  injectToastr,
  ISkillPackage,
  ISkillRepositoryIndex
} from '@cloud/app/@core'
import { firstValueFrom } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-skill-upload-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    XpDialogActionGroupDirective,
    ...XpDialogFrameImports,
    ZardButtonComponent
  ],
  template: `
    <section xpDialogLayout="standard" class="max-h-[calc(100dvh-2rem)] w-[480px] max-w-[calc(100vw-2rem)]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.Skill.UploadSkills' | translate: { Default: 'Upload Skills' } }}
        </h2>
        <p xpDialogDescription>
          {{
            'XP.Skill.UploadSkillsHint'
              | translate: { Default: 'Upload a zip containing one or more skill folders (each with SKILL.md).' }
          }}
        </p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [zDisabled]="loading()"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <i class="ri-close-line text-lg" aria-hidden="true"></i>
        </button>
      </header>

      <div xpDialogBody>
        <div xpDialogActionGroup="inline">
          <button
            z-button
            zType="outline"
            type="button"
            class="w-full"
            [zDisabled]="loading()"
            (click)="openFilePicker()"
          >
            <i class="ri-upload-2-line" aria-hidden="true"></i>
            {{ 'XP.Skill.ChooseFile' | translate: { Default: 'Choose file' } }}
          </button>
          <input
            #fileInput
            type="file"
            class="hidden"
            accept=".zip,application/zip"
            multiple
            (change)="onFileChange($event)"
          />
        </div>

        @if (files().length) {
          <ul class="divide-y divide-divider-regular">
            @for (file of files(); track fileTrackBy($index, file)) {
              <li xpDialogActionGroup="inline" class="flex items-center justify-between gap-3 py-2">
                <div class="min-w-0 truncate text-sm text-text-primary">{{ file.name }}</div>
                <button
                  z-button
                  zType="ghost"
                  zSize="icon"
                  type="button"
                  [zDisabled]="loading()"
                  [attr.aria-label]="('XP.ACTIONS.Remove' | translate: { Default: 'Remove' }) + ' ' + file.name"
                  (click)="removeFile($index)"
                >
                  <i class="ri-delete-bin-line text-text-destructive" aria-hidden="true"></i>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" [zDisabled]="loading()" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button
          z-button
          type="button"
          [zLoading]="loading()"
          [zDisabled]="!files().length || loading()"
          (click)="upload()"
        >
          <i class="ri-upload-cloud-line" aria-hidden="true"></i>
          {{ 'XP.ACTIONS.Upload' | translate: { Default: 'Upload' } }}
        </button>
      </footer>
    </section>
  `,
  styles: []
})
export class XpertSkillUploadDialogComponent implements AfterViewInit {
  readonly #dialogRef = inject(DialogRef<Array<ISkillPackage | ISkillRepositoryIndex> | null>)
  readonly #data = inject<{ repositoryId?: string; workspaceId?: string }>(DIALOG_DATA)
  readonly #skillPackageAPI = injectSkillPackageAPI()
  readonly #skillRepositoryService = injectSkillRepositoryService()
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

  async upload() {
    const workspaceId = this.#data.workspaceId
    const repositoryId = this.#data.repositoryId
    const files = this.files()
    if ((!workspaceId && !repositoryId) || !files.length || this.loading()) {
      return
    }

    this.loading.set(true)
    try {
      let items: Array<ISkillPackage | ISkillRepositoryIndex>

      if (repositoryId) {
        const results = await Promise.all(
          files.map((file) => firstValueFrom(this.#skillRepositoryService.uploadPackage(repositoryId, file)))
        )
        items = results.flatMap((result) => result)
      } else {
        const results = await Promise.all(
          files.map((file) => firstValueFrom(this.#skillPackageAPI.uploadPackage(workspaceId!, file)))
        )
        items = results.flatMap((result) => result)
      }

      this.#toastr.success(
        this.#translate.instant('XP.Skill.SkillUploadSuccess', { Default: 'Skills uploaded successfully' })
      )
      this.#dialogRef.close(items)
    } catch (err) {
      this.#toastr.danger(getErrorMessage(err))
    } finally {
      this.loading.set(false)
    }
  }

  close() {
    this.#dialogRef.close(null)
  }
}
