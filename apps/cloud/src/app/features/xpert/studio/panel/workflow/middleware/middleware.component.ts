import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { XpertVariablesAssignerComponent } from '@cloud/app/@shared/xpert'
import { XpertToolTestComponent } from '@cloud/app/features/xpert/tools'
import { attrModel, linkedModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isEqual, uniq } from 'lodash-es'
import {
  injectXpertAgentAPI,
  isMiddlewareToolEnabled,
  IXpertTool,
  IWFNMiddleware,
  TVariableAssigner
} from 'apps/cloud/src/app/@core'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-middleware',
  templateUrl: './middleware.component.html',
  styleUrls: ['./middleware.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmI18nPipe,
    IconComponent,
    JSONSchemaFormComponent,
    XpertToolTestComponent,
    XpertVariablesAssignerComponent
  ]
})
export class XpertWorkflowMiddlewareComponent extends XpertWorkflowBaseComponent {
  readonly agentAPI = injectXpertAgentAPI()
  readonly agentConfig = this.studioService.agentConfig

  // Models
  readonly entity = linkedModel({
    initialValue: null,
    compute: () => this.node()?.entity as IWFNMiddleware,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), () => value)
    }
  })

  readonly provider = attrModel(this.entity, 'provider')
  readonly options = attrModel(this.entity, 'options')
  readonly tools = attrModel(this.entity, 'tools')
  readonly _tools = attrModel(this.agentConfig, 'tools')

  readonly agentMiddlewares = toSignal(this.agentAPI.agentMiddlewares$)
  readonly expandTools = signal<Record<string, boolean>>({})

  readonly providerMeta = computed(() => this.agentMiddlewares()?.find((m) => m.meta.name === this.provider())?.meta)
  readonly configSchema = computed(() => this.providerMeta()?.configSchema)
  readonly #middlewareToolsRes = myRxResource({
    options: {
      debounceTime: 500,
      equal: isEqual
    },
    request: () => ({
      provider: this.provider(),
      options: this.options() ?? {}
    }),
    loader: ({ request }) => {
      return request.provider ? this.agentAPI.getAgentMiddlewareTools(request.provider, request.options) : null
    }
  })
  readonly middlewareTools = computed(() => this.#middlewareToolsRes.value() ?? [])
  readonly middlewareToolItems = computed(() =>
    this.middlewareTools().map((tool) => ({
      ...tool,
      description: this.getToolDescription(tool.name, tool.description),
      xpertTool: {
        name: tool.name,
        description: this.getToolDescription(tool.name, tool.description),
        enabled: this.isToolEnabled(tool.name),
        schema: tool.schema
      } as IXpertTool
    }))
  )
  readonly loadingTools = computed(() => this.#middlewareToolsRes.status() === 'loading')
  readonly toolError = this.#middlewareToolsRes.error

  isToolEnabled(toolName: string) {
    return isMiddlewareToolEnabled(this.tools()?.[toolName])
  }

  setToolEnabled(toolName: string, enabled: boolean) {
    const config = this.tools()?.[toolName]
    this.tools.set({
      ...(this.tools() ?? {}),
      [toolName]: {
        ...(typeof config === 'object' ? config : {}),
        enabled
      }
    })
  }

  toggleExpand(name: string) {
    this.expandTools.update((state) => ({ ...state, [name]: !state[name] }))
  }

  getSensitive(name: string) {
    return this.agentConfig()?.interruptBefore?.includes(name)
  }

  updateSensitive(name: string, value: boolean) {
    const interruptBefore = value
      ? uniq([...(this.agentConfig()?.interruptBefore ?? []), name])
      : (this.agentConfig()?.interruptBefore?.filter((_) => _ !== name) ?? [])
    this.studioService.updateXpertAgentConfig({
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
    this.studioService.updateXpertAgentConfig({
      endNodes
    })
  }

  toolMemory(name: string) {
    return this._tools()?.[name]?.memories
  }

  toggleToolMemory(name: string, value: boolean) {
    this._tools.update((state) => {
      return {
        ...(state ?? {}),
        [name]: {
          ...(state?.[name] ?? {}),
          memories: value ? [] : null
        }
      }
    })
  }

  updateToolMemory(name: string, value: TVariableAssigner[]) {
    const state = this._tools()
    this.studioService.updateXpertAgentConfig({
      tools: {
        ...(state ?? {}),
        [name]: {
          ...(state?.[name] ?? {}),
          memories: value
        }
      }
    })
  }

  getToolDescription(name: string, description?: string) {
    return this._tools()?.[name]?.description || description
  }

  updateToolDescription(name: string, description: string) {
    this._tools.update((state) => {
      return {
        ...(state ?? {}),
        [name]: {
          ...(state?.[name] ?? {}),
          description
        }
      }
    })
  }

  middlewareToolTester(name: string) {
    return ({ parameters }: { tool: IXpertTool; parameters: Record<string, any> }) =>
      this.agentAPI.testAgentMiddlewareTool(this.provider(), name, this.options(), parameters)
  }

  getToolParameters(name: string) {
    return this._tools()?.[name]?.parameters
  }

  saveDefaultParameters(toolName: string, event: Record<string, any>) {
    this._tools.update((state) => {
      return {
        ...(state ?? {}),
        [toolName]: {
          ...(state?.[toolName] ?? {}),
          parameters: event
        }
      }
    })
  }
}
