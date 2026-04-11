
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core'
import { ChartAnnotation, ChartDimensionRoleType, ChartOrient } from '@xpert-ai/ocap-core'
import { NxChartType } from '@xpert-ai/core'

@Component({
  standalone: true,
  imports: [],
  selector: 'pac-analytical-chart-placeholder',
  templateUrl: 'chart-placeholder.component.html',
  styleUrls: ['chart-placeholder.component.scss']
})
export class AnalyticalChartPlaceholderComponent implements OnChanges {
  CHART_TYPE = NxChartType

  @Input() chartAnnotation: ChartAnnotation

  chartType: string

  ngOnChanges({ chartAnnotation }: SimpleChanges): void {
    if (chartAnnotation?.currentValue) {
      const chartType = chartAnnotation.currentValue.chartType
      if (chartType?.type === 'Bar') {
        if (chartType.orient === ChartOrient.horizontal) {
          this.chartType = NxChartType.Bar
        } else {
          if (this.chartAnnotation.dimensions.find((d) => d.role === ChartDimensionRoleType.Stacked)) {
            this.chartType = NxChartType.ColumnStacked
          } else {
            this.chartType = NxChartType.Column
          }
        }
      } else if (chartType?.type === NxChartType.Pie) {
        this.chartType = chartType.variant || chartType.type
      } else {
        this.chartType = chartType?.type
      }
    }
  }
}
