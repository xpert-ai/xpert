import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool } from 'apps/cloud/src/app/@core'
import { XpertToolAuthorizationInputComponent } from '../../authorization'
import { XpertToolsetToolTestComponent } from '../test/tool.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DialogModule,
    DragDropModule,
    MatButtonModule,

    NgmI18nPipe,

    XpertToolsetToolTestComponent,
    XpertToolAuthorizationInputComponent
  ],
  selector: 'xpert-tool-test',
  templateUrl: './tool.component.html',
  styleUrl: 'tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpertToolTestDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ tool: IXpertTool; enableAuthorization: boolean; }>(DIALOG_DATA)

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
