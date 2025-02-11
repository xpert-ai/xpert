import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DynamicGridDirective } from '@metad/core'
import { injectConfirmUnique, NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { CardCreateComponent } from 'apps/cloud/src/app/@shared/card'
import { ToolsetCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { isNil, omitBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  IXpertToolset,
  OrderTypeEnum,
  routeAnimations,
  ToastrService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertStudioCreateToolComponent } from '../../tools/create/create.component'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

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

    DynamicGridDirective,
    NgmCommonModule,
    CardCreateComponent,
    ToolsetCardComponent
  ],
  selector: 'xpert-workspace-api-tools',
  templateUrl: './tools.component.html',
  styleUrl: 'tools.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceApiToolsComponent {
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
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly i18n = new NgmI18nPipe()
  readonly confirmUnique = injectConfirmUnique()

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly workspace = this.homeComponent.workspace
  readonly type = this.homeComponent.type
  readonly tags = this.homeComponent.tags
  readonly builtinTags = this.homeComponent.toolTags
  readonly searchText = this.homeComponent.searchText

  readonly refresh$ = new BehaviorSubject<void>(null)

  readonly #toolsets = derivedAsync(() => {
    const where = {
      category: this.type()
      // type: 'openapi'
    }
    const workspaceId = this.workspace().id
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

  readonly apiToolsets = computed(() => this.toolsets()?.filter((_) => _.category === XpertToolsetCategoryEnum.API))

  constructor() {
    //
  }

  refresh() {
    this.refresh$.next()
  }

  createTool() {
    this.dialog
      .open(XpertStudioCreateToolComponent, {
        disableClose: true,
        data: {
          workspace: this.workspace()
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

  navigateTo(toolset: IXpertToolset) {
    if (toolset.category === XpertToolsetCategoryEnum.API) {
      this.router.navigate(['/xpert/tool', toolset.id])
    }
  }
}
