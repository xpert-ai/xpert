import { Component, forwardRef, input, signal } from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardDatePickerComponent, ZardSelectImports, ZardSelectValue } from '@xpert-ai/headless-ui'

/** Keeps the cleanup form's local, minute-precision value while using Headless UI controls. */
@Component({
  standalone: true,
  selector: 'xp-retention-date-time',
  imports: [TranslateModule, ZardDatePickerComponent, ...ZardSelectImports],
  template: `
    <div role="group" [attr.aria-label]="label()" class="space-y-2">
      <z-date-picker
        class="block w-full"
        zFormat="yyyy-MM-dd"
        [value]="date()"
        [disabled]="isDisabled()"
        (dateChange)="selectDate($event)"
      />
      <div class="flex items-center gap-2">
        <div role="group" [attr.aria-label]="'XP.RetentionCleanup.Hour' | translate" class="min-w-0 flex-1">
          <span class="mb-1 block text-xs text-muted-foreground">{{ 'XP.RetentionCleanup.Hour' | translate }}</span>
          <z-select
            class="w-full"
            [zValue]="hour()"
            [zDisabled]="isDisabled() || !date()"
            (zSelectionChange)="selectTime('hour', $event)"
          >
            @for (item of hours; track item) {
              <z-select-item [zValue]="item">{{ item }}</z-select-item>
            }
          </z-select>
        </div>
        <div role="group" [attr.aria-label]="'XP.RetentionCleanup.Minute' | translate" class="min-w-0 flex-1">
          <span class="mb-1 block text-xs text-muted-foreground">{{ 'XP.RetentionCleanup.Minute' | translate }}</span>
          <z-select
            class="w-full"
            [zValue]="minute()"
            [zDisabled]="isDisabled() || !date()"
            (zSelectionChange)="selectTime('minute', $event)"
          >
            @for (item of minutes; track item) {
              <z-select-item [zValue]="item">{{ item }}</z-select-item>
            }
          </z-select>
        </div>
      </div>
    </div>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RetentionDateTimeComponent), multi: true }]
})
export class RetentionDateTimeComponent implements ControlValueAccessor {
  readonly label = input.required<string>()
  readonly zDisabled = input(false)
  readonly date = signal<Date | null>(null)
  readonly hour = signal('00')
  readonly minute = signal('00')
  readonly formDisabled = signal(false)
  readonly hours = Array.from({ length: 24 }, (_, index) => pad(index))
  readonly minutes = Array.from({ length: 60 }, (_, index) => pad(index))
  private onChange: (value: string) => void = () => {}
  private onTouched: () => void = () => {}

  isDisabled() {
    return this.zDisabled() || this.formDisabled()
  }

  writeValue(value: string | null) {
    const parsed = value ? new Date(value) : null
    const date = parsed && Number.isFinite(parsed.getTime()) ? parsed : null
    this.date.set(date)
    this.hour.set(pad(date?.getHours() ?? 0))
    this.minute.set(pad(date?.getMinutes() ?? 0))
  }

  registerOnChange(fn: (value: string) => void) {
    this.onChange = fn
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn
  }
  setDisabledState(disabled: boolean) {
    this.formDisabled.set(disabled)
  }

  selectDate(value: Date | null) {
    if (this.isDisabled()) return
    this.date.set(value)
    this.emitValue()
  }

  selectTime(part: 'hour' | 'minute', value: ZardSelectValue | ZardSelectValue[]) {
    if (this.isDisabled() || !this.date() || typeof value !== 'string') return
    if (!(part === 'hour' ? this.hours : this.minutes).includes(value)) return
    ;(part === 'hour' ? this.hour : this.minute).set(value)
    this.emitValue()
  }

  private emitValue() {
    const date = this.date()
    // Keep the local calendar value; the parent converts the validated range to ISO timestamps.
    this.onChange(
      date
        ? `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${this.hour()}:${this.minute()}`
        : ''
    )
    this.onTouched()
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}
