import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DynamicGridDirective, uploadYamlFile } from '@metad/core'
import { CdkConfirmDeleteComponent, CdkConfirmUniqueComponent, NgmCommonModule } from '@metad/ocap-angular/common'
import { AppearanceDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { isNil, omitBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  getErrorMessage,
  IToolProvider,
  IXpertRole,
  IXpertToolset,
  OrderTypeEnum,
  routeAnimations,
  ToastrService,
  XpertDraftDslDTO,
  XpertService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum,
  XpertWorkspaceService
} from '../../../../@core'
import {
  CardCreateComponent,
  MaterialModule,
  ToolProviderCardComponent,
  ToolsetCardComponent,
  XpertCardComponent
} from '../../../../@shared'
import { AppService } from '../../../../app.service'
import { XpertToolConfigureBuiltinComponent } from '../../tools'
import { XpertStudioCreateToolComponent } from '../../tools/create/create.component'
import { XpertNewBlankComponent } from '../../xpert/index'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkListboxModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MaterialModule,

    DynamicGridDirective,
    NgmCommonModule,
    AppearanceDirective,
    CardCreateComponent,
    ToolsetCardComponent,
    ToolProviderCardComponent,
    XpertCardComponent
  ],
  selector: 'pac-xpert-xperts',
  templateUrl: './xperts.component.html',
  styleUrl: 'xperts.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStudioXpertsComponent {
  DisplayBehaviour = DisplayBehaviour
  eXpertTypeEnum = XpertTypeEnum

  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(MatDialog)
  readonly dialog = inject(Dialog)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertService = inject(XpertService)
  readonly toolsetService = inject(XpertToolsetService)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly i18n = new NgmI18nPipe()
  readonly workspaceId = injectParams('id')

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly selectedWorkspaces = this.homeComponent.selectedWorkspaces
  readonly type = this.homeComponent.type
  readonly tags = this.homeComponent.tags
  readonly builtinTags = this.homeComponent.toolTags
  readonly searchText = this.homeComponent.searchText

  readonly refresh$ = new BehaviorSubject<void>(null)

  readonly workspace = derivedAsync(() => {
    return this.workspaceId() ? this.workspaceService.getOneById(this.workspaceId()) : null
  })
  readonly #xperts = derivedAsync(() => {
    const where = {
      type: this.type(),
      latest: true
    }
    const workspaceId = this.workspaceId()
    return this.refresh$.pipe(
      switchMap(() =>
        this.xpertService.getAllByWorkspace(workspaceId, {
          where: omitBy(where, isNil),
          order: { updatedAt: OrderTypeEnum.DESC },
          relations: ['createdBy', 'tags']
        })
      ),
      map(({ items }) => items.filter((item) => item.latest))
    )
  })

  readonly #toolsets = derivedAsync(() => {
    const where = {
      category: this.type()
      // type: 'openapi'
    }
    const workspaceId = this.workspaceId()
    return this.refresh$.pipe(
      switchMap(() =>
        this.toolsetService.getAllByWorkspace(workspaceId, {
          where: omitBy(where, isNil),
          relations: ['createdBy', 'tags']
        })
      ),
      map(({ items }) => items)
    )
  })

  readonly #builtinToolProviders = derivedAsync(() => this.toolsetService.getProviders())

  readonly builtinToolProviders = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    if (this.isAll() || this.isBuiltinTools()) {
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
    }
    return this.#builtinToolProviders()
  })

  readonly xperts = computed(() => {
    const searchText = this.searchText()?.toLowerCase()
    const tags = this.tags()
    return this.#xperts()
      ?.filter((item) => (tags?.length ? tags.some((t) => item.tags.some((tt) => tt.name === t.name)) : true))
      .filter((item) =>
        searchText
          ? item.title?.toLowerCase().includes(searchText) ||
            item.name.toLowerCase().includes(searchText) ||
            item.description?.toLowerCase().includes(searchText)
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

  readonly isAll = this.homeComponent.isAll
  readonly isXperts = this.homeComponent.isXperts
  readonly isTools = this.homeComponent.isTools
  readonly isBuiltinTools = this.homeComponent.isBuiltinTools

  readonly builtinToolsets = computed(() =>
    this.toolsets()?.filter((_) => _.category === XpertToolsetCategoryEnum.BUILTIN)
  )
  readonly apiToolsets = computed(() => this.toolsets()?.filter((_) => _.category === XpertToolsetCategoryEnum.API))

  constructor() {
    effect(
      () => {
        if (this.workspaceId()) {
          this.homeComponent.selectedWorkspaces.set([this.workspaceId()])
        }
      },
      { allowSignalWrites: true }
    )
  }

  refresh() {
    this.refresh$.next()
  }

  newBlank() {
    this.#dialog
      .open(XpertNewBlankComponent, {
        disableClose: true,
        data: {
          workspace: this.workspace()
        }
      })
      .afterClosed()
      .subscribe((xpert) => {
        if (xpert) {
          this.router.navigate(['/xpert/', xpert.id])
        }
      })
  }

  deleteXpert(xpert: IXpertRole) {
    this.dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: xpert.title,
          information: this.#translate.instant('PAC.Xpert.DeleteAllDataXpert', {
            value: xpert.name,
            Default: `Delete all data of xpert '${xpert.name}'?`
          })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.xpertService.delete(xpert.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, xpert.title)
          this.refresh()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  createTool() {
    this.#dialog
      .open(XpertStudioCreateToolComponent, {
        disableClose: true,
        data: {
          workspace: this.workspace()
        }
      })
      .afterClosed()
      .subscribe({
        next: (toolset) => {
          if (toolset) {
            this.refresh()
          }
        }
      })
  }

  configureToolBuiltin(provider: IToolProvider) {
    this.#dialog
      .open(XpertToolConfigureBuiltinComponent, {
        disableClose: true,
        data: {
          providerName: provider.name,
          workspace: this.workspace()
        }
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.refresh()
        }
      })
  }

  navigateTo(toolset: IXpertToolset) {
    if (toolset.category === XpertToolsetCategoryEnum.API) {
      this.router.navigate(['/xpert/tool', toolset.id],)
    } else {
      this.toolsetService
        .getOneById(toolset.id, { relations: ['tools'] })
        .pipe(
          switchMap((toolset) =>
            this.#dialog
              .open(XpertToolConfigureBuiltinComponent, {
                disableClose: true,
                data: {
                  toolset,
                  providerName: toolset.type,
                  workspace: this.workspace()
                }
              })
              .afterClosed()
          )
        )
        .subscribe((result) => {
          if (result) {
            this.refresh()
          }
        })
    }
  }

  importDSL() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml, .yml'

    input.onchange = (event: any) => {
      const file = event.target.files[0]
      if (file) {
        uploadYamlFile(file).then((parsedDSL) => {
          // Assuming there's a method to handle the parsed DSL
          this.handleImportedDSL(parsedDSL)
        }).catch((error) => {
          this.#toastr.error(
            this.#translate.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
              ': ' +
              getErrorMessage(error)
          )
        })
      }
    }

    input.click()
  }

  handleImportedDSL(dsl: Partial<XpertDraftDslDTO>) {
    this.dialog
      .open(CdkConfirmUniqueComponent, {
        data: {
          value: dsl.team.name,
          title: this.#translate.instant('PAC.Xpert.ChangeXpertName', { Default: 'Change the name of xpert' }) 
        }
      })
      .closed.pipe(
        switchMap((name) => {
          return name
            ? this.xpertService.importDSL({
                ...dsl,
                team: {
                  ...dsl.team,
                  name,
                  workspaceId: this.workspaceId()
                }
              })
            : EMPTY
        })
      )
      .subscribe({
        next: (value) => {
          this.refresh()
          this.#toastr.success(
            this.#translate.instant('PAC.Xpert.ImportSuccess', { Default: 'DSL file imported successfully' })
          )
        },
        error: (err) => {
          this.#toastr.error(
            this.#translate.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
              ': ' +
              getErrorMessage(err)
          )
        }
      })
  }
}
