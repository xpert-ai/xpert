import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  IXpertToolset,
  TVariableAssigner,
  TXpertTeamNode,
  XpertService,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { omit, uniq } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, map, of } from 'rxjs'
import { injectConfigureBuiltin, XpertToolTestComponent } from '../../../tools'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertVariablesAssignerComponent } from 'apps/cloud/src/app/@shared/xpert'

@Component({
  selector: 'xpert-studio-panel-toolset',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    MatSlideToggleModule,
    MatTooltipModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    XpertToolTestComponent,
    NgmDensityDirective,
    NgmSpinComponent,
    XpertVariablesAssignerComponent
  ]
})
export class XpertStudioPanelToolsetComponent {
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly toolsetService = inject(XpertToolsetService)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly configureBuiltin = injectConfigureBuiltin()

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly toolsetId = computed(() => this.node()?.key)
  readonly toolset = computed(() => this.node()?.entity as IXpertToolset)
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly positions = computed(() => this.toolset()?.options?.toolPositions)

  readonly toolsetDetail = derivedAsync(() => {
    return this.toolsetId() ? this.studioService.getToolset(this.toolsetId()).pipe(
      catchError((err) => of(null))
    ) : of(null)
  })

  // Not initialized, needs to be reconfigured
  readonly isTemplate = computed(() => this.toolsetId() && !this.toolsetDetail())
  readonly providerName = computed(() => this.toolset().type)
  readonly toolsets = derivedAsync(() => {
    if (this.providerName() && this.isTemplate()) {
      return this.toolsetService.getBuiltinToolInstances(this.workspaceId(), this.providerName()).pipe(
        map(({ items }) => items)
      )
    }
    return null
  })

  readonly tools = computed(() => {
    const positions = this.positions()
    const tools = this.toolsetDetail()?.tools?.filter((_) => _.enabled)
    return positions && tools ? tools.sort((a, b) => (positions[a.name] ?? Infinity) - (positions[b.name] ?? Infinity))
      : tools
  })

  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId ? this.xpertService.getVariables(xpertId).pipe(
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of([])
      })
    ) : of(null)
  })

  readonly loading = signal(false)

  refresh() {
    this.loading.set(true)
    this.toolsetService.getOneById(this.toolsetId(), {relations: ['tools']}).subscribe({
      next: (toolset) => {
        this.loading.set(false)
        this.studioService.updateToolset(this.node().key, toolset)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  getSensitive(name: string) {
    return this.agentConfig()?.interruptBefore?.includes(name)
  }

  updateSensitive(name: string, value: boolean) {
    const interruptBefore = value
      ? uniq([...(this.agentConfig()?.interruptBefore ?? []), name])
      : (this.agentConfig()?.interruptBefore?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({
      interruptBefore
    })
  }

  isEnd(name: string) {
    return this.agentConfig()?.endNodes?.includes(name)
  }

  updateEnd(name: string, value: boolean) {
    const endNodes = value
      ? uniq([...(this.agentConfig()?.endNodes ?? []), name])
      : (this.agentConfig()?.endNodes?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({ endNodes })
  }

  toolMemory(name: string) {
    return this.agentConfig()?.toolsMemory?.[name]
  }

  toggleToolMemory(name: string, value: boolean) {
    this.xpertStudioComponent.updateXpertAgentConfig({ toolsMemory: {
      ...(this.agentConfig()?.toolsMemory ?? {}),
      [name]: value ? [] : null
    } })
  }

  updateToolMemory(name: string, value: TVariableAssigner[]) {
    this.xpertStudioComponent.updateXpertAgentConfig({ toolsMemory: {
      ...(this.agentConfig()?.toolsMemory ?? {}),
      [name]: value
    } })
  }

  configureToolBuiltin() {
    const providerName = this.toolset().type
    this.configureBuiltin(providerName, this.xpert().workspaceId, 
      omit(this.toolset(), 'id', 'tools'),
      this.toolset().tools?.map((tool) => omit(tool, 'id', 'toolsetId'))
    )
      .subscribe((toolset) => {
        if (toolset) {
          this.useToolset(toolset)
        }
      })
  }

  /**
   * Use the toolset to replace toolset template
   * 
   * @param toolset 
   */
  useToolset(toolset: IXpertToolset) {
    this.loading.set(true)
    // Get the toolset details (with tools)
    this.toolsetService.getOneById(toolset.id, {relations: ['tools']}).subscribe({
      next: (toolset) => {
        this.loading.set(false)
        this.studioService.replaceToolset(this.toolset().id, toolset)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  closePanel() {
    this.panelComponent.close()
  }
}
