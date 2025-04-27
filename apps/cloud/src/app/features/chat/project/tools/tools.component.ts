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
import { MCPMarketplaceComponent, XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { ToolsetCardComponent } from '@cloud/app/@shared/xpert'
import {
  DisappearFadeOut,
  DynamicGridDirective,
  listAnimation,
  listEnterAnimation,
  ListSlideStaggerAnimation
} from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil, omitBy } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, map, startWith, switchMap } from 'rxjs'
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
  readonly toolsets = this.#projectHomeComponent.toolsets

  readonly formControl = new FormControl()
  readonly searchText = toSignal(this.formControl.valueChanges.pipe(startWith(this.formControl.value)))
  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly loading = signal(false)

  readonly #toolsets = derivedAsync(() => {
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
      map(({ items }) => items)
    )
  })

  readonly wsToolsets = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    return this.#toolsets()
      ?.filter((toolset) =>
        searchText
          ? toolset.name.toLowerCase().includes(searchText) || toolset.description?.toLowerCase().includes(searchText)
          : true
      )
      .map((toolset) => ({
        toolset,
        added: this.toolsets()?.some((_) => _.id === toolset.id)
      }))
  })

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
            this.#projectHomeComponent.refreshTools()
          }
        }
      })
  }
}
