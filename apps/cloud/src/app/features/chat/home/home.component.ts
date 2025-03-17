import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, ViewContainerRef } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DisappearBL, routeAnimations } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { ChatConversationService, injectToastr } from '../../../@core'
import { AppService } from '../../../app.service'
import { XpertHomeService } from '../../../xpert'
import { ChatCanvasComponent } from '../canvas/canvas.component'
import { ChatConversationsComponent } from '../conversations/conversations.component'
import { ChatHomeService } from '../home.service'
import { ChatXpertComponent } from '../xpert/xpert.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    CdkListboxModule,
    A11yModule,
    RouterModule,
    TranslateModule,
    MatSliderModule,
    MatTooltipModule,
    WaIntersectionObserver,
    NgmCommonModule,
  ],
  selector: 'pac-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations, DisappearBL],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    ChatHomeService,
    {
      provide: XpertHomeService,
      useExisting: ChatHomeService
    }
  ]
})
export class ChatHomeComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly conversationService = inject(ChatConversationService)
  readonly #elementRef = inject(ElementRef)
  readonly homeService = inject(ChatHomeService)
  readonly appService = inject(AppService)
  readonly route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly logger = inject(NGXLogger)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #toastr = injectToastr()

  readonly isMobile = this.appService.isMobile
  readonly lang = this.appService.lang

  readonly conversationId = this.homeService.conversationId
  
  readonly xpert = this.homeService.xpert
  
  readonly isBottom = signal(false)

  constructor() {
    effect(() => {
      if (this.homeService.messages()) {
        this.scrollBottom()
      }
    })

    this.#elementRef.nativeElement.addEventListener('scroll', (event: Event) => {
      this.onScroll(event)
    })
  }




  scrollBottom(smooth = false) {
    setTimeout(() => {
      this.#elementRef.nativeElement.scrollTo({
        top: this.#elementRef.nativeElement.scrollHeight,
        left: 0,
        behavior: smooth ? 'smooth' : 'instant'
      })
    }, 100)
  }

  onScroll(event: Event) {
    // Handle the scroll event
    const container = this.#elementRef.nativeElement
    this.isBottom.set(container.scrollTop + container.clientHeight >= container.scrollHeight - 10)
  }
}
