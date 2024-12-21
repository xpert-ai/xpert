import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TStateVariable } from '@metad/contracts'
import { CdkConfirmDeleteComponent } from '@metad/ocap-angular/common'
import { isNil } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'

@Component({
  selector: 'xpert-studio-panel-variables',
  templateUrl: './variables.component.html',
  styleUrls: ['./variables.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    A11yModule,
    NgmSelectComponent,
    MatInputModule
  ]
})
export class XpertStudioPanelVariablesComponent {
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly apiService = inject(XpertStudioApiService)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly #fb = inject(FormBuilder)
  readonly #dialog = inject(Dialog)

  readonly xpert = this.xpertStudioComponent.xpert
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly stateVariables = computed(() => this.agentConfig()?.stateVariables)
  readonly variables = computed<Array<{ variable: TStateVariable; __hover__?: boolean }>>(() =>
    this.stateVariables()?.map((item) => ({ variable: item }))
  )

  readonly form = this.#fb.group<TStateVariable>({
    name: null,
    type: null,
    default: null,
    description: null
  })

  closePanel() {
    this.panelComponent.sidePanel.set(null)
  }

  editVar(variable: TStateVariable) {
    this.form.setValue({ ...variable })
  }

  addVar(index?: number) {
    const value = this.form.value as TStateVariable
    const stateVariables = this.stateVariables() ?? []
    if (isNil(index)) {
      stateVariables.push({ ...value })
    } else {
      stateVariables[index] = { ...value }
    }

    this.apiService.updateXpertAgentConfig({ stateVariables: [...stateVariables] })
    this.form.reset()
  }

  removeVar(index: number) {
    const variable = this.stateVariables()[index]
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: variable.name
        }
      })
      .closed.subscribe({
        next: (confirm) => {
          if (confirm) {
            const stateVariables = this.stateVariables() ?? []
            stateVariables.splice(index, 1)
            this.apiService.updateXpertAgentConfig({
              stateVariables: [...stateVariables]
            })
            this.form.reset()
          }
        }
      })
  }
}