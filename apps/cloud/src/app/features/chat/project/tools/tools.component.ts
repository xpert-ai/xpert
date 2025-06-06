import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  getErrorMessage,
  injectProjectService,
  injectToastr,
  IXpertToolset,
  OrderTypeEnum,
  XpertToolsetService
} from '@cloud/app/@core'
import { MCPMarketplaceComponent, TXpertMCPManageComponentRet, XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { ToolsetCardComponent } from '@cloud/app/@shared/xpert'
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
    ToolsetCardComponent
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

  readonly project = this.#projectComponent.project

  readonly workspace = this.#projectHomeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  // Toolsets in project
  readonly toolsets = this.#projectHomeComponent.toolsets

  readonly formControl = new FormControl()
  readonly searchText = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
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
    const searchText = this.searchText()?.toLowerCase()
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

  openToolset(toolset: IXpertToolset) {
    this.#dialog
      .open<TXpertMCPManageComponentRet>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId(),
          toolsetId: toolset.id
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

  refreshWorkspace() {
    this.refresh$.next()
  }
}
