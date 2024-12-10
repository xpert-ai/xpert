import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostBinding,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { CopilotChatMessage } from '@metad/copilot'
import { NgmSelectComponent } from '@metad/ocap-angular/common'
import { nonBlank, provideOcapCore } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { groupBy } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { filter, map, switchMap, tap } from 'rxjs'
import { ChatBIConversationService, routeAnimations } from '../../@core'
import { AppService } from '../../app.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
    NgmSelectComponent,
  ],
  selector: 'pac-chatbi-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideOcapCore()]
})
export class DataFactoryHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly conversationService = inject(ChatBIConversationService)
  readonly appService = inject(AppService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  
}
