import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
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
import { derivedAsync } from 'ngxtension/derived-async'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { DataSettings, TimeGranularity } from '@metad/ocap-core'
import { of } from 'rxjs'
import { NgmIndicatorComponent } from '@metad/ocap-angular/indicator'

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

  readonly explains = signal<any[]>([])

  readonly entityType = derivedAsync(() => {
    const dataSettings = this.dataSettings()
    return dataSettings ? this.dsCore.selectEntitySet(dataSettings.dataSource, dataSettings.entitySet) : of(null)
  })

  constructor() {
    effect(() => {
      if (this.dataSource()) {
        this.homeComponent.registerSemanticModel(this.dataSource())
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
}
