import { CommonModule } from '@angular/common'
import { Component, forwardRef, HostBinding, inject, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { DisplayDensity, NgmAppearance, NgmDSCoreService, NgmOcapCoreService, TIME_GRANULARITY_SEQUENCES } from '@metad/ocap-angular/core'
import { TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { isDate } from 'date-fns'
import { filter } from 'rxjs/operators'
import { NgmMemberDatepickerModule } from '../datepicker'
import { ZardButtonComponent, ZardFormImports, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardFormImports,
    ...ZardMenuImports,
    NgmMemberDatepickerModule,
  ],
  selector: 'ngm-today-filter',
  templateUrl: './today-filter.component.html',
  styleUrls: ['./today-filter.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NgmTodayFilterComponent),
      multi: true
    }
  ]
})
export class NgmTodayFilterComponent implements OnInit, OnChanges, ControlValueAccessor {
  TimeGranularity = TimeGranularity
  TIME_GRANULARITY_SEQUENCES = TIME_GRANULARITY_SEQUENCES

  @HostBinding('class.ngm-today-filter') _hostClass = true

  private coreService = inject(NgmOcapCoreService)
  private dsCoreService = inject(NgmDSCoreService)

  @Input() get granularity() {
    return this._timeGranularity
  }
  set granularity(value) {
    this._timeGranularity = value
    this.dsCoreService.setTimeGranularity(value)
  }
  private _timeGranularity = TimeGranularity.Month
  @Input() granularitySequence = 0
  @Input() defaultValue: string
  @Input() appearance: NgmAppearance
  @Input() displayDensity: DisplayDensity

  date = new FormControl<Date | null>(new Date())
  onChange: (_: any) => void = (_: any) => {}
  onTouched: () => void = () => {}

  ngOnChanges({ defaultValue }: SimpleChanges): void {
    if (defaultValue?.currentValue) {
      let value = this.coreService.execDateVariables(defaultValue.currentValue)
      value = Array.isArray(value) ? value[0] : value
      this.date.setValue(value, { emitEvent: false })
      this.dsCoreService.setToday(value)
      this.onChange(value)
    }
  }

  ngOnInit(): void {
    this.date.valueChanges
      .pipe(
        filter((value): value is Date => value !== null),
        takeUntilDestroyed()
      )
      .subscribe((value) => {
        this.dsCoreService.setToday(value)
        this.onChange(value)
        this.onTouched()
      })
  }

  writeValue(obj: any): void {
    if (isDate(obj)) {
      this.date.setValue(obj, { emitEvent: false })
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.date.disable() : this.date.enable()
  }
}

@Component({
  selector: 'ngm-quarter-filter',
  template: `<z-form-field [appearance]="appearance?.appearance" [displayDensity]="appearance?.displayDensity">
    <z-form-label>{{ 'Ngm.TimeFilter.TODAY' | translate: {Default: 'Today'} }}</z-form-label>
    <ngm-quarterpicker [formControl]="date">
      <span ngmSuffix class="flex items-center"><ng-content></ng-content></span>
    </ngm-quarterpicker>
  </z-form-field>`,
  styleUrls: ['./today-filter.component.scss'],
  standalone: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NxQuarterFilterComponent),
      multi: true
    }
  ]
})
export class NxQuarterFilterComponent implements ControlValueAccessor {
  @Input() appearance: NgmAppearance

  date = new FormControl<Date | null>(new Date())
  onChange: (_: any) => void = (_: any) => {}
  onTouched: () => void = () => {}

  constructor() {
    this.date.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.onChange(value)
      this.onTouched()
    })
  }

  writeValue(obj: any): void {
    this.date.setValue(obj, { emitEvent: false })
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.date.disable() : this.date.enable()
  }
}

@Component({
  selector: 'ngm-month-filter',
  template: `<ngm-monthpicker [formControl]="date">
    <span ngmSuffix class="flex items-center"><ng-content></ng-content></span>
  </ngm-monthpicker>`,
  styleUrls: ['./today-filter.component.scss'],
  standalone: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NxMonthFilterComponent),
      multi: true
    }
  ]
})
export class NxMonthFilterComponent implements ControlValueAccessor {
  @Input() appearance: NgmAppearance

  date = new FormControl<Date | null>(new Date())
  onChange: (_: any) => void = (_: any) => {}
  onTouched: () => void = () => {}

  constructor() {
    this.date.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.onChange(value)
      this.onTouched()
    })
  }

  writeValue(obj: any): void {
    this.date.setValue(obj, { emitEvent: false })
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.date.disable() : this.date.enable()
  }
}

@Component({
  selector: 'ngm-year-filter',
  template: `<z-form-field [appearance]="appearance?.appearance" [displayDensity]="appearance?.displayDensity">
    <z-form-label>{{ 'Ngm.TimeFilter.TODAY' | translate: {Default: 'Today'} }}</z-form-label>
    <ngm-yearpicker [formControl]="date">
      <span ngmSuffix class="flex items-center"><ng-content></ng-content></span>
    </ngm-yearpicker>
  </z-form-field>`,
  styleUrls: ['./today-filter.component.scss'],
  standalone: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NxYearFilterComponent),
      multi: true
    }
  ]
})
export class NxYearFilterComponent implements ControlValueAccessor {
  @Input() appearance: NgmAppearance

  date = new FormControl<Date | null>(new Date())
  onChange: (_: any) => void = (_: any) => {}
  onTouched: () => void = () => {}

  constructor() {
    this.date.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.onChange(value)
      this.onTouched()
    })
  }

  writeValue(obj: any): void {
    this.date.setValue(obj, { emitEvent: false })
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.date.disable() : this.date.enable()
  }
}
