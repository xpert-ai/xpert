import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { routeAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IXpertTool,
  IXpertToolset,
  IXpertWorkspace,
  MCPServerType,
  TMCPServer,
  ToastrService,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { isNil, omitBy } from 'lodash-es'
import { XpertStudioConfigureMCPComponent } from '../configure/configure.component'
import { MCPServerFormComponent } from 'apps/cloud/src/app/@shared/mcp'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    CdkListboxModule,
    MCPServerFormComponent,
    XpertStudioConfigureMCPComponent
  ],
  selector: 'xpert-tool-mcp-create',
  templateUrl: './create.component.html',
  styleUrl: 'create.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertToolMCPCreateComponent {
  private readonly xpertToolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ workspace: IXpertWorkspace;}>(DIALOG_DATA)

  readonly workspace = signal(this.#data.workspace)

  readonly loading = signal(false)

  readonly toolset = model<IXpertToolset>()
  readonly mcpServer = model<TMCPServer>({type: MCPServerType.SSE})
  readonly tools = model<IXpertTool[]>()
  readonly steps = model<number[]>([0])

  constructor() {
    effect(() => {
      // console.log(this.mcpServer())
    })
  }

  createTool() {
    this.xpertToolsetService
      .create({
        ...omitBy(this.toolset(), isNil),
        schema: JSON.stringify({mcpServers: {'': this.mcpServer()}}),
        tools: this.tools(),
        workspaceId: this.workspace()?.id
      })
      .subscribe({
        next: (result) => {
          this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully!' }, result.name)
          this.#dialogRef.close(result)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancel() {
    this.#dialogRef.close()
  }

}
