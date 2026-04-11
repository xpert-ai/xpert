import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  Input,
  OnInit,
  Optional,
  computed,
  inject,
  signal
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'

import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogModule,
  ZardDialogRef,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { NgmCommonModule, NgmResizableDirective } from '@xpert-ai/ocap-angular/common'
import {
  DisplayDensity,
  NgmAppearance,
  NgmDSCoreService,
  OcapCoreModule,
  NgmFieldAppearance
} from '@xpert-ai/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  DisplayBehaviour,
  FilterOperator,
  FilterSelectionType,
  IMember,
  ISlicer,
  PresentationEnum,
  PropertyHierarchy,
  TreeSelectionMode,
  getEntityProperty
} from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { merge } from 'lodash-es'
import { filter, map, switchMap } from 'rxjs'
import { NgmMemberListComponent } from '../member-list/member-list.component'
import { NgmMemberTreeComponent } from '../member-tree/member-tree.component'
import { ControlOptions, TreeControlOptions } from '../types'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-value-help',
  templateUrl: 'value-help.component.html',
  styleUrls: ['value-help.component.scss'],
  host: {
    class: 'ngm-value-help'
  },
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    ZardDialogModule,
    ZardIconComponent,
    ZardDividerComponent,
    ...ZardFormImports,
    ...ZardSelectImports,
    ZardButtonComponent,
    NgmCommonModule,
    OcapCoreModule,
    NgmMemberListComponent,
    NgmMemberTreeComponent,
    NgmResizableDirective
  ]
})
export class NgmValueHelpComponent implements OnInit {
  DISPLAY_BEHAVIOUR = DisplayBehaviour
  FilterSelectionType = FilterSelectionType
  TreeSelectionMode = TreeSelectionMode
  PresentationEnum = PresentationEnum
  readonly autoDisplayBehaviour = '__auto__'
  readonly displayBehaviourOptions = [
    { value: DisplayBehaviour.descriptionOnly, label: 'Description' },
    { value: DisplayBehaviour.descriptionAndId, label: 'Description ID' },
    { value: DisplayBehaviour.idAndDescription, label: 'ID Description' },
    { value: DisplayBehaviour.idOnly, label: 'ID' },
    { value: this.autoDisplayBehaviour, label: 'Auto' }
  ]
  readonly selectionTypeOptions = [
    {
      value: FilterSelectionType.Single,
      i18nKey: 'Ngm.Common.SelectionType_Single',
      defaultLabel: 'Single'
    },
    {
      value: FilterSelectionType.Multiple,
      i18nKey: 'Ngm.Common.SelectionType_Multiple',
      defaultLabel: 'Multiple'
    },
    {
      value: FilterSelectionType.SingleRange,
      i18nKey: 'Ngm.Common.SelectionType_SingleRange',
      defaultLabel: 'Single Range'
    }
  ]
  readonly presentationOptions = [
    {
      value: PresentationEnum.Flat,
      i18nKey: 'Ngm.Common.Presentation_Flat',
      defaultLabel: 'Flat'
    },
    {
      value: PresentationEnum.Hierarchy,
      i18nKey: 'Ngm.Common.Presentation_Hierarchy',
      defaultLabel: 'Hierarchy'
    }
  ]
  readonly treeSelectionModeOptions = [
    {
      value: TreeSelectionMode.Individual,
      i18nKey: 'Ngm.Common.HierarchySelectionMode_Individual',
      defaultLabel: 'Individual'
    },
    {
      value: TreeSelectionMode.SelfDescendants,
      i18nKey: 'Ngm.Common.HierarchySelectionMode_SelfDescendants',
      defaultLabel: 'Self & Descendants'
    },
    {
      value: TreeSelectionMode.DescendantsOnly,
      i18nKey: 'Ngm.Common.HierarchySelectionMode_DescendantsOnly',
      defaultLabel: 'Descendants Only'
    },
    {
      value: TreeSelectionMode.SelfChildren,
      i18nKey: 'Ngm.Common.HierarchySelectionMode_SelfChildren',
      defaultLabel: 'Self & Children'
    },
    {
      value: TreeSelectionMode.ChildrenOnly,
      i18nKey: 'Ngm.Common.HierarchySelectionMode_ChildrenOnly',
      defaultLabel: 'Children Only'
    }
  ]
  readonly memberPropertyOptions = [
    {
      value: 'UniqueName',
      i18nKey: 'Ngm.Controls.ValueHelp.UniqueName',
      defaultLabel: 'Unique Name'
    },
    {
      value: 'Caption',
      i18nKey: 'Ngm.Controls.ValueHelp.Caption',
      defaultLabel: 'Caption'
    }
  ]
  readonly memberOperatorOptions = [
    {
      value: FilterOperator.Contains,
      i18nKey: 'Ngm.Controls.ValueHelp.Contains',
      defaultLabel: 'Contains'
    },
    {
      value: FilterOperator.StartsWith,
      i18nKey: 'Ngm.Controls.ValueHelp.StartsWith',
      defaultLabel: 'Starts With'
    },
    {
      value: FilterOperator.EndsWith,
      i18nKey: 'Ngm.Controls.ValueHelp.EndsWith',
      defaultLabel: 'Ends With'
    },
    {
      value: FilterOperator.NotContains,
      i18nKey: 'Ngm.Controls.ValueHelp.NotContains',
      defaultLabel: 'Not Contains'
    },
    {
      value: FilterOperator.NotStartsWith,
      i18nKey: 'Ngm.Controls.ValueHelp.NotStartsWith',
      defaultLabel: 'Not Starts With'
    },
    {
      value: FilterOperator.NotEndsWith,
      i18nKey: 'Ngm.Controls.ValueHelp.NotEndsWith',
      defaultLabel: 'Not Ends With'
    }
  ]

