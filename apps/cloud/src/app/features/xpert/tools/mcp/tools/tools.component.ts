import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool, IXpertToolset } from 'apps/cloud/src/app/@core/types'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { XpertToolTestDialogComponent } from '../../tool-test'
import { XpertToolNameInputComponent } from 'apps/cloud/src/app/@shared/xpert'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MatSlideToggleModule, NgmDensityDirective, XpertToolNameInputComponent],
  selector: 'xpert-tool-mcp-config-tools',
  templateUrl: 'tools.component.html',
  styleUrls: ['tools.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertMCPToolsComponent {
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
      .open(XpertToolTestDialogComponent, {
        panelClass: 'medium',
        data: {
          tool: {
            ...tool,
            toolset: this.toolset()
          },
          enableAuthorization: true
        }
      })
      .closed.subscribe({
        next: (result) => {}
      })
  }
}
