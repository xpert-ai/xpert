import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, Input, OnInit, inject } from '@angular/core'
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'

import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog'
import { ZardDividerComponent } from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatIconModule } from '@angular/material/icon'
import { ZardInputDirective, ZardFormImports } from '@xpert-ai/headless-ui'
import { NgmSelectComponent } from '@metad/ocap-angular/common'
import { ISelectOption, NgmOcapCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
import {
  calcOffsetRange,
  DataSettings,
  EntityType,
  formatRangeCurrentPeriod,
  getEntityProperty,
  Property,
  TimeRange,
  TimeRangesSlicer
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, combineLatest, map, Observable, shareReplay, startWith } from 'rxjs'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

/**
 * 时间维度的 Filter 编辑界面
 */
@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, ReactiveFormsModule, DragDropModule, MatDialogModule, ...ZardFormImports, MatExpansionModule, MatIconModule, ZardDividerComponent, ZardInputDirective, ZardButtonComponent, OcapCoreModule, NgmSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-time-filter-editor',
  templateUrl: './time-filter-editor.component.html',
  styleUrls: ['./time-filter-editor.component.scss']
})
export class NgmTimeFilterEditorComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  public data? = inject<{
    dataSettings: DataSettings
    entityType: EntityType
    slicer: TimeRangesSlicer
    forControl: boolean
  }>(MAT_DIALOG_DATA, {optional: true})

  private _dialogRef? = inject(MatDialogRef<NgmTimeFilterEditorComponent>, {optional: true})

  @Input() get entityType() {
    return this.entityType$.value
  }
  set entityType(value) {
    this.entityType$.next(value)
  }
  protected entityType$ = new BehaviorSubject<EntityType>(null)

  public formGroup = new FormGroup({
    dimension: new FormGroup({
      dimension: new FormControl<string>(null),
      hierarchy: new FormControl<string>(null)
    }),
    currentDate: new FormControl(),
    ranges: new FormArray([]),
    allowModifySelections: new FormControl<boolean>(null),
    selectionType: new FormControl()
  })

  public property$: Observable<Property> = combineLatest([
    this.entityType$,
    this.formGroup
      .get('dimension')
      .get('dimension')
      .valueChanges.pipe(startWith(this.formGroup.value.dimension?.dimension))
  ]).pipe(
    map(([entityType, dimension]) => getEntityProperty(entityType, dimension)),
    shareReplay(1)
  )

  public hierarchies$ = this.property$.pipe(
    map((property) => property?.hierarchies)
  )
  public readonly hierarchyOptions$ = this.hierarchies$.pipe(
    map(
      (hierarchies) =>
        (hierarchies ?? []).map((hierarchy) => ({
          value: hierarchy.name,
          label: hierarchy.caption
        })) as ISelectOption[]
    )
  )

  forControl = false
  constructor(
    private coreService: NgmOcapCoreService,
    private formBuilder: FormBuilder,
  ) {
    this.property$.subscribe()
  }

  ngOnInit(): void {
    if (this.data) {
      this.entityType = this.data.entityType
      const current = this.coreService.execDateVariables(this.data.slicer.currentDate) as Date
      this.data.slicer.ranges.forEach((range) => {
        const currentPeriod = formatRangeCurrentPeriod(current, range)
        const result = calcOffsetRange(current, range)
        this.ranges.push(
          this.buildRangeForm({
            ...range,
            currentPeriod,
            result
          } as TimeRange)
        )
      })

      this.formGroup.patchValue(this.data.slicer)

      this.forControl = this.data.forControl
    }

    this.formGroup.valueChanges.subscribe((value) => {
      try {
        const current = this.coreService.execDateVariables(value.currentDate) as Date
        value.ranges.forEach((range, i) => {
          const currentPeriod = formatRangeCurrentPeriod(current, range)
          const result = calcOffsetRange(current, range)
          this.ranges.controls[i].patchValue(
            {
              currentPeriod,
              result
            },
            { emitEvent: false }
          )
        })
      } catch (err) {
        console.warn(err)
      }
    })
  }

  buildRangeForm(range?: TimeRange) {
    const form = this.formBuilder.group({
      type: new FormControl(),
      granularity: new FormControl(),
      current: new FormGroup({
        direction: new FormControl(),
        granularity: new FormControl(),
        amount: new FormControl()
      }),
      lookBack: new FormControl(),
      lookAhead: new FormControl(),
      currentPeriod: new FormControl({ value: null, disabled: true }),
      formatter: new FormControl(),
      result: new FormControl()
    })
    if (range) {
      form.patchValue(range)
    }
    return form
  }

  get ranges() {
    return this.formGroup.get('ranges') as FormArray
  }

  addRange(event) {
    this.ranges.push(this.buildRangeForm())
    event?.preventDefault()
  }

  onApply() {
    this._dialogRef.close({
      ...this.formGroup.value
    })
  }
}
