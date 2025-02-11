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
import { ToolProviderCardComponent, ToolsetCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { isNil, omitBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  IToolProvider,
  IXpertToolset,
  OrderTypeEnum,
  routeAnimations,
  ToastrService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertToolConfigureBuiltinComponent } from '../../tools'
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
    ToolsetCardComponent,
    ToolProviderCardComponent
  ],
  selector: 'xpert-workspace-builtin-tools',
  templateUrl: './tools.component.html',
  styleUrl: 'tools.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceBuiltinToolsComponent {
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

  readonly #builtinToolProviders = derivedAsync(() => this.toolsetService.getProviders())

  readonly builtinToolProviders = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    return this.#builtinToolProviders()
      ?.filter((provider) => {
        if (this.tags()?.length) {
          return this.tags().some((tag) => provider.tags?.some((_) => _ === tag.name))
        }
        return true
      })
      .filter((provider) =>
        searchText
          ? provider.name.toLowerCase().includes(searchText) ||
            this.i18n.transform(provider.description)?.toLowerCase().includes(searchText)
          : true
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

  readonly builtinToolsets = computed(() =>
    this.toolsets()?.filter((_) => _.category === XpertToolsetCategoryEnum.BUILTIN)
  )

  constructor() {
    //
  }

  refresh() {
    this.refresh$.next()
  }

  configureToolBuiltin(provider: IToolProvider) {
    this.dialog
      .open(XpertToolConfigureBuiltinComponent, {
        disableClose: true,
        data: {
          providerName: provider.name,
          workspaceId: this.workspace().id
        }
      })
      .closed.subscribe((result) => {
        if (result) {
          this.refresh()
        }
      })
  }

  navigateTo(toolset: IXpertToolset) {
    if (toolset.category === XpertToolsetCategoryEnum.API) {
      this.router.navigate(['/xpert/tool', toolset.id])
    } else {
      this.toolsetService
        .getOneById(toolset.id, { relations: ['tools'] })
        .pipe(
          switchMap(
            (toolset) =>
              this.dialog.open(XpertToolConfigureBuiltinComponent, {
                disableClose: true,
                data: {
                  toolset,
                  providerName: toolset.type,
                  workspaceId: this.workspace().id
                }
              }).closed
          )
        )
        .subscribe((result) => {
          if (result) {
            this.refresh()
          }
        })
    }
  }
}
