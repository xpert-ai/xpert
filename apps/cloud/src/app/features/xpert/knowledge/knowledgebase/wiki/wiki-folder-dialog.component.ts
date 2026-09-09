import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type { KnowledgeWikiFolder, KnowledgeWikiFolderInput } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectComponent,
  ZardSelectItemComponent
} from '@xpert-ai/headless-ui'

export type WikiFolderDialogData = {
  folders: KnowledgeWikiFolder[]
  folder?: KnowledgeWikiFolder
  move?: boolean
  folderId?: string | null
}
export type WikiFolderDialogResult = { action: 'save'; input: KnowledgeWikiFolderInput } | { action: 'delete' }
@Component({
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ...ZardFormImports
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex w-lg max-w-full flex-col gap-5 p-6">
      <h2 class="text-lg font-semibold">
        {{
          (data.move
            ? 'XP.Knowledgebase.Wiki.Organization.MovePage'
            : 'XP.Knowledgebase.Wiki.Organization.ManageFolder'
          ) | translate
        }}
      </h2>
      @if (!data.move) {
        <z-form-field
          ><label z-form-label for="wiki-folder-name">{{ 'XP.Knowledgebase.Wiki.Organization.Name' | translate }}</label
          ><input z-input id="wiki-folder-name" formControlName="name" maxlength="120" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <p class="text-sm text-text-destructive">
              {{ 'XP.Knowledgebase.Wiki.Organization.NameRequired' | translate }}
            </p>
          }
        </z-form-field>
        <z-form-field
          ><label z-form-label for="wiki-folder-description">{{
            'XP.Knowledgebase.Wiki.Organization.Description' | translate
          }}</label
          ><textarea
            z-input
            id="wiki-folder-description"
            formControlName="description"
            maxlength="1000"
            rows="3"
          ></textarea>
        </z-form-field>
      }
      <z-form-field
        ><label z-form-label>{{ 'XP.Knowledgebase.Wiki.Organization.Parent' | translate }}</label>
        <z-select formControlName="parentId">
          <z-select-item zValue="root">{{
            (data.move ? 'XP.Knowledgebase.Wiki.Organization.Unclassified' : 'XP.Knowledgebase.Wiki.Organization.Root')
              | translate
          }}</z-select-item>
          @for (folder of folderOptions; track folder.id) {
            <z-select-item [zValue]="folder.id">{{ folder.label }}</z-select-item>
          }
        </z-select>
      </z-form-field>
      @if (data.move) {
        <p class="text-sm text-text-tertiary">{{ 'XP.Knowledgebase.Wiki.Organization.ManualHint' | translate }}</p>
      }
      <footer class="flex items-center justify-end gap-2">
        @if (data.folder && !data.move) {
          <button
            z-button
            zType="ghost"
            class="mr-auto text-text-destructive"
            type="button"
            (click)="ref.close({ action: 'delete' })"
          >
            {{ 'XP.ACTIONS.Delete' | translate }}
          </button>
        }
        <button z-button zType="outline" type="button" (click)="ref.close()">
          {{ 'XP.ACTIONS.Cancel' | translate }}
        </button>
        <button z-button type="submit" [disabled]="!data.move && form.invalid">
          {{ 'XP.ACTIONS.Save' | translate }}
        </button>
      </footer>
    </form>
  `
})
export class WikiFolderDialogComponent {
  readonly data = inject<WikiFolderDialogData>(DIALOG_DATA)
  readonly ref = inject(DialogRef<WikiFolderDialogResult>)
  readonly folderOptions = this.data.folders.flatMap((folder) => {
    const path: string[] = [],
      visited = new Set<string>()
    let current: KnowledgeWikiFolder | undefined = folder
    while (current && !visited.has(current.id)) {
      if (!this.data.move && current.id === this.data.folder?.id) return []
      visited.add(current.id)
      path.unshift(current.name)
      current = this.data.folders.find((item) => item.id === current.parentId)
    }
    return [{ id: folder.id, label: path.join(' / ') }]
  })
  readonly form = inject(NonNullableFormBuilder).group({
    name: [this.data.folder?.name ?? '', [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)]],
    description: [this.data.folder?.description ?? '', Validators.maxLength(1000)],
    parentId: [this.data.move ? (this.data.folderId ?? 'root') : (this.data.folder?.parentId ?? 'root')]
  })
  save() {
    if (!this.data.move && this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    const value = this.form.getRawValue()
    this.ref.close({
      action: 'save',
      input: {
        name: value.name.trim(),
        description: value.description,
        parentId: value.parentId === 'root' ? null : value.parentId,
        position: this.data.folder?.position ?? 0
      }
    })
  }
}
