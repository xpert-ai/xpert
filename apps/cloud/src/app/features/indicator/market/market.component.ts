import { CommonModule } from '@angular/common'
import { Component, inject, model } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { BusinessAreasService, IndicatorsService, Store, ToastrService, hierarchize } from '@metad/cloud/state'
import { IndicatorType, PermissionApprovalStatusTypesEnum, TagCategoryEnum } from '@cloud/app/@core/types'
import { NgmCommonModule, NgmHighlightDirective, NgmTreeSelectComponent, ResizerModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { findTreeNode } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { formatRelative } from 'date-fns'
import { find, groupBy, includes, isEmpty, isNil } from 'lodash-es'
import { BehaviorSubject, combineLatest, debounceTime, map, shareReplay, startWith, switchMap } from 'rxjs'
import {
  ApprovalPolicyTypesStringEnum,
  CertificationService,
  IPermissionApprovalUser,
  PermissionApprovalService,
  TagService,
  getDateLocale
} from '../../../@core'
import { InlineSearchComponent } from '../../../@shared/form-fields'
import { IndicatorTypeComponent } from '../../../@shared/indicator'
import { AppService } from '../../../app.service'
import { MaterialModule } from '../../../@shared/material.module'
import { SharedModule } from '../../../@shared/shared.module'
import { TagViewerComponent } from '../../../@shared/tag'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    MaterialModule,

    InlineSearchComponent,

    NgmCommonModule,
    ResizerModule,
    ButtonGroupDirective,
    InlineSearchComponent,
    IndicatorTypeComponent,
    NgmTreeSelectComponent,
    TagViewerComponent,
    NgmHighlightDirective
  ],
  selector: 'pac-market',
  templateUrl: './market.component.html',
  styleUrls: ['./market.component.scss'],
  host: {
    class: 'pac-indicator-market'
  }
})
export class MarketComponent {
  IndicatorType = IndicatorType

  public readonly translateService = inject(TranslateService)
  private readonly tagService = inject(TagService)
  private readonly store = inject(Store)
  readonly appService = inject(AppService)
  private readonly indicatorStore = inject(IndicatorsService)
  private readonly businessGroupsStore = inject(BusinessAreasService)
  private readonly permissionApprovalService = inject(PermissionApprovalService)
  private readonly certificationService = inject(CertificationService)
  private readonly toastrService = inject(ToastrService)

  PAGE_SIZE = 10
  displayCompact = false
  
  businessArea = new FormControl<string>(null)
  search = new FormControl<string>(null)
  get highlight() {
    return this.search.value
  }

  private types$ = new BehaviorSubject<IndicatorType[]>([])
  get types() {
    return this.types$.value
  }
  set types(value) {
    this.types$.next(value)
  }
  private selectedTagNames$ = new BehaviorSubject<string[]>([])
  public certificationsControl = new FormControl()

  public readonly tags$ = this.tagService.getAllByCategory(TagCategoryEnum.INDICATOR)
  public readonly index$ = new BehaviorSubject<number>(1)
  private refreshApproval$ = new BehaviorSubject<void>(null)

  private readonly permissionApprovals$ = this.refreshApproval$.pipe(
    switchMap(() => this.permissionApprovalService.getMy()),
    map(({ items }) => items),
    takeUntilDestroyed(),
    shareReplay(1)
  )
  // 所有的公开指标
  private readonly publicIndicators$ = this.store
    .selectOrganizationId()
    .pipe(switchMap(() => this.indicatorStore.getAll(['createdBy', 'businessArea', 'certification'])))

  private readonly indicatorsWithPermission$ = combineLatest([this.publicIndicators$, this.permissionApprovals$]).pipe(
    map(([indicators, permissionApprovals]) => {
      const userId = this.store.userId
      return indicators.map((indicator) => {
        const permissions = permissionApprovals.filter(
          (item) =>
            item.permissionType === ApprovalPolicyTypesStringEnum.INDICATOR && item.permissionId === indicator.id
        )
        const businessAreas = permissionApprovals.filter(
          (item) =>
            item.permissionId === indicator.businessAreaId &&
            item.permissionType === ApprovalPolicyTypesStringEnum.BUSINESS_AREA
        )
        const currentLang = this.translateService.currentLang

        const permissionApproved =
          indicator.createdById === userId || // Created by me
          businessAreas.filter((item) => item.status === PermissionApprovalStatusTypesEnum.APPROVED).length || // Approved by business area
          permissions.filter((item) => item.status === PermissionApprovalStatusTypesEnum.APPROVED).length // Approved by indicator
        return {
          ...indicator,
          createdAt: formatRelative(new Date(indicator.createdAt), new Date(), { locale: getDateLocale(currentLang) }),
          permissionRefuses: permissions.filter((item) => item.status === PermissionApprovalStatusTypesEnum.REFUSED)
            .length,
          permissionApproved,
          permissionRequests:
            businessAreas.filter((item) => item.status === PermissionApprovalStatusTypesEnum.REQUESTED).length ||
            permissions.filter((item) => item.status === PermissionApprovalStatusTypesEnum.REQUESTED).length
        } as any
      })
    })
  )