  private dsCoreService? = inject(NgmDSCoreService, { optional: true })
  readonly #data = inject<{
    dsCoreService: NgmDSCoreService
    dataSettings: DataSettings
    dimension: Dimension
    options: ControlOptions
    slicer: ISlicer
  }>(DIALOG_DATA, { optional: true })
  readonly #dialogRef = inject(DialogRef, { optional: true })

  @Input() get dataSettings(): DataSettings {
    return this.dataSettings$()
  }
  set dataSettings(value) {
    this.dataSettings$.set(value)
  }
  private dataSettings$ = signal<DataSettings>(null)

  @Input() get dimension(): Dimension {
    return this._dimension()
  }
  set dimension(value) {
    this._dimension.set(value)
  }
  private _dimension = signal<Dimension>(null)

  @Input() options = {
    stickyHeader: true
  } as ControlOptions
  @Input() appearance: NgmAppearance = {
    displayDensity: DisplayDensity.cosy,
    appearance: 'standard' as NgmFieldAppearance
  }

  slicer: ISlicer = {}

  /**
   * Bind Slicer to only take its members attribute
   */
  get slicerModel() {
    return this.slicer
  }
  set slicerModel(value) {
    this.slicer.members = value.members
  }

  // get hierarchy() {
  //   return this.dimension?.hierarchy
  // }
  // set hierarchy(value) {
  //   this.dimension = {
  //     ...this.dimension,
  //     hierarchy: value
  //   }
  // }

  get showAllMember() {
    return this.options?.showAllMember
  }
  set showAllMember(value) {
    this.options = {
      ...(this.options ?? {}),
      showAllMember: value
    } as ControlOptions
  }

  get onlyLeaves() {
    return (<TreeControlOptions>this.options)?.onlyLeaves
  }
  set onlyLeaves(value) {
    this.options = {
      ...(this.options ?? {}),
      onlyLeaves: value
    } as ControlOptions
  }

  get excludeSelected() {
    return this.slicer.exclude
  }
  set excludeSelected(value) {
    this.slicer = {
      ...this.slicer,
      exclude: value
    }
  }

  get selectionType() {
    return this.options?.selectionType
  }
  set selectionType(value) {
    this.options = {
      ...(this.options ?? {}),
      selectionType: value
    } as ControlOptions
  }

  get treeSelectionMode() {
    return (<TreeControlOptions>this.options)?.treeSelectionMode
  }
  set treeSelectionMode(value) {
    this.options = {
      ...(this.options ?? {}),
      treeSelectionMode: value
    } as ControlOptions
  }

  presentation: PresentationEnum
  expandAvailables = false

  readonly displayBehaviour = computed(() => this._dimension()?.displayBehaviour ?? DisplayBehaviour.auto) // Default (null / undefined) to auto
  readonly hierarchy = computed(() => this._dimension()?.hierarchy || this._dimension()?.dimension) // Hierarchy default same as dimension

  readonly entityType = toSignal(
    toObservable(this.dataSettings$).pipe(
      filter((dataSettings) => !!dataSettings?.dataSource && !!dataSettings?.entitySet),
      switchMap((dataSettings) => this.dsCoreService.selectEntitySet(dataSettings.dataSource, dataSettings.entitySet)),
      map((entitySet) => entitySet?.entityType)
    )
  )

  readonly hierarchies = computed<PropertyHierarchy[]>(() => {
    const entityType = this.entityType()
    const dimension = this._dimension()
    if (entityType && dimension) {
      const hierarchies = getEntityProperty(entityType, dimension)?.hierarchies
      if (hierarchies?.length) {
        this.presentation = this.presentation ?? PresentationEnum.Hierarchy
      }
      return hierarchies
    }
    return []
  })
  readonly hierarchyOptions = computed(() =>
    (this.hierarchies() ?? []).map((hierarchy) => ({
      value: hierarchy.name,
      label: hierarchy.caption
    }))
  )

  get selectedMembers() {
    return this.slicer?.members
  }

  get data() {
    return this._data ?? this.#data
  }

  // Condition members
  readonly memberForm = new FormGroup({
    type: new FormControl<'Caption' | 'UniqueName'>('Caption', [Validators.required]),
    value: new FormControl<string>(''),
    operator: new FormControl<FilterOperator>(FilterOperator.Contains, [Validators.required])
  })

  constructor(
    @Optional() public dialogRef?: ZardDialogRef<NgmValueHelpComponent>,
    @Optional()
    @Inject(Z_MODAL_DATA)
    public _data?: {
      dsCoreService: NgmDSCoreService
      dataSettings: DataSettings
      dimension: Dimension
      options: ControlOptions
      slicer: ISlicer
    }
  ) {
    if (this.data?.dsCoreService) {
      this.dsCoreService = this.data.dsCoreService
    }
  }

  ngOnInit() {
    if (this.data) {
      this.dataSettings = this.data.dataSettings
      this.dimension = this.data.dimension
      if (this.data.options) {
        this.options = merge(this.options, this.data.options)
      }
      this.slicer = {
        ...(this.data.slicer ?? {})
      }
    }
  }

  setDisplayBehaviour(value: DisplayBehaviour) {
    this._dimension.update((state) => ({
      ...state,
      displayBehaviour: value
    }))
  }

  setHierarchy(hierarchy: string) {
    this._dimension.update((state) => ({
      ...state,
      hierarchy
    }))
  }

  deleteMember(i) {
    const members = [...this.slicer.members]
    members.splice(i, 1)
    this.slicer = {
      ...this.slicer,
      members
    }
  }

  clearSelection() {
    this.slicer = {
      ...this.slicer,
      members: []
    }
  }

  addMember() {
    const members = this.slicer.members ? [...this.slicer.members] : []
    const member: IMember = { key: null, operator: this.memberForm.value.operator }
    if (this.memberForm.value.type === 'Caption') {
      member.caption = this.memberForm.value.value
    } else if (this.memberForm.value.type === 'UniqueName') {
      member.key = this.memberForm.value.value
    }
    members.push(member)
    this.slicer = {
      ...this.slicer,
      members
    }
    this.memberForm.reset({ type: 'Caption', operator: FilterOperator.Contains, value: '' })
  }

  close() {
    const result = {
      ...this.slicer,
      dimension: {
        ...this.dimension
        // Default to descriptionOnly
        // displayBehaviour: this.dimension.displayBehaviour ?? DisplayBehaviour.descriptionOnly
      }
    }

    if (this.dialogRef) {
      this.dialogRef.close(result)
    }
    if (this.#dialogRef) {
      this.#dialogRef.close(result)
    }
  }
}
