import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { CapitalizePipe, DynamicGridDirective } from '@metad/core'
import { injectConfirmUnique, NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import {
  getErrorMessage,
  IXpertMCPTemplate,
  IXpertToolset,
  IXpertWorkspace,
  routeAnimations,
  TMCPServer,
  ToastrService,
  XpertTemplateService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { AppService } from '@cloud/app/app.service'
import { TXpertMCPManageComponentRet, XpertMCPManageComponent } from '../manage/manage.component'

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
  ],
  selector: 'mcp-marketplace',
  templateUrl: './marketplace.component.html',
  styleUrl: 'marketplace.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MCPMarketplaceComponent {
  DisplayBehaviour = DisplayBehaviour
  eXpertTypeEnum = XpertTypeEnum

  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(Dialog)
  readonly #toastr = inject(ToastrService)
  readonly toolsetService = inject(XpertToolsetService)
  readonly templateService = inject(XpertTemplateService)
  readonly i18n = new NgmI18nPipe()
  readonly queryCategory = injectQueryParams('category')
  readonly confirmUnique = injectConfirmUnique()

  // Inputs
  readonly inline = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly workspace = input<IXpertWorkspace>()
  readonly searchText = input<string>()

  // Outputs
  readonly refresh = output<void>()

  // States
  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang
  readonly workspaceId = computed(() => this.workspace()?.id)

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
      ? _.name.toLowerCase().includes(searchText)
        || _.title?.toLowerCase().includes(searchText)
        || _.description?.toLowerCase().includes(searchText)
        || _.tags?.some((tag) => tag.toLowerCase().includes(searchText))
      : true)
  })
  
  readonly loading = signal(false)
  
  toggleCategory(category: string) {
    // Add the category query parameter to the URL
    const urlTree = this.router.createUrlTree([], {
      queryParams: { category: category && category !== this.queryCategory() ? category : null },
      queryParamsHandling: 'merge',
      preserveFragment: true
    });
    this.router.navigateByUrl(urlTree);
  }

  onRefresh() {
    this.refresh.emit()
  }

  createTool(template?: IXpertMCPTemplate) {
    let toolset: Partial<IXpertToolset> = null
    let mcpServer: TMCPServer = null
    if (template) {
      mcpServer = template.server
      toolset = {
        name: template.name,
        description: template.description,
        category: XpertToolsetCategoryEnum.MCP,
        type: template.server.type,
        schema: JSON.stringify({mcpServers: {'': mcpServer}}),
        options: template.options
      }
      if (typeof template.icon === 'string') {
        toolset.avatar = {
          url: template.icon
        }
      }
    }
    this.#dialog
      .open<TXpertMCPManageComponentRet>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId(),
          toolset,
        }
      })
      .closed.subscribe({
        next: (ret) => {
          if (ret?.saved) {
            this.onRefresh()
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

}
