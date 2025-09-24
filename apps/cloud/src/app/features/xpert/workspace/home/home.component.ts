import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { XpertEnvironmentManageComponent } from '@cloud/app/@shared/environment'
import { injectWorkspace, Store } from '@metad/cloud/state'
import { injectConfirmUnique, NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { debouncedSignal } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TagFilterComponent } from 'apps/cloud/src/app/@shared/tag'
import { concat } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject } from 'rxjs'
import { debounceTime, map, startWith, tap } from 'rxjs/operators'
import {
  getErrorMessage,
  injectTags,
  injectUser,
  ITag,
  IXpertWorkspace,
  OrderTypeEnum,
  routeAnimations,
  TagCategoryEnum,
  ToastrService,
  XpertAPIService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum,
  XpertWorkspaceService
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertWorkspaceSettingsComponent } from '../settings/settings.component'
import { XpertWorkspaceWelcomeComponent } from '../welcome/welcome.component'


export type XpertFilterEnum = XpertToolsetCategoryEnum | XpertTypeEnum

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
    OverlayModule,
    TranslateModule,
    MatTooltipModule,

    NgmCommonModule,
    TagFilterComponent,
    XpertWorkspaceWelcomeComponent
  ],
  selector: 'pac-xpert-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceHomeComponent {
  DisplayBehaviour = DisplayBehaviour
  XpertRoleTypeEnum = XpertTypeEnum
  XpertToolsetCategory = XpertToolsetCategoryEnum

  readonly store = inject(Store)
  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(Dialog)
  // readonly #dialog = inject(MatDialog)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertService = inject(XpertAPIService)
  readonly toolsetService = inject(XpertToolsetService)
  // Xpert's tags
  readonly xpertTags = injectTags(TagCategoryEnum.XPERT)
  readonly me = injectUser()
  readonly confirmUnique = injectConfirmUnique()
  readonly paramId = injectParams('id')
  readonly selectedWorkspace = injectWorkspace()

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly loading = signal(true)
  readonly workspaces = toSignal(
    this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(
      map(({ items }) => items),
      tap(() => this.loading.set(false))
    ),
    { initialValue: null }
  )
  readonly workspace = computed(() => this.workspaces()?.find((_) => _.id === this.selectedWorkspace()?.id), {
    equal: (a, b) => a?.id === b?.id
  })

  readonly refresh$ = new BehaviorSubject<void>(null)

  // Xpert or tool type filter
  readonly types = model<Array<XpertTypeEnum | XpertToolsetCategoryEnum | 'knowledgebase'>>(null)
  readonly type = computed(() => this.types()?.[0])

  // TagFilter's state
  readonly tags = model<ITag[]>([])

  // Builtin tool's tags
  readonly toolTags = toSignal(
    this.toolsetService.getAllTags().pipe(
      map((toolTags) =>
        toolTags.map(
          (_) =>
            ({
              ..._,
              id: `toolset/${_.name}`,
              category: 'toolset'
            }) as unknown as ITag
        )
      )
    )
  )

  readonly isAll = computed(() => !this.type())
  readonly isXperts = computed(
    () => !this.type() || Object.values(XpertTypeEnum).includes(this.type() as XpertTypeEnum)
  )
  readonly isTools = computed(() => this.type() === XpertToolsetCategoryEnum.API)
  readonly isBuiltinTools = computed(() => this.type() === XpertToolsetCategoryEnum.BUILTIN)

  readonly allTags = computed(() => {
    if (this.isAll()) {
      return concat(this.xpertTags(), this.toolTags())
    } else if (this.isXperts()) {
      return this.xpertTags()
    } else if (this.isBuiltinTools()) {
      return this.toolTags()
    } else if (this.isTools()) {
      return this.toolTags()
    }
    return []
  })

  readonly searchControl = new FormControl()
  readonly searchText = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300), startWith('')))

  // Search for workspaces
  readonly searchWorkspace = model<string>('')
  readonly #debouncedSearchWs = debouncedSignal(this.searchWorkspace, 300)
  readonly filteredWorkspaces = computed(() => {
    const searchText = this.#debouncedSearchWs().toLowerCase()
    return this.workspaces()?.filter((ws) => ws.name.toLowerCase().includes(searchText))
  })

  readonly inDevelopmentOpen = signal(false)

  constructor() {
    effect(
      () => {
        if (this.selectedWorkspace()) {
          if (this.router.url === '/xpert/w/' || this.router.url === '/xpert/w') {
            this.router.navigate(['/xpert/w/', this.selectedWorkspace().id])
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.tags()?.[0]) {
        this.searchControl.setValue(this.tags()[0].name)
      }
    })
  }

  selectWorkspace(ws: IXpertWorkspace) {
    this.router.navigate(['/xpert/w/', ws.id])
    this.store.setWorkspace(ws)
  }

  newWorkspace() {
    this.confirmUnique(
      {
        title: this.#translate.instant('PAC.Xpert.NewWorkspace', { Default: 'New Workspace' })
      },
      (name: string) => {
        this.loading.set(true)
        return this.workspaceService.create({ name })
      }
    ).subscribe({
      next: (workspace) => {
        this.loading.set(false)
        this.workspaceService.refresh()
        this.selectWorkspace(workspace)
        // this.selectedWorkspaces.set([workspace.id])
        this.#toastr.success(`PAC.Messages.CreatedSuccessfully`, { Default: 'Created Successfully!' })
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  refresh() {
    this.refresh$.next()
  }

  openSettings() {
    this.#dialog
      .open(XpertWorkspaceSettingsComponent, {
        // backdropClass: 'backdrop-blur-md-white',
        data: {
          id: this.selectedWorkspace()?.id
        }
      })
      .closed.subscribe((event) => {
        if (event === 'deleted' || event === 'archived') {
          this.workspaceService.refresh()
          this.router.navigate(['/xpert/w'])
        }
      })
  }

  openEnvs() {
    this.#dialog
      .open(XpertEnvironmentManageComponent, {
        backdropClass: 'backdrop-blur-md-white',
        data: {
          workspaceId: this.selectedWorkspace()?.id
        }
      })
      .closed.subscribe({
        next: () => {
          //
        }
      })
  }
}
