import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IEnvironment, TStateVariable, VariableOperationEnum } from '../../../../../@core/types'
import { isNil } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertVariableFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { injectHelpWebsite } from 'apps/cloud/src/app/@core'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { toSignal } from '@angular/core/rxjs-interop'
import { XpertEnvironmentManageComponent } from '@cloud/app/@shared/environment'

@Component({
  selector: 'xpert-studio-panel-environments',
  templateUrl: './environments.component.html',
  styleUrls: ['./environments.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    CdkMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    A11yModule,
    XpertVariableFormComponent
  ]
})
export class XpertStudioPanelEnvironmentsComponent {
  eVariableOperationEnum = VariableOperationEnum
  
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly #dialog = inject(Dialog)
  readonly helpUrl = injectHelpWebsite()

  readonly xpert = this.xpertStudioComponent.xpert
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly stateVariables = computed(() => this.agentConfig()?.stateVariables)
  readonly variables = computed<Array<{ variable: TStateVariable; __hover__?: boolean }>>(() =>
    this.stateVariables()?.map((item) => ({ variable: item }))
  )

  // States
  readonly workspaceId = this.studioService.workspaceId
  readonly environments = toSignal(this.studioService.environments$)
  readonly environment = signal<IEnvironment>(null)

  constructor() {
    effect(() => {
      if (this.environment() == null && this.environments()?.length) {
        this.environment.set(this.environments().find((_) => _.isDefault) ?? this.environments()[0])
      }
    }, { allowSignalWrites: true })
  }

  selectEnv(env: IEnvironment) {
    this.environment.set(env)
  }

  closePanel() {
    this.panelComponent.sidePanel.set(null)
  }

  openManageEnvs() {
    this.#dialog.open(XpertEnvironmentManageComponent, {
      backdropClass: 'backdrop-blur-md-white',
      data: {
        workspaceId: this.workspaceId()
      }
    }).closed.subscribe({
      next: () => {
        console.log(`=====`)
      }
    })
  }

  addVar(value: Partial<TStateVariable>, index?: number) {
    const stateVariables = this.stateVariables() ?? []
    if (isNil(index)) {
      stateVariables.push({ ...value } as TStateVariable)
    } else {
      stateVariables[index] = { ...value } as TStateVariable
    }

    this.studioService.updateXpertAgentConfig({ stateVariables: [...stateVariables] })
  }

  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      const stateVariables = this.stateVariables() ?? []
      moveItemInArray(stateVariables, event.previousIndex, event.currentIndex)
      this.studioService.updateXpertAgentConfig({ stateVariables: [...stateVariables] })
    }
  }
}
