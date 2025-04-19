import { Dialog } from '@angular/cdk/dialog'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool, IXpertToolset } from '@cloud/app/@core/types'
import { XpertToolNameInputComponent } from '@cloud/app/@shared/xpert'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { MCPToolTestDialogComponent } from '../tool-test'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    MatSlideToggleModule,
    MatTooltipModule,
    NgmDensityDirective,
    XpertToolNameInputComponent
  ],
  selector: 'mcp-config-tools',
  templateUrl: 'tools.component.html',
  styleUrls: ['tools.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class MCPToolsComponent {
  protected cva = inject<NgxControlValueAccessor<IXpertTool[]>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly toolset = input<Partial<IXpertToolset>>()
  readonly disableToolDefault = input<boolean>()

  // States
  readonly tools = this.cva.value$

  constructor() {
    effect(() => {
      // console.log(this.tools())
    })
  }

  updateTool(index: number, name: string, value: unknown) {
    this.tools.update((tools) => {
      tools[index] = {
        ...tools[index],
        [name]: value
      }
      return [...tools]
    })
  }

  openToolTest(tool: Partial<IXpertTool>) {
    this.#dialog
      .open(MCPToolTestDialogComponent, {
        panelClass: 'medium',
        data: {
          tool: {
            ...tool,
            toolset: this.toolset()
          }
        }
      })
      .closed.subscribe({
        next: (result) => {}
      })
  }

  remove(tool: IXpertTool) {
    this.tools.update((tools) => {
      return tools.filter((_) => _.name !== tool.name)
    })
  }

  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      this.tools.update((tools) => {
        moveItemInArray(tools, event.previousIndex, event.currentIndex)
        return [...tools]
      })
    }
  }
}
