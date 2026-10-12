import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IXpertToolset,
  IXpertWorkspace,
  ToastrService,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { isNil, omitBy } from 'lodash-es'
import { XpertConfigureToolComponent } from '../api-tool/types'
import { XpertStudioConfigureODataComponent } from '../odata/'
import { XpertStudioConfigureToolComponent } from '../openapi/'

@Component({
  standalone: true,
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    CdkListboxModule,
    XpertStudioConfigureToolComponent,
    XpertStudioConfigureODataComponent
  ],
  selector: 'xp-xpert-tool-create',
  templateUrl: './create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStudioCreateToolComponent {
  private readonly xpertToolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ workspace: IXpertWorkspace; type: 'openapi' | 'odata' }>(DIALOG_DATA)

  readonly configure = viewChild('configure', { read: XpertConfigureToolComponent })

  readonly workspace = signal(this.#data.workspace)

  readonly loading = signal(false)

  readonly providerTypes = model<('openapi' | 'odata')[]>([this.#data.type || 'openapi'])

  readonly toolset = model<IXpertToolset>()

  onValueChange(event: any) {
    this.toolset.set(event)
  }

  createTool() {
    if (this.loading() || !this.configure()?.isValid()) return
    this.loading.set(true)
    this.xpertToolsetService
      .create({
        ...omitBy(this.toolset(), isNil),
        workspaceId: this.workspace()?.id
      })
      .subscribe({
        next: (result) => {
          this.loading.set(false)
          this.#toastr.success('XP.Messages.CreatedSuccessfully', { Default: 'Created Successfully!' }, result.name)
          this.#dialogRef.close(result)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancel() {
    this.#dialogRef.close()
  }
}
