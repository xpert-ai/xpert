import { XpDialogFrameImports, XpI18nPipe, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool, IXpertToolset } from 'apps/cloud/src/app/@core'
import { MCPToolsetToolTestComponent } from '../test/tool.component'

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
    MCPToolsetToolTestComponent
  ],
  selector: 'mcp-tool-test',
  templateUrl: './tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MCPToolTestDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ tool: IXpertTool; enableAuthorization: boolean }>(DIALOG_DATA)

  readonly credentials = model(this.#data.tool.toolset?.credentials)

  readonly tool = computed(() => ({
    ...this.#data.tool,
    toolset: {
      ...(this.#data.tool.toolset ?? {}),
      credentials: this.credentials(),
      tools: null
    } as IXpertToolset
  }))

  cancel() {
    this.#dialogRef.close()
  }
}
