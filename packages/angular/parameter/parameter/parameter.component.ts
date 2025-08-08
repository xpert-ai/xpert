import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ThemePalette } from '@angular/material/core'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatRadioModule } from '@angular/material/radio'
import { MatSliderDragEvent, MatSliderModule } from '@angular/material/slider'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmControlsModule } from '@metad/ocap-angular/controls'
import { attrModel, linkedModel, NgmAppearance, NgmDSCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
import {
  CubeParameterEnum,
  DataSettings,
  DisplayBehaviour,
  FilterSelectionType,
  IMember,
  ISlicer,
  ParameterProperty,
  isEqual,
  isVariableProperty,
  pick
} from '@metad/ocap-core'
import {
  Subject,
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  switchMap
} from 'rxjs'

export interface ParameterOptions {
  /**
   * Single or multiple selection of parameter's members
   */
  selectionType?: FilterSelectionType
  /**
   * Use slider component for number type input parameter
   */
  slider?: boolean
  // Attributes for slider component
  sliderStep?: number
  sliderMin?: number
  sliderMax?: number
  showThumbLabel?: boolean
  showTickMarks?: boolean
  sliderColor?: ThemePalette
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatListModule,
    MatSliderModule,

    OcapCoreModule,
    NgmCommonModule,
    NgmControlsModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-parameter',
  templateUrl: 'parameter.component.html',
  styleUrls: ['parameter.component.scss'],
  host: {
    class: 'ngm-parameter'
  }
})
export class NgmParameterComponent {
  eCubeParameterEnum = CubeParameterEnum

  private dsCoreService = inject(NgmDSCoreService)

  // Inputs
  readonly dataSettings = input<DataSettings>()
  private dataSettings$ = toObservable(this.dataSettings)

  readonly parameter = model<ParameterProperty>()
  readonly parameter$ = toObservable(this.parameter)
  // @Input() get parameter(): ParameterProperty {
  //   return this.parameter$.value
  // }
  // set parameter(value) {
  //   this.parameter$.next(value)
  // }
  // private parameter$ = new BehaviorSubject<ParameterProperty>(null)

  // @Input() displayBehaviour: DisplayBehaviour
  readonly displayBehaviour = input<DisplayBehaviour>(DisplayBehaviour.auto)

  // @Input() options: ParameterOptions
  readonly options = input<ParameterOptions>()
  // @Input() appearance: NgmAppearance
  readonly appearance = input<NgmAppearance>()

  // Outputs
  readonly parameterChange = output<ParameterProperty>()

  // @Output() parameterChange = new EventEmitter<ParameterProperty>()

  get multiple() {
    return this.options()?.selectionType === FilterSelectionType.Multiple
  }
  get paramType() {
    return this.parameter()?.paramType
  }
  // get availableMembers() {
  //   return this.parameter()?.availableMembers ?? []
  // }
  // get members() {
  //   return this.parameter()?.members
  // }
  // set members(members) {
  //   if (!isEqual(members, this.parameter()?.members)) {
  //     this.parameter = {
  //       ...this.parameter,
  //       members
  //     }
  //     this.changeParameter()
  //   }
  // }
  readonly members = attrModel(this.parameter, 'members')

  private readonly dataSource$ = this.dataSettings$.pipe(
    map((dataSettings) => dataSettings?.dataSource),
    filter((value) => !!value),
    distinctUntilChanged(),
    switchMap((dataSource) => this.dsCoreService.getDataSource(dataSource))
  )
  readonly dataSource = toSignal(this.dataSource$)
  public readonly dimension$ = this.parameter$.pipe(
    filter((value) => !!value?.dimension),
    map((parameter) => pick(parameter, 'dimension', 'hierarchy')),
    distinctUntilChanged(isEqual)
  )
  public readonly members$ = this.dimension$.pipe(
    combineLatestWith(
      this.dataSettings$.pipe(
        map((dataSettings) => dataSettings?.entitySet),
        filter((value) => !!value),
        distinctUntilChanged()
      ),
      this.dataSource$
    ),
    switchMap(([parameter, entity, dataSource]) => dataSource.discoverMDMembers(entity, parameter)),
    map((members) =>
      members?.map(
        (item) =>
          ({
            key: item.memberKey,
            value: item.memberKey,
            caption: item.memberCaption
          }) as IMember
      )
    )
  )

  public readonly availableMembers$ = this.parameter$.pipe(
    map((parameter) => parameter?.availableMembers),
    distinctUntilChanged(),
    switchMap((availableMembers) => (availableMembers?.length ? of(availableMembers) : this.members$))
  )

  readonly variableProperty = toSignal(this.parameter$.pipe(map((parameter) => isVariableProperty(parameter) ? parameter : null)))

  readonly entitySet = computed(() => this.dataSettings()?.entitySet)
  readonly _parameters = toSignal(this.dataSource$.pipe(switchMap((dataSource) => dataSource.selectOptions()), map((options) => options.parameters?.[this.entitySet()])))
  readonly parameterValue = linkedModel({
    initialValue: null,
    compute: () => this._parameters()?.[this.parameter().name] ?? this.parameter().value,
    update: (value) => {
      this.dataSource().updateParameters(this.entitySet(), (parameters) => {
        return {...parameters, [this.parameter().name]: value}
      })
    }
  })

  readonly valueList = linkedModel({
    initialValue: [],
    compute: () => this.parameterValue() == null ? [] : [ this.parameterValue() ],
    update: (value) => {
      this.parameterValue.set(value[0] ?? null)
    }
  })

  readonly availableMembers = computed(() => {
    const availableMembers = this.parameter()?.availableMembers ?? []
    const value = this.parameter()?.value
    if (typeof value === 'string' && !availableMembers.some((member) => member.key === value)) {
      availableMembers.push({
        key: value,
        caption: value,
      })
    }
    return availableMembers
  })

  slicer = {}

  // private changeParameter$ = new Subject<void>()
  // private changeSub = this.changeParameter$
  //   .pipe(debounceTime(500), takeUntilDestroyed())
  //   .subscribe(() => this.parameterChange.emit(this.parameter()))

  // constructor() {
  //   effect(() => {
  //     console.log('parameter', this.parameter(), this.availableMembers(), this.valueList())
  //   })
  // }

  compareWith(a: IMember, b: IMember) {
    return a.key === b.key
  }

  updateParameterValue(event) {
    this.parameterValue.set(event)
  //   this.parameter = {
  //     ...this.parameter,
  //     value: event
  //   }
  //   this.changeParameter()
  }

  // changeParameter() {
  //   // this.changeParameter$.next()
  //   this.parameterValue.set(this.parameter().value)
  // }

  onSlicerChange(slicer: ISlicer) {
    this.updateParameterValue(slicer.members)
  }

  onSlicerEnd(event: MatSliderDragEvent) {
    this.updateParameterValue(event.value)
  }

  onBlur(event: FocusEvent) {
    this.updateParameterValue((<HTMLInputElement>event.target).value)
  }
}
