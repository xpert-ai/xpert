import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, Input, forwardRef } from '@angular/core'
import {
  ControlValueAccessor,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule
} from '@angular/forms'
import { MatListModule, MatSelectionListChange } from '@angular/material/list'
import { MatSelectModule } from '@angular/material/select'
import { NgmPropertyComponent } from '@metad/ocap-angular/common'
import {
  CalculationProperty,
  CalculationType,
  DisplayBehaviour,
  EntityType,
  MeasureControlProperty,
  Property,
  getEntityMeasures,
  isMeasureControlProperty
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { map } from 'rxjs/operators'
import { ZardFormImports } from "@xpert-ai/headless-ui";

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, DragDropModule, ...ZardFormImports, MatSelectModule, MatListModule, NgmPropertyComponent],
  selector: 'ngm-measure-control',
  templateUrl: './measure-control.component.html',
  styleUrl: './measure-control.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmMeasureControlComponent)
    }
  ]
})
export class NgmMeasureControlComponent implements ControlValueAccessor {
  DISPLAY_BEHAVIOUR = DisplayBehaviour

  @Input() get entityType(): EntityType {
    return this.entityType$.value
  }
  set entityType(value) {
    this.entityType$.next(value)
  }
  private entityType$ = new BehaviorSubject<EntityType>(null)
  readonly measures$ = new BehaviorSubject<Property[]>([])

  formGroup: FormGroup = this.formBuilder.group({
    displayBehaviour: DisplayBehaviour.descriptionAndId,
    allMeasures: null,
    availableMembers: [],
    value: null
  })

  get measures() {
    return this.formGroup.get('availableMembers')
  }
  get displayBehaviour() {
    return this.formGroup.get('displayBehaviour') as FormControl<DisplayBehaviour>
  }

  selectedMeasures: string[] = []

  private _onChange: any
  private onTouched = () => {}
  constructor(private formBuilder: FormBuilder) {
    this.entityType$
      .pipe(
        map((entityType) =>
          getEntityMeasures(entityType)
            .filter((property) => !isMeasureControlProperty(property))
            .sort((a, b) => {
              // 让 calculationType is Indicator 的往最后排
              if ((b as CalculationProperty).calculationType === CalculationType.Indicator) {
                return -1
              }
              if ((a as CalculationProperty).calculationType === CalculationType.Indicator) {
                return 1
              }
              return (a as CalculationProperty).calculationType > (b as CalculationProperty).calculationType ? 1 : -1
            })
        )
      )
      .subscribe(this.measures$)

    this.formGroup.valueChanges.subscribe((value) => {
      this._onChange?.(value)
    })
  }

  writeValue(obj: MeasureControlProperty): void {
    if (obj) {
      this.formGroup.patchValue(obj)
      this.selectedMeasures = obj.availableMembers?.map((member) => member.key)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    if (isDisabled) {
      this.formGroup.disable()
    } else {
      this.formGroup.enable()
    }
  }

  drop(event: CdkDragDrop<Property[]>) {
    moveItemInArray(this.measures$.value, event.previousIndex, event.currentIndex)
    this.measures$.next(this.measures$.value)
    this.onSelectionChange()
  }

  onSelectionChange(event?: MatSelectionListChange) {
    this.measures.setValue(
      this.measures$.value
        .filter((property) => this.selectedMeasures.includes(property.name))
        .map((property) => ({
          key: property.name,
          caption: property.caption
        }))
    )
  }
}
