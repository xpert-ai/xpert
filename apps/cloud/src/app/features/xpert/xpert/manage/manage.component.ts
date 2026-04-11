import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, inject, signal, ViewContainerRef } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { uploadYamlFile } from '@xpert-ai/core'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { pick } from '@xpert-ai/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  getErrorMessage,
  IfAnimation,
  injectToastr,
  IXpert,
  LongTermMemoryTypeEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertBasicDialogComponent, XpertExportDslComponent } from 'apps/cloud/src/app/@shared/xpert'
import { EMPTY, firstValueFrom } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { XpertAPIComponent } from '../api/api.component'
import { XpertAppComponent } from '../app/app.component'
import { XpertBasicComponent } from '../basic/basic.component'
import { XpertComponent } from '../xpert.component'
import { createOverwriteDraftFromDsl, groupImportedDslMemories, TImportedXpertDsl } from './import-dsl.util'

@Component({
  selector: 'xpert-basic-manage',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    DragDropModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    XpertAppComponent,
    XpertAPIComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
  animations: [IfAnimation]
})
export class XpertBasicManageComponent {
  readonly #dialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly xpertComponent = inject(XpertComponent)
  readonly #viewContainerRef = inject(ViewContainerRef)

  readonly xpert = this.xpertComponent.latestXpert

  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly xpertType = computed(() => this.xpert()?.type)

  readonly loading = signal(false)

  openBasic() {
    this.#dialog
      .open(XpertBasicComponent, {
        viewContainerRef: this.#viewContainerRef
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  delete() {
    const xpert = this.xpert()
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: xpert.title,
          information: this.#translate.instant('PAC.Xpert.DeleteAllDataXpert', {
            value: xpert.name,
            Default: `Delete all data of xpert '${xpert.name}'?`
          })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.#xpertService.delete(xpert.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, xpert.title)
          this.#router.navigate(['/xpert/w', xpert.workspaceId])
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  export(isDraft = false) {
    this.#dialog
      .open(XpertExportDslComponent, {
        data: {
          xpertId: this.xpert().id,
          slug: this.xpert().slug,
          isDraft
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  async importDsl() {
    const file = await this.selectDslFile()
    if (!file) {
      return
    }

    const xpert = this.xpert()
    if (!xpert) {
      return
    }

    let importedDsl: TImportedXpertDsl
    let overwriteDraft: ReturnType<typeof createOverwriteDraftFromDsl>
    let groupedMemories: ReturnType<typeof groupImportedDslMemories>

    try {
      importedDsl = await uploadYamlFile<TImportedXpertDsl>(file)
      overwriteDraft = createOverwriteDraftFromDsl(xpert, importedDsl)
      groupedMemories = groupImportedDslMemories(importedDsl.memories)
    } catch (error) {
      this.#toastr.error(
        this.#translate.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
          ': ' +
          this.translateImportError(error)
      )
      return
    }

    const confirm = await firstValueFrom(
      this.#toastr.confirm({
        code: 'PAC.Xpert.ImportOverwriteConfirm',
        params: {
          name: xpert.title || xpert.name,
          Default:
            'Importing this DSL will overwrite the current draft of this xpert. The published version will remain unchanged.\n\nIf the file contains memories, current memories will be cleared and replaced.'
        }
      })
    )
    if (!confirm) {
      return
    }

    this.loading.set(true)
    let draftSaved = false

    try {
      await firstValueFrom(this.#xpertService.saveDraft(xpert.id, overwriteDraft))
      draftSaved = true

      if (groupedMemories) {
        await firstValueFrom(this.#xpertService.clearMemory(xpert.id))
        for (const [type, memories] of Object.entries(groupedMemories)) {
          if (!memories?.length) {
            continue
          }

          await firstValueFrom(
            this.#xpertService.bulkCreateMemories(xpert.id, {
              type: type as LongTermMemoryTypeEnum,
              memories
            })
          )
        }
      }

      this.xpertComponent.xpertService.refresh()
      this.#toastr.success('PAC.Xpert.ImportOverwriteSuccess', {
        Default: 'DSL imported into the current draft. Publish is still required for it to take effect.'
      })
    } catch (error) {
      if (draftSaved && groupedMemories) {
        this.xpertComponent.xpertService.refresh()
        this.#toastr.warning(
          this.#translate.instant('PAC.Xpert.ImportMemoryIncomplete', {
            Default: 'The draft was imported, but memory replacement did not finish.'
          }) +
            ': ' +
            getErrorMessage(error)
        )
      } else {
        this.#toastr.error(
          this.#translate.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
            ': ' +
            getErrorMessage(error)
        )
      }
    } finally {
      this.loading.set(false)
    }
  }

  duplicate() {
    const xpert = this.xpertComponent.xpert()
    this.#dialog
      .open<Partial<IXpert>>(XpertBasicDialogComponent, {
        data: {
          name: xpert.name,
          avatar: xpert.avatar,
          title: xpert.title,
          description: xpert.description,
          copilotModel: xpert.copilotModel
        }
      })
      .closed.pipe(
        switchMap((basic) => {
          if (basic) {
            this.loading.set(true)
            return this.#xpertService.duplicate(this.xpert().id, {
              basic: {
                ...basic,
                copilotModel: pick(basic.copilotModel, 'copilotId', 'model', 'modelType', 'options', 'referencedId'),
                workspaceId: this.xpert().workspaceId
              },
              isDraft: true
            })
          }
          return EMPTY
        })
      )
      .subscribe({
        next: (xpert) => {
          this.loading.set(false)
          this.#router.navigate(['/xpert/x/', xpert.id])
          this.#toastr.success(
            this.#translate.instant('PAC.Xpert.DuplicateSuccess', { Default: 'Duplicate successfully' })
          )
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(
            this.#translate.instant('PAC.Xpert.DuplicateError', { Default: 'Failed to duplicate xpert' }) +
              ': ' +
              getErrorMessage(err)
          )
        }
      })
  }

  private async selectDslFile(): Promise<File | null> {
    return new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.yaml,.yml'
      input.onchange = (event: Event) => {
        const file = (event.target as HTMLInputElement)?.files?.[0] ?? null
        resolve(file)
      }

      input.click()
    })
  }

  private translateImportError(error: unknown) {
    const message = getErrorMessage(error)
    switch (message) {
      case 'Primary agent not found in DSL':
        return this.#translate.instant('PAC.Xpert.ImportPrimaryAgentMissing', {
          Default: 'Primary agent not found in the DSL file'
        })
      case 'DSL type does not match the current xpert':
        return this.#translate.instant('PAC.Xpert.ImportTypeMismatch', {
          Default: 'DSL type does not match the current xpert'
        })
      case 'Current xpert primary agent not found':
        return this.#translate.instant('PAC.Xpert.ImportCurrentPrimaryAgentMissing', {
          Default: 'Current xpert primary agent not found'
        })
      default:
        return message
    }
  }
}
