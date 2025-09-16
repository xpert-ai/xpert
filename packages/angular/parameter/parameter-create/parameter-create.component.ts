import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject, input, model, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidatorFn,
  Validators
} from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldAppearance, MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatRadioModule } from '@angular/material/radio'
import { NgmInputModule, NgmHierarchySelectComponent, NgmCheckboxComponent } from '@metad/ocap-angular/common'
import { NgmControlsModule, TreeControlOptions } from '@metad/ocap-angular/controls'
import { DisplayDensity, EntityUpdateEvent, NgmOcapCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
import {
  CubeParameterEnum,
  DataSettings,
  Dimension,
  EntityType,
  FilterSelectionType,
  getEntityDimensions,
  getEntityHierarchy,
  IMember,
  isNil,
  ParameterProperty,
  suuid,
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, map, startWith } from 'rxjs'

@Component({
  standalone: true,
  selector: 'ngm-parameter-create',
  templateUrl: 'parameter-create.component.html',
  styleUrls: ['parameter-create.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    MatButtonToggleModule,
    MatIconModule,
    MatRadioModule,
    MatCheckboxModule,
    TranslateModule,
    OcapCoreModule,
    NgmControlsModule,
    NgmInputModule,
    NgmHierarchySelectComponent,
    NgmCheckboxComponent
  ]
})
export class NgmParameterCreateComponent {
  eCubeParameterEnum = CubeParameterEnum
  eDisplayDensity = DisplayDensity

  readonly #coreService = inject(NgmOcapCoreService)
  readonly #dialogRef = inject(DialogRef, { optional: true })
  readonly #data = inject<{
      name: string
      dataSettings: DataSettings
      entityType: EntityType
      dimension: Dimension
      parameter?: ParameterProperty
    }>(DIALOG_DATA, { optional: true })
  readonly _formBuilder = inject(FormBuilder)

  // Inputs
  readonly appearance = input<MatFormFieldAppearance>('fill')
  readonly dataSettings = model<DataSettings>()
  readonly entityType = model<EntityType>()

  // States
  /**
   * Edit mode, otherwise create mode
   */
  readonly edit = signal(false)

  memberTreeOptions: TreeControlOptions = {
    selectionType: FilterSelectionType.Multiple,
    initialLevel: 1,
    searchable: true
  }

  formGroup: FormGroup = this._formBuilder.group({
    __id__: suuid(),
    name: ['', [Validators.required, this.forbiddenNameValidator()]],
    caption: null,
    dimension: null,
    hierarchy: null,
    paramType: [CubeParameterEnum.Input, Validators.required],
    value: null,
    dataType: null,
    members: [],
    availableMembers: this._formBuilder.array([]),
    multiple: false
  })
  get availableMembers(): FormArray {
    return this.formGroup.get('availableMembers') as FormArray
  }
  get name() {
    return this.formGroup.get('name')
  }
  get paramType() {
    return this.formGroup.get('paramType')
  }
  get dataType() {
    return this.formGroup.get('dataType') as FormControl
  }
  get value() {
    return this.formGroup.get('value') as FormControl
  }
  get multiple() {
    return this.formGroup.get('multiple') as FormControl
  }
  get dimension() {
    return this.formGroup.value.dimension
  }

  get hierarchy() {
    return this.formGroup.value.hierarchy
  }

  get slicer() {
    return this._slicer
  }
  set slicer(value) {
    this._slicer.members = value?.members ?? []
    this.setAvailableMembers(
      this._slicer.members.map((member) => ({ ...member, isDefault: member.isDefault ?? false }))
    )
  }
  private _slicer = { members: [] }

  public readonly dimensions$ = toObservable(this.entityType).pipe(map((entityType) => getEntityDimensions(entityType)))
  public readonly dimension$ = this.formGroup.valueChanges.pipe(
    filter((value) => !isNil(value.dimension)),
    map((value) => ({
      dimension: value.dimension,
      hierarchy: value.hierarchy
    }))
  )

  readonly inputType = toSignal(this.dataType.valueChanges.pipe(
    startWith(this.dataType.value),
    map((type) => type === 'string' ? 'text' : type)
  ))

  constructor() {
    if (this.#data) {
      this.dataSettings.set(this.#data.dataSettings)
      this.entityType.set(this.#data.entityType)

      if (this.#data.name || this.#data.parameter) {
        this.edit.set(true)
        const property = this.#data.parameter || this.entityType()?.parameters?.[this.#data.name]
        this.formGroup.patchValue(property ?? {})
        this.slicer = {
          ...this.slicer,
          members: [...(property?.availableMembers ?? [])]
        }
      } else {
        this.formGroup.patchValue(this.#data.dimension)
      }
    }
  }

  onApply() {
    const event: EntityUpdateEvent = {
      type: 'Parameter',
      dataSettings: this.dataSettings(),
      parameter: {
        ...this.formGroup.value,
        members: this.formGroup.value.availableMembers.filter((member) => member.isDefault)
      }
    }
    this.#coreService.updateEntity(event)
    this.#dialogRef?.close(event)
  }

  create(item?: Partial<IMember>): FormGroup {
    const _group = this._formBuilder.group({
      key: this._formBuilder.control(null, [Validators.required]),
      caption: null,
      isDefault: null
    })
    _group.patchValue(item ?? {})
    return _group
  }

  setAvailableMembers(members: Partial<IMember>[]) {
    this.availableMembers.clear()
    members?.forEach((member) => {
      this.availableMembers.push(this.create(member))
    })
  }

  add(): void {
    this.availableMembers.push(this.create())
  }

  remove(i: number) {
    this.availableMembers.removeAt(i)
  }

  forbiddenNameValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const forbidden =
        !this.edit &&
        this.entityType()?.parameters &&
        !!Object.values(this.entityType().parameters).find((item) => item.name === control.value)
      return forbidden ? { forbiddenName: { value: control.value } } : null
    }
  }

  onHierarchyChange(hierarchy: string) {
    this.formGroup.patchValue({
      dimension: getEntityHierarchy(this.entityType(), hierarchy)?.dimension,
      hierarchy: hierarchy
    })
  }

  onCancel() {
    this.#dialogRef?.close()
  }
}
