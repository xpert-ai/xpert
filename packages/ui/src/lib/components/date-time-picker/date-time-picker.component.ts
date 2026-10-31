import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  forwardRef,
  inject,
  Injector,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import type { ClassValue } from 'clsx'
import { injectUiI18nService } from '../../core/i18n/ui-i18n.service'
import { mergeClasses } from '../../utils/merge-classes'
import { ZardButtonComponent } from '../button/button.component'
import { ZardCalendarComponent } from '../calendar/calendar.component'
import { XpDialogActionGroupDirective } from '../dialog/dialog-action-group.directive'
import { XpDialogControlDirective } from '../dialog/dialog-frame.directive'
import { ZardFormLabelComponent } from '../form/form.component'
import { ZardIconComponent } from '../icon/icon.component'
import { ZardInputDirective } from '../input/input.directive'
import { ZardPopoverComponent, ZardPopoverDirective } from '../popover/popover.component'
import { ZardTimeDialComponent } from './time-dial.component'
import { isValidTime } from './date-time.utils'
import { dateTimeCalendarClasses } from './date-time-picker.variants'

function localDay(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}
function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

@Component({
  standalone: true,
  selector: 'z-date-time-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    XpDialogActionGroupDirective,
    XpDialogControlDirective,
    ZardButtonComponent,
    ZardCalendarComponent,
    ZardFormLabelComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardPopoverComponent,
    ZardPopoverDirective,
    ZardTimeDialComponent
  ],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ZardDateTimePickerComponent), multi: true }],
  host: { '[class]': 'hostClasses()', '(focusout)': 'touch()' },
  exportAs: 'zDateTimePicker',
  template: ` <button
      #trigger
      z-button
      zType="outline"
      xpDialogControl="single"
      type="button"
      class="w-full justify-start text-left font-normal"
      [disabled]="disabled()"
      zPopover
      #popover="zPopover"
      [zContent]="picker"
      [zTrigger]="disabled() ? null : 'click'"
      (zVisibleChange)="onVisibleChange($event)"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      [attr.aria-label]="label() ? label() + ': ' + displayText() : displayText()"
    >
      <z-icon zType="calendar" />
      <span [class]="value() ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate text-muted-foreground'">
        {{ displayText() }}
      </span>
      <z-icon zType="chevron-down" class="shrink-0 text-muted-foreground" />
    </button>
    <ng-template #picker>
      <z-popover
        role="dialog"
        [attr.aria-label]="labels().chooseDateTime"
        class="block max-h-[calc(100dvh-2rem)] w-[600px] max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
      >
        <div class="grid gap-4 p-4 sm:grid-cols-2">
          <z-calendar
            [class]="calendarClasses"
            [value]="draftDate()"
            [disabled]="disabled()"
            (dateChange)="setDate($event)"
          />
          <div class="min-w-0 space-y-3 border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
            <z-time-dial [value]="draftTime()" [disabled]="disabled()" (valueChange)="draftTime.set($event)" />
            <div class="flex items-center gap-3">
              <label z-form-label class="shrink-0" [attr.for]="timeInputId">{{ labels().time }}</label>
              <input
                z-input
                [id]="timeInputId"
                class="min-w-0 flex-1"
                type="text"
                placeholder="HH:mm"
                maxlength="5"
                [value]="draftTime()"
                [disabled]="disabled()"
                [zStatus]="validTime() ? undefined : 'error'"
                (input)="setTime($event)"
                (keydown.enter)="$event.preventDefault(); apply()"
              />
            </div>
            @if (!validTime()) {
              <p role="status" class="text-sm text-destructive">{{ labels().timeFormat }}</p>
            }
          </div>
        </div>
        <div
          class="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-popover px-4 py-3"
          xpDialogActionGroup="inline"
        >
          @if (clearable()) {
            <button z-button zType="ghost" type="button" [disabled]="disabled()" (click)="clear()">
              {{ clearLabel() || labels().clear }}
            </button>
          }
          <button z-button zType="secondary" type="button" [disabled]="disabled()" (click)="now()">
            {{ labels().now }}
          </button>
          <button z-button type="button" [disabled]="disabled() || !validTime() || !draftDate()" (click)="apply()">
            {{ labels().confirm }}
          </button>
        </div>
      </z-popover>
    </ng-template>`
})
export class ZardDateTimePickerComponent implements ControlValueAccessor {
  private static nextId = 0
  readonly timeInputId = `z-date-time-${++ZardDateTimePickerComponent.nextId}`
  private readonly injector = inject(Injector)
  private readonly popover = viewChild.required<ZardPopoverDirective>('popover')
  private readonly trigger = viewChild.required('trigger', { read: ElementRef<HTMLButtonElement> })
  private readonly timeDial = viewChild(ZardTimeDialComponent)
  private readonly calendar = viewChild(ZardCalendarComponent)
  private readonly i18n = injectUiI18nService()
  private readonly disabledByForm = signal(false)
  readonly class = input<ClassValue>('')
  readonly label = input('')
  readonly placeholder = input<string | null>(null)
  readonly clearLabel = input('')
  readonly clearable = input(false, { transform: booleanAttribute })
  readonly disabledInput = input(false, { alias: 'disabled', transform: booleanAttribute })
  /** Local wall time in YYYY-MM-DDTHH:mm; empty string means no selection. No UTC conversion. */
  readonly value = model('')
  readonly open = signal(false)
  readonly draftDate = signal<Date | null>(null)
  readonly draftTime = signal('00:00')
  readonly disabled = computed(() => this.disabledInput() || this.disabledByForm())
  readonly displayValue = computed(() => this.value().replace('T', ' '))
  readonly validTime = computed(() => isValidTime(this.draftTime()))
  protected readonly calendarClasses = dateTimeCalendarClasses
  protected readonly hostClasses = computed(() => mergeClasses('block', this.class()))
  protected readonly labels = computed(() => ({
    chooseDateTime: this.i18n.t('xp-ui:dateTimePicker.chooseDateTime', { Default: 'Choose date and time' }),
    time: this.i18n.t('xp-ui:dateTimePicker.time', { Default: 'Time' }),
    timeFormat: this.i18n.t('xp-ui:dateTimePicker.timeFormat', { Default: 'Use HH:mm, for example 09:30.' }),
    clear: this.i18n.t('xp-ui:dateTimePicker.clear', { Default: 'Clear' }),
    now: this.i18n.t('xp-ui:dateTimePicker.now', { Default: 'Now' }),
    confirm: this.i18n.t('xp-ui:dateTimePicker.confirm', { Default: 'Confirm' })
  }))
  protected readonly displayText = computed(() =>
    this.value() ? this.displayValue() : (this.placeholder() ?? this.labels().chooseDateTime)
  )
  private onChange: (value: string) => void = () => {}
  private onTouched: () => void = () => {}

