import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDateFnsModule, provideDateFnsAdapter } from '@angular/material-date-fns-adapter'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { TaskFrequency, TScheduleOptions } from '@cloud/app/@core'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { format, parse } from 'date-fns'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

@Component({
  selector: 'xp-schedule-form',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    CdkMenuModule,
    MatDatepickerModule,
    MatDateFnsModule
  ],
  templateUrl: './form.component.html',
  styleUrl: './form.component.scss',
  hostDirectives: [NgxControlValueAccessor],
  providers: [
    provideDateFnsAdapter({
      parse: {
        dateInput: 'MM-dd'
      },
      display: {
        dateInput: 'MM-dd',
        monthYearLabel: 'LLL',
        dateA11yLabel: 'MMMM d',
        monthYearA11yLabel: 'MMMM'
      }
    })
  ]
})
export class ScheduleFormComponent {
  eTaskFrequency = TaskFrequency

  protected cva = inject<NgxControlValueAccessor<TScheduleOptions>>(NgxControlValueAccessor)

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
  readonly dayOfWeek = attrModel(this.options, 'dayOfWeek')
  readonly dayOfMonth = attrModel(this.options, 'dayOfMonth')

  readonly date = linkedModel({
    initialValue: null,
    compute: () => parse(this.options().date, 'yyyy-MM-dd', new Date()),
    update: (value) => {
      this.options.update((opt) => ({
        ...opt,
        date: format(value, 'yyyy-MM-dd')
      }))
    }
  })

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
      value: 0,
      label: 'Sunday'
    }
  ]

  selectDay(day: number) {
    this.dayOfWeek.set(day)
  }
}
