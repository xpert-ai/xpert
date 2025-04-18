import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, HostListener, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import {
  EnvironmentService,
  getErrorMessage,
  IEnvironment,
  injectToastr,
  IXpertTool,
  IXpertToolset,
  TagCategoryEnum,
  TMCPSchema,
  TMCPServer,
  TToolParameter,
  XpertToolsetCategoryEnum,
  XpertToolsetService
} from '@cloud/app/@core'
import { attrModel, linkedModel, ListSlideStaggerAnimation } from '@metad/core'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { injectConfirmDelete, injectConfirmUnique, NgmSlideToggleComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { isEqual, omit } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, of, startWith, tap } from 'rxjs'
import { EmojiAvatarComponent } from '../../avatar'
import { TagSelectComponent } from '../../tag'
import { XpertToolNameInputComponent } from '../../xpert'
import { MCPServerFormComponent } from '../server/server.component'
import { MCPToolsetToolTestComponent } from '../tool-test'

@Component({
  selector: 'xpert-mcp-manage',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    DragDropModule,
    MatTooltipModule,
    MatSlideToggleModule,

    EmojiAvatarComponent,
    NgmSpinComponent,
    NgmSlideToggleComponent,
    NgmDensityDirective,
    TagSelectComponent,
    MCPServerFormComponent,
    MCPToolsetToolTestComponent,
    XpertToolNameInputComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
  animations: [ListSlideStaggerAnimation]
})
export class XpertMCPManageComponent {
  eTagCategoryEnum = TagCategoryEnum

  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ workspaceId: string; toolsetId: string; toolset: Partial<IXpertToolset> }>(DIALOG_DATA)
  readonly toolsetService = inject(XpertToolsetService)
  readonly environmentService = inject(EnvironmentService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly confirmName = injectConfirmUnique()
  readonly confirmDelete = injectConfirmDelete()

  readonly workspaceId = signal(this.#data.workspaceId)
  readonly toolsetId = signal(this.#data.toolsetId)
  readonly #loading = signal(false)

  readonly #toolset = derivedAsync<{toolset: IXpertToolset; loading: boolean;}>(() =>
    this.toolsetId() ? this.toolsetService.getOneById(this.toolsetId(), { relations: ['tools'] }).pipe(
      map((toolset) => {
        const positions = toolset.options?.toolPositions
        toolset.tools = positions && toolset.tools
          ? toolset.tools.sort((a, b) => (positions[a.name] ?? Infinity) - (positions[b.name] ?? Infinity))
          : toolset.tools
        return {toolset, loading: false}
      }),
      startWith({toolset: null, loading: true})
    ) : of(null)
  )
  readonly environment = derivedAsync<IEnvironment>(() =>
    this.workspaceId() ? this.environmentService.getDefaultByWorkspace(this.workspaceId()) : of(null)
  )

  readonly loading = computed(() => this.#loading() || this.#toolset()?.loading)
  readonly dirty = signal(false)

  readonly toolset = linkedModel({
    initialValue: null,
    compute: () => this.#toolset()?.toolset ?? this.#data.toolset,
    update: (value) => {
      this.dirty.set(true)
    }
  })

  readonly avatar = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.avatar,
    update: (avatar) => {
      this.toolset.update((state) => ({ ...(state ?? {}), avatar }))
    }
  })
  readonly name = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.name,
    update: (name) => {
      this.toolset.update((state) => ({ ...(state ?? {}), name }))
    }
  })
  readonly description = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.description,
    update: (description) => {
      this.toolset.update((state) => ({ ...(state ?? {}), description }))
    }
  })

  readonly tags = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.tags,
    update: (tags) => {
      this.toolset.update((state) => ({ ...(state ?? {}), tags }))
    }
  })

  readonly privacyPolicy = attrModel(this.toolset, 'privacyPolicy')
  readonly customDisclaimer = attrModel(this.toolset, 'customDisclaimer')

  readonly tools = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.tools?.filter((_) => !_.deletedAt),
    update: (tools) => {
      this.toolset.update((state) => ({ ...(state ?? {}), tools }))
    }
  })

  readonly disableToolDefault = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.options?.disableToolDefault,
    update: (disableToolDefault) => {
      this.toolset.update((state) => ({ ...(state ?? {}), options: { ...(state?.options ?? {}), disableToolDefault } }))
    }
  })

  readonly toolPositions = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.options?.toolPositions,
    update: (value) => {
      this.toolset.update((state) => ({ ...(state ?? {}), options: { ...(state?.options ?? {}), toolPositions: value } }))
    }
  })

  readonly mcpServer = computed(
    () => {
      if (!this.toolset()?.schema) {
        return null
      }
      const schema = JSON.parse(this.toolset().schema) as TMCPSchema

      return schema.mcpServers?.['']
    },
    { equal: isEqual }
  )

  readonly selectedTool = signal<string>(null)
  readonly toolsDirty = signal(false)

  readonly tool = linkedModel({
    initialValue: null,
    compute: () => this.toolset()?.tools?.find((_) => _.id === this.selectedTool()),
    update: (tool) => {
      this.toolset.update((state) => {
        const tools = [...(state.tools ?? [])]
        const index = tools.findIndex((_) => _.id === this.selectedTool())
        tools[index] = tool
        return { ...(state ?? {}), tools }
      })
    }
  })

  // Status
  readonly canSave = computed(() => this.name() && this.tools()?.length)
  readonly saved = signal(false)

  constructor() {
    // effect(() => {}, { allowSignalWrites: true })
  }

  selectTool(tool: IXpertTool) {
    this.selectedTool.set(tool?.id)
  }

  updateTool(value: Partial<IXpertTool>) {
    this.tool.update((state) => ({ ...state, ...value }))
    this.toolsDirty.set(true)
  }

  /**
   * Update parameter of tool
   *
   * @param name Name of parameter
   * @param parameter New value of parameter
   */
  updateParameter(name: string, parameter: Partial<TToolParameter>) {
    this.tool.update((tool) => {
      const parameters = tool.schema?.parameters ?? []
      const j = parameters.findIndex((_) => _.name === name)
      if (j > -1) {
        parameters[j] = {
          ...parameters[j],
          ...parameter
        }
      } else {
        parameters.push({
          name,
          ...parameter
        })
      }
      return {
        ...tool,
        schema: {
          ...(tool.schema ?? {}),
          parameters: [...parameters]
        }
      }
    })

    this.toolsDirty.set(true)
  }

  saveParametersAsDefault(parameters: Record<string, unknown>) {
    this.updateTool({ parameters })
  }

  updateMcpServer(event: TMCPServer) {
    this.toolset.update((toolset) => {
      return {
        ...toolset,
        schema: JSON.stringify({ mcpServers: { '': event } })
      }
    })
    this.toolsDirty.set(true)
  }

  /**
   * Sync update the latest tool list
   */
  onToolsChange(tools: IXpertTool[]) {
    this.tools.update((state) => {
      if (state?.length) {
        tools.forEach((tool) => {
          const index = state.findIndex((item) => item.name === tool.name)
          if (index > -1) {
            state[index] = {
              ...state[index],
              ...tool
            }
          } else {
            state.push(tool)
          }
        })

        state.forEach((tool) => {
          if (!tools.some((_) => _.name === tool.name)) {
            tool.deletedAt = new Date()
          }
        })
      } else {
        state = tools
      }

      return [...state]
    })
    this.toolsDirty.set(true)
  }

  upsertToolset() {
    this.#loading.set(true)
    ;(this.toolset().id
      ? this.saveToolset()
      : this.createToolset().pipe(tap((toolset) => this.toolset.update((state) => ({ ...state, id: toolset.id }))))
    ).subscribe({
      next: () => {
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully!' })
        this.#loading.set(false)
        this.dirty.set(false)
        this.toolsDirty.set(false)
        this.saved.set(true)
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.#loading.set(false)
      }
    })
  }

  createToolset() {
    return this.toolsetService.create({ 
      ...this.toolset(), 
      workspaceId: this.workspaceId(),
      category: XpertToolsetCategoryEnum.MCP,
      type: this.mcpServer()?.type,
    })
  }

  saveToolset() {
    let value: Partial<IXpertToolset> = this.toolset()
    if (this.toolsDirty()) {
      value.tools = this.toolset().tools.filter((_) => !_.deletedAt)
      const toolPositions = {}
      value.tools.forEach((_, index) => {
        toolPositions[_.name] = index
      })
      value.options = {
        ...(value.options ?? {}),
        toolPositions
      }
    } else {
      value = omit(value, 'tools')
    }

    return this.toolsetService.update(this.toolset().id, value)
  }

  deleteToolset() {
    const toolset = this.toolset()
    this.confirmDelete(
      {
        value: toolset.name,
        information: this.#translate.instant('PAC.Xpert.DeleteAllTools', { Default: 'Delete all tools of toolset' })
      },
      this.toolsetService.delete(toolset.id)
    ).subscribe({
      next: () => {
        this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, toolset.name)
        this.saved.set(true)
        this.close()
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  close() {
    this.#dialogRef.close(this.saved())
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscKeydownHandler(event: KeyboardEvent) {
    event.preventDefault()
    this.close()
  }
}
