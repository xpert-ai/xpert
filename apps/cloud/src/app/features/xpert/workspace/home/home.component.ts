import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import {OverlayModule} from '@angular/cdk/overlay';
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
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import {
  injectConfirmUnique,
  NgmCommonModule,
} from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import {
  getErrorMessage,
  injectTags,
  injectUser,
  ITag,
  OrderTypeEnum,
  routeAnimations,
  TagCategoryEnum,
  ToastrService,
  XpertService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertTypeEnum,
  XpertWorkspaceService
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertWorkspaceSettingsComponent } from '../settings/settings.component';
import { concat } from 'lodash-es';
import { TagFilterComponent } from 'apps/cloud/src/app/@shared/tag';
import { MatTooltipModule } from '@angular/material/tooltip';

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
    RouterModule,
    TranslateModule,
    MatTooltipModule,

    NgmCommonModule,
    TagFilterComponent
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

  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(MatDialog)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertService = inject(XpertService)
  readonly toolsetService = inject(XpertToolsetService)
  // Xpert's tags
  readonly xpertTags = injectTags(TagCategoryEnum.XPERT)
  readonly me = injectUser()
  readonly confirmUnique = injectConfirmUnique();

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef })

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly loading = signal(true)
  readonly workspaces = toSignal(
    this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } })
      .pipe(
        map(({ items }) => items),
        tap(() => this.loading.set(false))
      ),
    {initialValue: null}
  )
  readonly selectedWorkspaces = model<string[]>([])
  readonly workspace = computed(() => this.workspaces()?.find((_) => _.id === this.selectedWorkspaces()[0]), {
    equal: (a, b) => a?.id === b?.id
  })

  readonly refresh$ = new BehaviorSubject<void>(null)

  // Xpert or tool type filter
  readonly types = model<XpertTypeEnum>(null)
  readonly type = computed(() => this.types()?.[0])

  // TagFilter's state
  readonly tags = model<ITag[]>([])

  // Builtin tool's tags
  readonly toolTags = toSignal(this.toolsetService.getAllTags().pipe(
    map((toolTags) => toolTags.map((_) => ({
      ..._,
      id: `toolset/${_.name}`,
      category: 'toolset',
    } as unknown as ITag)))
  ))

  readonly isAll = computed(() => !this.type())
  readonly isXperts = computed(() => !this.type() || Object.values(XpertTypeEnum).includes(this.type() as XpertTypeEnum))
  readonly isTools = computed(() => this.type() === XpertToolsetCategoryEnum.API )
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

  readonly inDevelopmentOpen = signal(false)

  constructor() {
    effect(() => {
      if (this.selectedWorkspaces()[0]) {
        this.router.navigate(['/xpert/w/', this.selectedWorkspaces()[0]])
      }
    }, { allowSignalWrites: true })
  }

  newWorkspace() {
    this.confirmUnique({
        title: this.#translate.instant('PAC.Xpert.NewWorkspace', {Default: 'New Workspace'})
      }, (name: string) => {
        this.loading.set(true)
        return this.workspaceService.create({ name })
      })
      .subscribe({
        next: (workspace) => {
          this.loading.set(false)
          this.workspaceService.refresh()
          this.selectedWorkspaces.set([workspace.id])
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
        data: {
          id: this.selectedWorkspaces()[0]
        }
      })
      .afterClosed()
      .subscribe((event) => {
        if (event === 'deleted' || event === 'archived') {
          this.workspaceService.refresh()
          this.router.navigate(['/xpert/w'])
        }
      })
  }
}
