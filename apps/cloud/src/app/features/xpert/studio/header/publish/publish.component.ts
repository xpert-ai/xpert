import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { nonBlank, SlideUpAnimation } from '@xpert-ai/headless-ui'
import { injectConfirmDelete, XpSpinComponent } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  AiFeatureEnum,
  BusinessAreaService,
  deriveXpertMarketplaceTechnicalProfile,
  getErrorMessage,
  type IBusinessArea,
  IXpert,
  OrderTypeEnum,
  Store,
  ToastrService,
  TSelectOption,
  TXpertMarketplaceBusinessCategory,
  TXpertMarketplaceTechnicalCategory,
  TXpertPublishMarketplaceInput,
  XpertAPIService,
  XpertMarketplaceBusinessCategories
} from '@cloud/app/@core'
import { catchError, Observable, of, switchMap } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpSelectComponent } from '@cloud/app/@shared/common'
import { XpertService } from '../../../xpert/xpert.service'
import { injectConfirm, ZardAccordionImports, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    TranslateModule,
    ...ZardAccordionImports,
    ...ZardTooltipImports,
    XpSpinComponent,
    XpSelectComponent,
    ZardSwitchComponent
  ],
  selector: 'xpert-publish',
  templateUrl: './publish.component.html',
  styleUrl: 'publish.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [SlideUpAnimation]
})
export class XpertPublishVersionComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertAPI = inject(XpertAPIService)
  readonly xpertService = inject(XpertService)
  readonly #store = inject(Store)
  readonly confirmDelete = injectConfirmDelete()
  readonly confirm = injectConfirm()
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #businessAreaService = inject(BusinessAreaService)

  readonly xpert = this.studioService.team
  readonly latest = computed(() => this.xpert()?.latest)
  readonly version = computed(() => this.xpert()?.version)
  readonly featureContextHydrated = toSignal(this.#store.featureContextHydrated$, {
    initialValue: this.#store.featureContextHydrated
  })
  readonly agentMarketplaceEnabled = computed(
    () =>
      this.featureContextHydrated() === true && this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_MARKETPLACE)
  )
  readonly versions = computed(() => {
    const versions = this.studioService.versions()?.filter(nonBlank)
    return versions?.sort((a, b) => Number(b.version) - Number(a.version))
  })

  readonly newVersion = model(false)
  readonly releaseNotes = model('')
  readonly businessAreaId = model<string | null>(this.xpert().businessAreaId ?? null)
  readonly businessAreaLoadFailed = signal(false)
  readonly businessAreaPage = toSignal(
    this.#businessAreaService
      .getAllInOrg({
        order: { name: OrderTypeEnum.ASC },
        take: 500
      })
      .pipe(
        catchError(() => {
          this.businessAreaLoadFailed.set(true)
          return of({ items: [], total: 0 })
        })
      ),
    { initialValue: { items: [], total: 0 } }
  )
  readonly businessAreaOptions = computed<TSelectOption[]>(() => {
    const areas = this.businessAreaPage().items ?? []
    const byId = new Map<string, IBusinessArea>()
    for (const area of areas) {
      if (area.id) {
        byId.set(area.id, area)
      }
    }

    return areas
      .flatMap((area) => {
        const id = area.id?.trim()
        const name = area.name?.trim()
        return id && name
          ? [
              {
                value: id,
                label: this.businessAreaPath(area, byId)
              }
            ]
          : []
      })
      .sort((left, right) => String(left.label).localeCompare(String(right.label)))
  })
  readonly marketplaceSummary = model(this.xpert().marketplace?.summary ?? '')
  readonly capabilityTagsText = model((this.xpert().marketplace?.capabilityTags ?? []).join(', '))
  readonly businessCategories = XpertMarketplaceBusinessCategories
  readonly selectedBusinessCategories = signal<TXpertMarketplaceBusinessCategory[]>(
    (this.xpert().marketplace?.businessCategories ?? []).filter((category) =>
      this.businessCategories.includes(category)
    )
  )
  readonly technicalPreview = computed(() => {
    const xpert = this.xpert()
    if (xpert.draft) {
      return deriveXpertMarketplaceTechnicalProfile(xpert.draft)
    }
    if (xpert.graph) {
      return deriveXpertMarketplaceTechnicalProfile({
        ...xpert.graph,
        team: xpert
      })
    }
    return deriveXpertMarketplaceTechnicalProfile(null)
  })
  readonly releaseNotesError = computed(() => {
    if (!this.releaseNotes()) {
      return this.#translate.instant('XP.Xpert.AddReleaseNotes', { Default: 'Add release notes' })
    } else if (this.releaseNotes().trim().length < 10) {
      return this.#translate.instant('XP.Xpert.ReleaseNotesLess', { Default: 'Release notes too less' })
    }
    return null
  })

  readonly environments = computed(() => {
    return this.studioService.environments()?.map((env) => {
      return {
        value: env.id,
        label: env.name
      } as TSelectOption
    })
  })

  readonly environmentId = model<string>(this.xpert().environmentId)

  readonly loading = signal(false)

  close() {
    this.#dialogRef.close()
  }

  setAsLatest(xpert: Partial<IXpert>) {
    this.loading.set(true)
    this.confirm(
      {
        title: this.#translate.instant('XP.Xpert.SetAsLatest', { Default: 'Set as latest' }),
        information: this.#translate.instant('XP.Xpert.LatestDefaultVersion', {
          Default: 'Set this version as the latest, the default version when opening Digital Expert'
        })
      },
      this.xpertAPI.setAsLatest(xpert.id)
    ).subscribe({
      next: () => {
        this.loading.set(false)
        this.studioService.refresh()
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  deleteVer(xpert: Partial<IXpert>) {
    this.loading.set(true)
    this.confirmDelete(
      {
        value: 'v' + xpert.version,
        information: this.#translate.instant('XP.Xpert.DeleteThisVersion', {
          Default: 'Deleting this version will not affect the use of other versions'
        })
      },
      this.xpertAPI.delete(xpert.id)
    ).subscribe({
      next: () => {
        this.loading.set(false)
        if (xpert.id === this.xpert().id) {
          this.studioService.gotoWorkspace()
        } else {
          this.studioService.refresh()
          this.#toastr.success(`XP.Xpert.DeletedSuccessfully`, { Default: 'Deleted successfully' }, `v${xpert.version}`)
        }
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  publish() {
    this.loading.set(true)
    // Check if the draft has been saved
    const obser: Observable<any> = this.studioService.unsaved() ? this.studioService.saveDraft() : of(true)
    obser
      .pipe(
        switchMap(() =>
          this.xpertAPI.publish(this.xpert().id, this.newVersion(), {
            environmentId: this.environmentId(),
            releaseNotes: this.releaseNotes(),
            businessAreaId: this.businessAreaId(),
            ...(this.agentMarketplaceEnabled() ? { marketplace: this.marketplacePayload() } : {})
          })
        )
      )
      .subscribe({
        next: (result) => {
          this.#toastr.success(
            `XP.Xpert.PublishedSuccessfully`,
            { Default: 'Published successfully' },
            `v${result.version}`
          )
          this.loading.set(false)
          this.studioService.refresh()
          this.xpertService.published$.next(result)
          this.close()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  toggleBusinessCategory(category: TXpertMarketplaceBusinessCategory) {
    this.selectedBusinessCategories.update((items) =>
      items.includes(category) ? items.filter((item) => item !== category) : [...items, category]
    )
  }

  businessLabelKey(category: TXpertMarketplaceBusinessCategory) {
    return `XP.Plugin.MarketplaceCategory_${category}`
  }

  technicalLabelKey(category: TXpertMarketplaceTechnicalCategory) {
    return `XP.Explore.AgentSquare.Technical.${category}`
  }

  private marketplacePayload(): TXpertPublishMarketplaceInput {
    return {
      summary: this.marketplaceSummary().trim() || null,
      businessCategories: this.selectedBusinessCategories(),
      capabilityTags: this.capabilityTagsText()
        .split(/[,\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12)
    }
  }

  private businessAreaPath(area: IBusinessArea, byId: Map<string, IBusinessArea>) {
    const names: string[] = []
    const visited = new Set<string>()
    let current: IBusinessArea | undefined = area

    while (current?.id && !visited.has(current.id)) {
      visited.add(current.id)
      const name = current.name?.trim()
      if (name) {
        names.unshift(name)
      }
      current = current.parentId ? byId.get(current.parentId) : undefined
    }

    return names.join(' / ')
  }
}
