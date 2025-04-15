import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, HostListener, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import {
  getErrorMessage,
  IfAnimation,
  injectToastr,
  IXpertTool,
  IXpertToolset,
  TagCategoryEnum,
  TMCPSchema,
  TMCPServer,
  TToolParameter,
  XpertToolsetService
} from '@cloud/app/@core'
import { attrModel, linkedModel } from '@metad/core'
import { injectConfirmUnique, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { isEqual, omit } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, of, tap } from 'rxjs'
import { EmojiAvatarComponent } from '../../avatar'
import { XpertToolNameInputComponent } from '../../xpert'
import { MCPServerFormComponent } from '../server/server.component'
import { MCPToolsetToolTestComponent } from '../tool-test'
import { TagSelectComponent } from '../../tag'

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
    NgmI18nPipe,
    TagSelectComponent,
    MCPServerFormComponent,
    MCPToolsetToolTestComponent,
    XpertToolNameInputComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
  animations: [IfAnimation]
})
export class XpertMCPManageComponent {
  eTagCategoryEnum = TagCategoryEnum
  
  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ workspaceId: string; toolsetId: string; toolset: Partial<IXpertToolset> }>(DIALOG_DATA)
  readonly toolsetService = inject(XpertToolsetService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly confirmName = injectConfirmUnique()

  readonly workspaceId = signal(this.#data.workspaceId)
  readonly toolsetId = signal(this.#data.toolsetId)
  readonly loading = signal(false)
  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly #toolset = derivedAsync<Partial<IXpertToolset>>(() =>
    this.toolsetId() ? this.toolsetService.getOneById(this.toolsetId(), { relations: ['tools'] }) : of(null)
  )

  readonly toolset = linkedModel({
    initialValue: null,
    compute: () => this.#toolset() ?? this.#data.toolset,
    update: (value) => {}
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
    compute: () => this.toolset()?.tools,
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
  readonly canSave = computed(() => this.tools()?.length)

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
    this.loading.set(true);
    (this.toolset().id ? this.saveToolset() : this.createToolset().pipe(
      tap((toolset) => this.toolset.update((state) => ({...state, id: toolset.id})))
    )).subscribe({
      next: () => {
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully!' })
        this.loading.set(false)
        this.toolsDirty.set(false)
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  createToolset() {
    return this.toolsetService.create({...this.toolset(), workspaceId: this.workspaceId()})
  }

  saveToolset() {
    let value: Partial<IXpertToolset> = this.toolset()
    if (this.toolsDirty()) {
      value.tools = this.toolset().tools.filter((_) => !_.deletedAt)
    } else {
      value = omit(value, 'tools')
    }

    return this.toolsetService.update(this.toolset().id, value)
  }

  close() {
    this.#dialogRef.close()
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscKeydownHandler(event: KeyboardEvent) {
    event.preventDefault()
    this.close()
  }
}
