import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { NgmIndicatorComponent, NgmIndicatorExplorerComponent } from '@metad/ocap-angular/indicator'
import { DataSettings, IndicatorTagEnum, TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,

    NgmIndicatorComponent,
    NgmIndicatorExplorerComponent
  ],
  selector: 'pac-chat-component-indicators',
  templateUrl: './indicators.component.html',
  styleUrl: 'indicators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentIndicatorsComponent {
  eTimeGranularity = TimeGranularity

  // Inputs
  readonly indicators = input<Array<Pick<DataSettings, 'dataSource'> & Pick<DataSettings, 'entitySet'> & { indicatorCode: string }>>()

  // States
  readonly pageSize = signal(5)
  readonly pageNo = signal(0)

  readonly showIndicators = computed(() => {
    return this.indicators()?.slice(0, (this.pageNo() + 1) * this.pageSize())
  })

  readonly hasMore = computed(() => this.indicators().length > (this.pageNo() + 1) * this.pageSize())

  readonly indicatorExplorer = signal<string>(null)
  readonly indicatorTagType = signal<IndicatorTagEnum>(IndicatorTagEnum.MOM)

  toggleIndicatorTagType() {
    this.indicatorTagType.update((tagType) => {
      if (IndicatorTagEnum[tagType + 1]) {
        return tagType + 1
      } else {
        return IndicatorTagEnum[IndicatorTagEnum[0]] // Ensure to start from 0
      }
    })
  }

  toggleIndicator(indicator: string) {
    this.indicatorExplorer.update((state) => (state === indicator ? null : indicator))
  }

  showMore() {
    this.pageNo.update((currentPage) => currentPage + 1)
  }

  showLess() {
    this.pageNo.update((currentPage) => currentPage - 1)
  }
}
