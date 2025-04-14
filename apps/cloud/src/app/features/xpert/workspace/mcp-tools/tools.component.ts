import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { CapitalizePipe, DynamicGridDirective } from '@metad/core'
import { injectConfirmUnique, NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { CardCreateComponent } from 'apps/cloud/src/app/@shared/card'
import { ToolsetCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { isNil, omitBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  getErrorMessage,
  IXpertMCPTemplate,
  IXpertToolset,
  OrderTypeEnum,
  routeAnimations,
  TMCPServer,
  ToastrService,
  XpertTemplateService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertToolMCPCreateComponent } from '../../tools/mcp/create/create.component'
import { injectQueryParams } from 'ngxtension/inject-query-params'

const InlineTemplateCount = 8

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,

    CapitalizePipe,
    DynamicGridDirective,
    NgmCommonModule,
    CardCreateComponent,
    ToolsetCardComponent
  ],
  selector: 'xpert-workspace-mcp-tools',
  templateUrl: './tools.component.html',
  styleUrl: 'tools.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceMCPToolsComponent {
  DisplayBehaviour = DisplayBehaviour
  eXpertTypeEnum = XpertTypeEnum

  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly dialog = inject(Dialog)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly toolsetService = inject(XpertToolsetService)
  readonly templateService = inject(XpertTemplateService)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly i18n = new NgmI18nPipe()
  readonly queryCategory = injectQueryParams('category')
  readonly confirmUnique = injectConfirmUnique()

  // Inputs
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly type = this.homeComponent.type
  readonly tags = this.homeComponent.tags
  readonly builtinTags = this.homeComponent.toolTags
  readonly searchText = this.homeComponent.searchText

  readonly refresh$ = new BehaviorSubject<void>(null)

  readonly #toolsets = derivedAsync(() => {
    const where = {
      category: XpertToolsetCategoryEnum.MCP
    }
    const workspaceId = this.workspace()?.id
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

  readonly toolsets = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    const tags = this.tags()
    return this.#toolsets()
      ?.filter((toolset) => (tags?.length ? tags.some((t) => toolset.tags.some((tt) => tt.name === t.name)) : true))
      .filter((toolset) =>
        searchText
          ? toolset.name.toLowerCase().includes(searchText) || toolset.description?.toLowerCase().includes(searchText)
          : true
      )
  })

  readonly #templates = derivedAsync(() => {
    const params = this.inline() ? {take: InlineTemplateCount} : null
    return this.templateService.getAllMCP(params)
  })

  readonly categories = computed(() => this.#templates()?.categories)
  readonly #catTemplates = computed(() => {
    const templates = this.#templates()?.templates ?? []
    return this.queryCategory() ? templates.filter((_) => _.category === this.queryCategory()) : templates
  })
  readonly templates = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    const templates = this.#catTemplates()
    return templates.filter((_) => searchText
      ? _.name.toLowerCase().includes(searchText) || _.title?.toLowerCase().includes(searchText) || _.description?.toLowerCase().includes(searchText)
      : true)
  })
  
  readonly loading = signal(false)
  
  constructor() {
    //
  }

  refresh() {
    this.refresh$.next()
  }

  createTool(template?: IXpertMCPTemplate) {
    let toolset: Partial<IXpertToolset> = null
    let mcpServer: TMCPServer = null
    if (template) {
      toolset = {
        name: template.name,
        description: template.description,
        category: XpertToolsetCategoryEnum.MCP,
        type: template.server.type,
      }
      if (template.icon) {
        toolset.avatar = {
          url: template.icon
        }
      }
      mcpServer = template.server
    }
    this.dialog
      .open(XpertToolMCPCreateComponent, {
        disableClose: true,
        panelClass: 'large',
        data: {
          workspace: this.workspace(),
          toolset,
          mcpServer
        }
      })
      .closed.subscribe({
        next: (toolset) => {
          if (toolset) {
            this.refresh()
          }
        }
      })
  }

  install(template: IXpertMCPTemplate) {
    this.loading.set(true)
    this.templateService.getMCPTemplate(template.id).subscribe({
      next: (temp) => {
        this.loading.set(false)
        this.createTool(temp)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  navigateTo(toolset: IXpertToolset) {
    if (toolset.category === XpertToolsetCategoryEnum.MCP) {
      this.router.navigate(['/xpert/tool', toolset.id])
    }
  }

}
