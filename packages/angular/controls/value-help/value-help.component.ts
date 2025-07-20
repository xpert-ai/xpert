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
import { MatButtonModule } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatDividerModule } from '@angular/material/divider'
import { MatFormFieldAppearance, MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { MatSelectModule } from '@angular/material/select'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayDensity, NgmAppearance, NgmDSCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
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
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { merge } from 'lodash-es'
import { filter, map, switchMap } from 'rxjs'
import { NgmMemberListComponent } from '../member-list/member-list.component'
import { NgmMemberTreeComponent } from '../member-tree/member-tree.component'
import { ControlOptions, TreeControlOptions } from '../types'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'

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
    MatDialogModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatListModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    NgmCommonModule,
    OcapCoreModule,
    NgmMemberListComponent,
    NgmMemberTreeComponent
  ]
})
export class NgmValueHelpComponent implements OnInit {
  DISPLAY_BEHAVIOUR = DisplayBehaviour
  FilterSelectionType = FilterSelectionType
  TreeSelectionMode = TreeSelectionMode
  PresentationEnum = PresentationEnum
  eFilterOperator = FilterOperator
  eDisplayBehaviour = DisplayBehaviour

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
    appearance: 'standard' as MatFormFieldAppearance
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
    @Optional() public dialogRef?: MatDialogRef<NgmValueHelpComponent>,
    @Optional()
    @Inject(MAT_DIALOG_DATA)
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
    const member: IMember = {key: null, operator: this.memberForm.value.operator,}
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
    this.memberForm.reset({type: 'Caption', operator: FilterOperator.Contains, value: ''})
  }

  close() {
    const result = {
      ...this.slicer,
      dimension: {
        ...this.dimension,
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
