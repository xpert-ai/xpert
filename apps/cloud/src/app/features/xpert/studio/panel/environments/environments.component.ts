import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpertEnvironmentManageComponent, XpertEnvVariableFormComponent } from '@cloud/app/@shared/environment'
import { AsteriskPipe } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { isNil } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { EnvironmentService, injectHelpWebsite } from 'apps/cloud/src/app/@core'
import { IEnvironment, TEnvironmentVariable, VariableOperationEnum } from '../../../../../@core/types'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'

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
    MatTooltipModule,
    A11yModule,
    NgmSpinComponent,
    AsteriskPipe,
    XpertEnvVariableFormComponent
  ]
})
export class XpertStudioPanelEnvironmentsComponent {
  eVariableOperationEnum = VariableOperationEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly environmentService = inject(EnvironmentService)
  readonly #dialog = inject(Dialog)
  readonly helpUrl = injectHelpWebsite()

  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)

  // States
  readonly workspaceId = this.studioService.workspaceId
  readonly environments = this.studioService.environments
  readonly environmentId = this.studioService.environmentId
  readonly environment = this.studioService.environment

  readonly variables = computed(() => {
    return this.environment()?.variables?.filter((_) => !_.owner || _.owner === this.xpertId())
  })

  readonly hoverDelete = signal<number>(null)

  readonly loading = signal(false)

  constructor() {
    //
  }

  selectEnv(env: IEnvironment) {
    this.environmentId.set(env.id)
  }

  closePanel() {
    this.panelComponent.sidePanel.set(null)
  }

  openManageEnvs() {
    this.#dialog
      .open(XpertEnvironmentManageComponent, {
        backdropClass: 'backdrop-blur-md-white',
        data: {
          workspaceId: this.workspaceId()
        }
      })
      .closed.subscribe({
        next: () => {
        }
      })
  }

  addVar(value: TEnvironmentVariable, index?: number) {
    this.environment.update((state) => {
      const variables = state.variables ?? []
      if (isNil(index)) {
        variables.push(value)
      } else {
        variables[index] = value
      }
      return {
        ...state,
        variables: [...variables]
      }
    })
  }

  removeVar(index: number) {
    this.environment.update((state) => {
      const variables = state.variables
      variables.splice(index, 1)
      return {
        ...state,
        variables: [...variables]
      }
    })
    this.hoverDelete.set(null)
  }

  drop(event: CdkDragDrop<string[]>) {
    if (event.previousContainer === event.container) {
      this.environment.update((state) => {
        const variables = [...state.variables]
        moveItemInArray(variables, event.previousIndex, event.currentIndex)
        return { ...state, variables }
      })
    }
  }
}