  constructor() {
    effect(() => {
      if (this.disabled() && this.open()) this.popover().hide()
    })
  }
  writeValue(value: string | null) {
    this.value.set(value ?? '')
  }
  registerOnChange(fn: (value: string) => void) {
    this.onChange = fn
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn
  }
  setDisabledState(value: boolean) {
    this.disabledByForm.set(value)
    if (value && this.open()) this.popover().hide()
  }
  touch() {
    this.onTouched()
  }
  onVisibleChange(visible: boolean) {
    this.open.set(visible)
    if (!visible) return
    const parsed = this.value() ? new Date(this.value()) : new Date()
    const date = Number.isFinite(parsed.getTime()) ? parsed : new Date()
    this.draftDate.set(date)
    this.draftTime.set(localTime(date))
    afterNextRender(
      () => {
        if (!this.open()) return
        this.calendar()?.resetNavigation()
        this.timeDial()?.focus()
      },
      { injector: this.injector }
    )
  }
  setDate(value: Date | Date[]) {
    if (!this.disabled() && value instanceof Date) this.draftDate.set(value)
  }
  setTime(event: Event) {
    if (!this.disabled() && event.target instanceof HTMLInputElement) this.draftTime.set(event.target.value)
  }
  now() {
    if (this.disabled()) return
    const date = new Date()
    this.draftDate.set(date)
    this.draftTime.set(localTime(date))
    this.calendar()?.resetNavigation()
  }
  apply() {
    const date = this.draftDate()
    if (this.disabled() || !date || !this.validTime()) return
    this.commit(`${localDay(date)}T${this.draftTime()}`)
  }
  clear() {
    if (!this.disabled() && this.clearable()) this.commit('')
  }
  private commit(value: string) {
    this.value.set(value)
    this.onChange(value)
    this.onTouched()
    this.popover().hide()
    this.trigger().nativeElement.focus()
  }
}
