import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import {
  getEnabledTools,
  getErrorMessage,
  injectToastr,
  IXpertToolset,
  TVariableAssigner,
  TXpertTeamNode,
  XpertService,
  XpertToolsetCategoryEnum,
  XpertToolsetService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { XpertVariablesAssignerComponent } from '@cloud/app/@shared/xpert'
import { CloseSvgComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { omit, uniq } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, map, of } from 'rxjs'
import { injectConfigureBuiltin, XpertToolConfigureBuiltinComponent, XpertToolTestComponent } from '../../../tools'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'

@Component({
  selector: 'xpert-studio-panel-toolset',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatSlideToggleModule,
    MatTooltipModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    XpertToolTestComponent,
    NgmDensityDirective,
    NgmSpinComponent,
    NgmI18nPipe,
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
  readonly router = inject(Router)
  readonly dialog = inject(Dialog)
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

  // Refresh toolset details
  readonly toolsetDetail = derivedAsync(() => {
    return this.toolsetId()
      ? this.studioService.getToolset(this.toolsetId()).toolset$.pipe(
          catchError((err) => of(null))
        )
      : of(null)
  })

  readonly needSandbox = computed(() => this.toolsetDetail()?.options?.needSandbox)

  // Not initialized, needs to be reconfigured
  readonly isTemplate = computed(() => this.toolsetId() && !this.toolsetDetail())
  readonly providerName = computed(() => this.toolset().type)
  readonly toolsets = derivedAsync(() => {
    if (this.providerName() && this.isTemplate()) {
      return this.toolsetService
        .getBuiltinToolInstances(this.workspaceId(), this.providerName())
        .pipe(map(({ items }) => items))
    }
    return null
  })

  readonly tools = computed(() => getEnabledTools(this.toolsetDetail()))

  readonly expandTools = signal<Record<string, boolean>>({})

  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId
      ? this.studioService.getVariables({xpertId, type: 'output'}).pipe(
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of([])
          })
        )
      : of(null)
  })

  readonly loading = signal(false)

  constructor() {
    effect(() => {
      // console.log(this.toolsetDetail())
    })
  }

  refresh() {
    this.loading.set(true)
    this.studioService.refreshToolset(this.toolsetId())
    this.toolsetService.getOneById(this.toolsetId(), { }).subscribe({
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
    this.xpertStudioComponent.updateXpertAgentConfig({
      toolsMemory: {
        ...(this.agentConfig()?.toolsMemory ?? {}),
        [name]: value ? [] : null
      }
    })
  }

  updateToolMemory(name: string, value: TVariableAssigner[]) {
    this.xpertStudioComponent.updateXpertAgentConfig({
      toolsMemory: {
        ...(this.agentConfig()?.toolsMemory ?? {}),
        [name]: value
      }
    })
  }

  configureToolBuiltin() {
    const providerName = this.toolset().type
    this.configureBuiltin(
      providerName,
      this.xpert().workspaceId,
      omit(this.toolset(), 'id', 'tools'),
      this.toolset().tools?.map((tool) => omit(tool, 'id', 'toolsetId'))
    ).subscribe((toolset) => {
      if (toolset && toolset.id) {
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
    this.toolsetService.getOneById(toolset.id, { }).subscribe({
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

  toggleExpand(name: string) {
    this.expandTools.update((state) => ({ ...state, [name]: !state[name] }))
  }

  closePanel() {
    this.panelComponent.close()
  }

  edit() {
    const toolset = this.toolsetDetail()
    if (toolset.category === XpertToolsetCategoryEnum.API) {
      this.router.navigate(['/xpert/tool', toolset.id])
    } else if (toolset.category === XpertToolsetCategoryEnum.MCP) {
      this.dialog
        .open(XpertMCPManageComponent, {
          backdropClass: 'backdrop-blur-lg-white',
          disableClose: true,
          data: {
            workspaceId: this.workspaceId(),
            toolsetId: toolset.id
          }
        })
        .closed.subscribe({
          next: (saved) => {
            if (saved) {
              this.refresh()
            }
          }
        })
      // this.router.navigate(['/xpert/tool', toolset.id])
    } else {
      this.dialog
        .open(XpertToolConfigureBuiltinComponent, {
          disableClose: true,
          data: {
            toolset,
            providerName: toolset.type,
            workspaceId: this.workspaceId()
          }
        })
        .closed.subscribe((result) => {
          if (result) {
            this.refresh()
          }
        })
    }
  }
}
