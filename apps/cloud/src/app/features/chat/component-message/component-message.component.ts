import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, ViewContainerRef } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NxWidgetKpiComponent } from '@metad/story/widgets/kpi'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { Store } from '../../../@core'
import { ChatService } from '../chat.service'
import { ChatHomeComponent } from '../home.component'
import { Dialog } from '@angular/cdk/dialog'
import { ExplainComponent } from '@metad/story/story'
import { CdkMenuModule } from '@angular/cdk/menu'
import { NgmSelectionModule, SlicersCapacity } from '@metad/ocap-angular/selection'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { DataSettings, TimeGranularity } from '@metad/ocap-core'
import { NgmIndicatorComponent } from '@metad/ocap-angular/indicator'
import { compact, uniq } from 'lodash-es'
import { StoryExplorerComponent } from '@metad/story'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
    MarkdownModule,
    NgmCommonModule,
    NgmSelectionModule,
    AnalyticalCardModule,
    NxWidgetKpiComponent,
    NgmIndicatorComponent
],
  selector: 'pac-chat-component-message',
  templateUrl: './component-message.component.html',
  styleUrl: 'component-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageComponent {
  eSlicersCapacity = SlicersCapacity
  eTimeGranularity = TimeGranularity
  
  readonly #store = inject(Store)
  readonly chatService = inject(ChatService)
  readonly #dialog = inject(Dialog)
  readonly homeComponent = inject(ChatHomeComponent)
  readonly dsCore = inject(NgmDSCoreService)
  readonly #viewContainerRef = inject(ViewContainerRef)

  readonly message = input<any>()

  readonly data = computed(() => this.message()?.data as any)

  readonly primaryTheme = toSignal(this.#store.primaryTheme$)

  readonly chartSettings = computed(() => {
    return {
      ...(this.data()?.chartSettings ?? {}),
      theme: this.primaryTheme()
    }
  })

  readonly dataSettings = computed(() => this.data()?.dataSettings as DataSettings)
  readonly indicator = computed(() => this.data()?.indicator)
  readonly dataSource = computed(() => this.dataSettings()?.dataSource)
  readonly indicators = computed(() => this.data()?.indicators)
  readonly slicers = computed(() => this.data()?.slicers)
  readonly dataSources = computed(() => compact(uniq<string>(this.indicators()?.map((_) => _.dataSource))))

  readonly explains = signal<any[]>([])

  // readonly entityType = derivedAsync(() => {
  //   const dataSettings = this.dataSettings()
  //   return dataSettings ? this.dsCore.selectEntitySet(dataSettings.dataSource, dataSettings.entitySet) : of(null)
  // })

  constructor() {
    effect(() => {
      if (this.dataSource()) {
        this.homeComponent.registerSemanticModel(this.dataSource())
      }
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.dataSources()) {
        this.dataSources().forEach((dataSource) => {
          this.homeComponent.registerSemanticModel(dataSource)
        })
      }
    }, { allowSignalWrites: true })

    effect(() => {
      // console.log(this.entityType())
    })
  }

  setExplains(items: unknown[]) {
    this.explains.set(items)
  }

  openExplain() {
    this.#dialog.open(ExplainComponent, {
      data: this.explains(),
    })
  }

  // State updaters
  setSelectOptions(data, slicers) {
    data.slicers = slicers
  }

  openExplorer() {
    this.#dialog.open(StoryExplorerComponent, {
      viewContainerRef: this.#viewContainerRef,
      data: {
        data: {
          dataSettings: this.dataSettings(),
          slicers: this.slicers()
        }
      }
    }).closed.subscribe({
      next: (result) => {
        if (result) {
          console.log(result)

        }
      }
    })
  }
}
