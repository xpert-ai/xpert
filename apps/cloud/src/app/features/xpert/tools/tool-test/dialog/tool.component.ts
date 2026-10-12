import { XpDialogFrameImports, XpI18nPipe, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool } from 'apps/cloud/src/app/@core'
import { XpertToolAuthorizationInputComponent } from '../../authorization'
import { XpertToolsetToolTestComponent } from '../test/tool.component'

@Component({
  standalone: true,
  imports: [
    ...XpDialogFrameImports,
    FormsModule,
    TranslateModule,
    DialogModule,
    DragDropModule,
    ZardButtonComponent,
    XpI18nPipe,
    XpertToolsetToolTestComponent,
    XpertToolAuthorizationInputComponent
  ],
  selector: 'xpert-tool-test-dialog',
  templateUrl: './tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertToolTestDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ tool: IXpertTool; enableAuthorization: boolean }>(DIALOG_DATA)

  readonly credentials = model(this.#data.tool.toolset.credentials)
  readonly enableAuthorization = model(this.#data.enableAuthorization)

  readonly tool = computed(() => ({
    ...this.#data.tool,
    toolset: {
      ...this.#data.tool.toolset,
      credentials: this.credentials(),
      tools: null
    }
  }))

  cancel() {
    this.#dialogRef.close()
  }
}
