import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { DensityDirective, NgmSmartFilterBarService } from '@metad/ocap-angular/core'
import { TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { AbstractStoryWidget } from '@metad/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgmTimeFilterModule } from '@metad/ocap-angular/controls'

export interface TodayWidgetOptions {
  granularity: TimeGranularity
  granularitySequence: number
  defaultValue: string
}

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, ReactiveFormsModule, DensityDirective, NgmTimeFilterModule],
  selector: 'ngm-story-widget-today',
  templateUrl: './today.component.html',
  styleUrls: ['./today.component.scss']
})
export class WidgetTodayComponent extends AbstractStoryWidget<TodayWidgetOptions> {
  private readonly filterBar = inject(NgmSmartFilterBarService)

  today = new FormControl(new Date())

  private todaySub = this.today.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
    this.filterBar.go()
  })
}
