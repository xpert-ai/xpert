import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { TaskFrequency, ToastrService, TScheduleOptions } from '@cloud/app/@core'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

@Component({
  selector: 'xp-schedule-form',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    CdkMenuModule,
    MatDatepickerModule
  ],
  templateUrl: './form.component.html',
  styleUrl: './form.component.scss',
  hostDirectives: [ NgxControlValueAccessor ]
})
export class ScheduleFormComponent {
  eTaskFrequency = TaskFrequency

  protected cva = inject<NgxControlValueAccessor<TScheduleOptions>>(NgxControlValueAccessor)
  readonly #toastr = inject(ToastrService)

  readonly options = this.cva.value$
  readonly frequency = attrModel(this.options, 'frequency', TaskFrequency.Once)
  readonly _frequency = linkedModel({
    initialValue: [TaskFrequency.Once],
    compute: () => (this.frequency() ? [this.frequency()] : [TaskFrequency.Once]),
    update: (value) => {
      this.frequency.update(() => value?.[0])
    }
  })
  readonly time = attrModel(this.options, 'time')
  readonly date = attrModel(this.options, 'date')
  readonly dayOfWeek = attrModel(this.options, 'dayOfWeek')
  readonly dayOfMonth = attrModel(this.options, 'dayOfMonth')

  readonly dayLabel = computed(
    () => this.WEEKLY_OPTIONS.find((option) => option.value === this.dayOfWeek())?.label || 'Select Day'
  )

  readonly FREQUENCY_OPTIONS = Object.values(TaskFrequency).map((frequency) => ({
    label: frequency,
    value: frequency
  }))

  readonly WEEKLY_OPTIONS = [
    {
      value: 1,
      label: 'Monday'
    },
    {
      value: 2,
      label: 'Tuesday'
    },
    {
      value: 3,
      label: 'Wednesday'
    },
    {
      value: 4,
      label: 'Thursday'
    },
    {
      value: 5,
      label: 'Friday'
    },
    {
      value: 6,
      label: 'Saturday'
    },
    {
      value: 7,
      label: 'Sunday'
    }
  ]

  readonly loading = signal(false)

  selectDay(day: number) {
    this.dayOfWeek.set(day)
  }
}
