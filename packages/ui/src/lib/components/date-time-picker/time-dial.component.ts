import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { injectUiI18nService } from '../../core/i18n/ui-i18n.service'
import { XpDialogActionGroupDirective } from '../dialog/dialog-action-group.directive'
import { ZardButtonComponent } from '../button/button.component'
import { isValidTime } from './date-time.utils'

type TimePart = 'hour' | 'minute'
const twoDigits = (value: number) => String(value).padStart(2, '0')
const position = (angle: number, radius: number) => ({
  x: 50 + Math.sin((angle * Math.PI) / 180) * radius,
  y: 50 - Math.cos((angle * Math.PI) / 180) * radius
})

@Component({
  standalone: true,
  selector: 'z-time-dial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [XpDialogActionGroupDirective, ZardButtonComponent],
  host: { class: 'block space-y-3' },
  template: `
    <div class="flex items-center justify-center gap-2" xpDialogActionGroup="inline">
      <button
        z-button
        type="button"
        [zType]="part() === 'hour' ? 'default' : 'secondary'"
        [disabled]="disabled()"
        [attr.aria-pressed]="part() === 'hour'"
        (click)="part.set('hour')"
      >
        {{ labels().hour }} {{ hourText() }}
      </button>
      <span aria-hidden="true">:</span>
      <button
        z-button
        type="button"
        [zType]="part() === 'minute' ? 'default' : 'secondary'"
        [disabled]="disabled()"
        [attr.aria-pressed]="part() === 'minute'"
        (click)="part.set('minute')"
      >
        {{ labels().minute }} {{ minuteText() }}
      </button>
    </div>
    <div
      #dial
      role="slider"
      [attr.tabindex]="disabled() ? -1 : 0"
      [attr.aria-label]="part() === 'hour' ? labels().selectHour : labels().selectMinute"
      aria-valuemin="0"
      [attr.aria-valuemax]="part() === 'hour' ? 23 : 59"
      [attr.aria-valuenow]="selected()"
      [attr.aria-valuetext]="hourText() + ':' + minuteText()"
      [attr.aria-disabled]="disabled()"
      [class]="disabled() ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
      class="relative mx-auto aspect-square w-[260px] max-w-full touch-none select-none rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      (pointerdown)="start($event)"
      (pointermove)="move($event)"
      (pointerup)="finish($event)"
      (pointercancel)="cancel($event)"
      (lostpointercapture)="dragging = null"
      (keydown)="onKeydown($event)"
    >
      <svg
        viewBox="0 0 100 100"
        class="pointer-events-none absolute inset-0 size-full overflow-visible"
        aria-hidden="true"
      >
        <line x1="50" y1="50" [attr.x2]="hand().x" [attr.y2]="hand().y" class="stroke-primary" stroke-width="0.8" />
        <circle cx="50" cy="50" r="1.5" class="fill-primary" />
        <circle
          [attr.cx]="hand().x"
          [attr.cy]="hand().y"
          [attr.r]="part() === 'minute' && selected() % 5 ? 2 : 6"
          class="fill-primary"
        />
      </svg>
      @for (tick of ticks(); track tick.value) {
        <span
          aria-hidden="true"
          class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none tabular-nums"
          [style.left.%]="tick.x"
          [style.top.%]="tick.y"
          [class]="tick.value === selected() ? 'font-medium text-primary-foreground' : 'text-foreground'"
        >
          {{ tick.label }}
        </span>
      }
    </div>
    <p class="text-center text-xs text-muted-foreground">{{ labels().hint }}</p>
  `
})
export class ZardTimeDialComponent {
  private readonly dial = viewChild.required('dial', { read: ElementRef<HTMLElement> })
  private readonly i18n = injectUiI18nService()
  protected readonly labels = computed(() => ({
    hour: this.i18n.t('xp-ui:dateTimePicker.hour', { Default: 'Hour' }),
    minute: this.i18n.t('xp-ui:dateTimePicker.minute', { Default: 'Minute' }),
    selectHour: this.i18n.t('xp-ui:dateTimePicker.selectHour', { Default: 'Select hour (24-hour clock)' }),
    selectMinute: this.i18n.t('xp-ui:dateTimePicker.selectMinute', { Default: 'Select minute' }),
    hint: this.i18n.t('xp-ui:dateTimePicker.clockHint', {
      Default: 'Choose the hour, then the minute. Drag the hand or use arrow keys.'
    })
  }))
  readonly value = input('00:00')
  readonly disabled = input(false)
  readonly valueChange = output<string>()
  readonly part = signal<TimePart>('hour')
  readonly parts = computed(() => (isValidTime(this.value()) ? this.value().split(':').map(Number) : [0, 0]))
  readonly hourText = computed(() => twoDigits(this.parts()[0]))
  readonly minuteText = computed(() => twoDigits(this.parts()[1]))
  readonly selected = computed(() => this.parts()[this.part() === 'hour' ? 0 : 1])
  readonly ticks = computed(() =>
    Array.from({ length: this.part() === 'hour' ? 24 : 12 }, (_, index) => {
      const value = this.part() === 'hour' ? index : index * 5
      return {
        value,
        label: twoDigits(value),
        ...position(this.part() === 'hour' ? value * 30 : value * 6, this.radius(value))
      }
    })
  )
  readonly hand = computed(() =>
    position(this.selected() * (this.part() === 'hour' ? 30 : 6), this.radius(this.selected()))
  )
  dragging: number | null = null

  focus() {
    this.dial().nativeElement.focus()
  }

  private radius(value: number) {
    return this.part() === 'hour' && (value === 0 || value > 12) ? 26 : 40
  }
  private choose(value: number) {
    if (this.disabled()) return
    const [hour, minute] = this.parts()
    this.valueChange.emit(
      this.part() === 'hour' ? `${twoDigits(value)}:${twoDigits(minute)}` : `${twoDigits(hour)}:${twoDigits(value)}`
    )
  }
  private point(event: PointerEvent) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    const distance = Math.hypot(x, y)
    if (!rect.width || distance < rect.width * 0.1) return
    const angle = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360
    if (this.part() === 'minute') {
      this.choose(Math.round(angle / 6) % 60)
    } else {
      const hour = Math.round(angle / 30) % 12
      this.choose(distance < rect.width * 0.33 ? (hour === 0 ? 0 : hour + 12) : hour === 0 ? 12 : hour)
    }
  }
  start(event: PointerEvent) {
    if (this.disabled() || event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    this.dragging = event.pointerId
    this.point(event)
  }
  move(event: PointerEvent) {
    if (this.dragging === event.pointerId) this.point(event)
  }
  finish(event: PointerEvent) {
    if (this.dragging !== event.pointerId) return
    this.point(event)
    this.cancel(event)
    if (!this.disabled() && this.part() === 'hour') this.part.set('minute')
  }
  cancel(event: PointerEvent) {
    if (this.dragging !== event.pointerId) return
    this.dragging = null
    if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  onKeydown(event: KeyboardEvent) {
    const maximum = this.part() === 'hour' ? 23 : 59
    const key = event.key
    if (
      this.disabled() ||
      !['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(key)
    )
      return
    event.preventDefault()
    if (key === 'Enter' || key === ' ') {
      this.part.set('minute')
    } else if (key === 'Home' || key === 'End') {
      this.choose(key === 'Home' ? 0 : maximum)
    } else {
      const delta = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1
      this.choose((this.selected() + delta + maximum + 1) % (maximum + 1))
    }
  }
}
