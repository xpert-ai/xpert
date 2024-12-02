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
    NxWidgetKpiComponent
  ],
  selector: 'pac-chat-component-message',
  templateUrl: './component-message.component.html',
  styleUrl: 'component-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageComponent {
  eSlicersCapacity = SlicersCapacity
  
  readonly #store = inject(Store)
  readonly chatService = inject(ChatService)
  readonly #dialog = inject(Dialog)
  readonly homeComponent = inject(ChatHomeComponent)

  readonly message = input<any>()

  readonly data = computed(() => this.message()?.data as any)

  readonly primaryTheme = toSignal(this.#store.primaryTheme$)

  readonly chartSettings = computed(() => {
    return {
      ...(this.data()?.chartSettings ?? {}),
      theme: this.primaryTheme()
    }
  })

  readonly dataSource = computed(() => {
    return this.data()?.dataSettings?.dataSource
  })

  readonly explains = signal<any[]>([])

  constructor() {
    effect(() => {
      if (this.dataSource()) {
        this.homeComponent.registerSemanticModel(this.dataSource())
      }
    }, { allowSignalWrites: true })
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
