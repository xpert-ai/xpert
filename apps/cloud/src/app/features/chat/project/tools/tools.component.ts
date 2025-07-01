import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  getErrorMessage,
  injectProjectService,
  injectToastr,
  IToolProvider,
  IXpertToolset,
  OrderTypeEnum,
  XpertToolsetCategoryEnum,
  XpertToolsetService
} from '@cloud/app/@core'
import { MCPMarketplaceComponent, TXpertMCPManageComponentRet, XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { ToolsetCardComponent } from '@cloud/app/@shared/xpert'
import { XpertToolConfigureBuiltinComponent } from '@cloud/app/features/xpert/tools'
import {
  DisappearFadeOut,
  DynamicGridDirective,
  listAnimation,
  listEnterAnimation,
  ListSlideStaggerAnimation
} from '@metad/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { isNil, omitBy } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, startWith, switchMap } from 'rxjs'
import { ChatProjectHomeComponent } from '../home/home.component'
import { ChatProjectComponent } from '../project.component'
import { CardCreateComponent } from '@cloud/app/@shared/card'
import { debouncedSignal, NgmI18nPipe } from '@metad/ocap-angular/core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    ContentLoaderModule,
    DynamicGridDirective,
    MCPMarketplaceComponent,
    ToolsetCardComponent,
    CardCreateComponent,
    NgmI18nPipe,
    EmojiAvatarComponent,
    NgmHighlightDirective
  ],
  selector: 'chat-project-tools',
  templateUrl: './tools.component.html',
  styleUrl: 'tools.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [DisappearFadeOut, listAnimation, ListSlideStaggerAnimation, listEnterAnimation]
})
export class ChatProjectToolsComponent {
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly projectSercice = injectProjectService()
  readonly toolsetService = inject(XpertToolsetService)
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #projectHomeComponent = inject(ChatProjectHomeComponent)
  readonly #toastr = injectToastr()
  readonly i18n = new NgmI18nPipe()

  readonly project = this.#projectComponent.project

  readonly workspace = this.#projectHomeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  // Toolsets in project
  readonly toolsets = this.#projectHomeComponent.toolsets

  // readonly formControl = new FormControl()
  // readonly searchText = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly loading = signal(false)

  // Toolsets in workspace
  readonly #toolsets = derivedAsync<{ loading?: boolean; items?: IXpertToolset[] }>(() => {
    const where = {
      // category: XpertToolsetCategoryEnum.MCP
    }
    const workspaceId = this.workspaceId()
    if (!workspaceId) return EMPTY
    return this.refresh$.pipe(
      switchMap(() =>
        this.toolsetService.getAllByWorkspace(workspaceId, {
          where: omitBy(where, isNil),
          relations: ['createdBy', 'tags'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      ),
      startWith({ loading: true })
    )
  })
  readonly wsToolLoading = computed(() => this.#toolsets()?.loading)

  // Searched toolsets in workspace
  readonly wsToolsets = computed(() => {
    const searchText = null // this.searchText()?.toLowerCase()
    return this.#toolsets()
      ?.items?.filter((toolset) =>
        searchText
          ? toolset.name.toLowerCase().includes(searchText) || toolset.description?.toLowerCase().includes(searchText)
          : true
      )
      .map((toolset) => ({
        toolset,
        added: this.toolsets()?.some((_) => _.id === toolset.id)
      }))
  })

  readonly search = model<string>('')
  readonly searchText = debouncedSignal(this.search, 300)
  readonly #builtinToolProviders = toSignal(this.toolsetService.builtinToolProviders$)
  readonly builtinToolProviders = computed(() => {
    const search = this.searchText()?.trim().toLowerCase()
    return this.#builtinToolProviders()?.filter(
      (provider) =>
        provider.name.toLowerCase().includes(search) ||
        this.i18n.transform(provider.description)?.toLowerCase().includes(search)
    )
  })


  /**
   * Add toolset from workspace into project
   */
  addTool(toolset: IXpertToolset) {
    this.loading.set(true)
    this.projectSercice.addToolset(this.project().id, toolset.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.toolsets.update((state) => [toolset, ...(state ?? []).filter((_) => _.id !== toolset.id)])
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  /**
   * Remove toolset from project
   */
  removeTool(toolset: IXpertToolset) {
    this.loading.set(true)
    this.projectSercice.removeToolset(this.project().id, toolset.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.toolsets.update((state) => (state ?? []).filter((_) => _.id !== toolset.id))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  configureMCP(toolset: IXpertToolset = null) {
    this.#dialog
      .open<TXpertMCPManageComponentRet>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId(),
          toolsetId: toolset?.id
        }
      })
      .closed.subscribe({
        next: (ret) => {
          if (ret?.deleted) {
            // If deleted from workspace
            this.removeTool(toolset)
            this.refreshWorkspace()
          } else if (ret?.saved) {
            this.refreshWorkspace()
            this.#projectHomeComponent.refreshTools()
          }
        }
      })
  }

  createBuiltinToolset(provider: IToolProvider) {
    this.#dialog
      .open(XpertToolConfigureBuiltinComponent, {
        disableClose: true,
        data: {
          providerName: provider.name,
          workspaceId: this.workspace().id,
        }
      })
      .closed.subscribe((result) => {
        if (result) {
          this.refreshWorkspace()
        }
      })
  }

  configureBuiltin(toolset: IXpertToolset = null) {
    this.#dialog
      .open(XpertToolConfigureBuiltinComponent, {
        disableClose: true,
        data: {
          providerName: toolset.type,
          workspaceId: this.workspace().id,
          toolset,
        }
      })
      .closed.subscribe((result) => {
        if (result) {
          this.refreshWorkspace()
        }
      })
  }

  openToolset(toolset: IXpertToolset) {
    switch (toolset.category) {
      case XpertToolsetCategoryEnum.BUILTIN:
        this.configureBuiltin(toolset)
        break
      case XpertToolsetCategoryEnum.MCP:
        this.configureMCP(toolset)
        break
    }
  }

  refreshWorkspace() {
    this.refresh$.next()
  }
}