  private searchIndicators$ = combineLatest([
    this.indicatorsWithPermission$,
    this.search.valueChanges.pipe(startWith(''), debounceTime(200))
  ]).pipe(
    map(([indicators, text]) => {
      if (text) {
        text = text.toLowerCase()
        return indicators?.filter(
          (indicator) =>
            includes(indicator.name.toLowerCase(), text) ||
            includes(indicator.code?.toLowerCase(), text) ||
            includes(indicator.business?.toLowerCase(), text)
        )
      }

      return indicators
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly groupTree$ = combineLatest([
    this.businessGroupsStore.getAll().pipe(
      map((groups) => {
        return (
          hierarchize(groups, {
            parentNodeProperty: 'parentId',
            valueProperty: 'id',
            labelProperty: 'name'
          }) ?? { treeNodes: [] }
        )
      })
    ),
    this.searchIndicators$.pipe(map((indicators) => groupBy(indicators, 'businessAreaId')))
  ]).pipe(
    map(([{ treeNodes, index }, indicators]) => {
      if (index) {
        Object.values(index).forEach((item: any) => (item.leavesCount = null))
      }
      Object.keys(indicators).forEach((key) => {
        if (key !== 'null') {
          // const businessArea = findTreeNode(businessAreas, key) as any
          for (
            let businessArea = findTreeNode(treeNodes, key) as any;
            !isNil(businessArea?.parent);
            businessArea = businessArea.parent
          ) {
            if (businessArea) {
              businessArea.leavesCount = (businessArea.leavesCount ?? 0) + indicators[key].length
            }
          }
        }
      })

      if (index) {
        Object.values(index).forEach((item: any) => (item.label = `${item.title}(${item.leavesCount ?? 0})`))
      }

      return [...treeNodes]
    })
  )

  private readonly _indicators$ = combineLatest([
    this.searchIndicators$,
    this.businessArea.valueChanges.pipe(startWith(null))
  ]).pipe(
    map(([indicators, businessArea]) => {
      if (!isEmpty(businessArea)) {
        return indicators.filter((indicator) => includes(businessArea, indicator.businessAreaId))
      }
      return indicators
    }),
    switchMap((indicators) =>
      this.types$.pipe(
        map((types) => indicators.filter((indicator) => (types.length ? types.includes(indicator.type) : true)))
      )
    ),
    switchMap((indicators) =>
      this.certificationsControl.valueChanges.pipe(
        startWith(null),
        map((certification) =>
          indicators.filter((indicator) =>
            certification?.length ? certification.includes(indicator.certification?.id) : true
          )
        )
      )
    ),
    switchMap((indicators) =>
      this.selectedTagNames$.pipe(
        map((tags) =>
          indicators.filter((indicator) => {
            return tags.length === 0 || tags.every((tag) => find(indicator.tags, (item) => item.name === tag))
          })
        )
      )
    ),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly indicators$ = this._indicators$

  public readonly totals$ = this._indicators$.pipe(map((indicators) => indicators.length))

  public readonly businessAreaAuth$ = combineLatest([
    this.businessArea.valueChanges.pipe(startWith(null)),
    this.permissionApprovals$
  ]).pipe(
    map(([businessAreaId, permissionApprovals]) => {
      return (
        !businessAreaId ||
        permissionApprovals.find(
          (item) =>
            item.permissionType === ApprovalPolicyTypesStringEnum.BUSINESS_AREA &&
            item.permissionId === businessAreaId &&
            item.status !== PermissionApprovalStatusTypesEnum.REFUSED
        )
      )
    })
  )

  public readonly certifications = toSignal(
    this.certificationService.getAll().pipe(
      map((items) =>
        items.map((item) => ({
          key: item.id,
          value: item.id,
          caption: item.name,
          color: 'green'
        }))
      )
    )
  )
  readonly isMobile = this.appService.isMobile
  // Left side menu drawer open state
  readonly sideMenuOpened = model(!this.isMobile())

  onPageIndexChange(index) {
    this.index$.next(index)
  }

  onTagsChange(event) {
    this.selectedTagNames$.next(event)
  }

  async requestPermission(id: string) {
    try {
      await this.permissionApprovalService.save({
        permissionType: ApprovalPolicyTypesStringEnum.INDICATOR,
        permissionId: id,
        indicatorId: id,
        userApprovals: [
          {
            userId: this.store.user.id
          } as IPermissionApprovalUser
        ]
      })

      this.toastrService.success('PAC.INDICATOR.MARKET.RequestIndicator', { Default: 'Request indicator' })
      this.refreshApproval$.next()
    } catch (err) {
      this.toastrService.error(err)
    }
  }

  async requestBusinessArea(businessAreaId: string) {
    try {
      await this.permissionApprovalService.save({
        permissionType: ApprovalPolicyTypesStringEnum.BUSINESS_AREA,
        permissionId: businessAreaId,
        userApprovals: [
          {
            userId: this.store.user.id
          } as IPermissionApprovalUser
        ]
      })

      this.toastrService.success('PAC.INDICATOR.MARKET.RequestBusinessArea', { Default: 'Request business area' })
      this.refreshApproval$.next()
    } catch (err) {
      this.toastrService.error(err)
    }
  }
}
