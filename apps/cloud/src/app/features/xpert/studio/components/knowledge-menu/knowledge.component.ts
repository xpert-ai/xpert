import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { XpertStudioApiService } from '../../domain'
import { toSignal } from '@angular/core/rxjs-interop'
import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { XpertStudioComponent } from '../../studio.component'
import { IKnowledgebase } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { TranslateModule } from '@ngx-translate/core'
import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay'
import { KnowledgebaseCardComponent } from 'apps/cloud/src/app/@shared/copilot'

@Component({
  selector: 'xpert-studio-knowledge-menu',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, CdkMenuModule, OverlayModule, EmojiAvatarComponent, KnowledgebaseCardComponent],
  host: {
    tabindex: '-1',
    '[class.selected]': 'isSelected',
    '(contextmenu)': 'emitSelectionChangeEvent($event)'
  }
})
export class XpertStudioKnowledgeMenuComponent {
  readonly elementRef = inject(ElementRef)
  readonly cdkMenu = inject(CdkMenu)
  private root = inject(XpertStudioComponent)
  readonly apiService = inject(XpertStudioApiService)

  readonly knowledges = toSignal(this.apiService.knowledgebases$)

  private get hostElement(): HTMLElement {
    return this.elementRef.nativeElement
  }

  readonly detailTrigger = signal<CdkOverlayOrigin>(null)
  readonly detailOpen = signal(false)
  readonly knowledgebase = signal<IKnowledgebase>(null)

  protected emitSelectionChangeEvent(event: MouseEvent): void {
    this.hostElement.focus()
    event.preventDefault()
  }

  public createKnowledge(knowledge: IKnowledgebase): void {
    this.cdkMenu.menuStack.closeAll()
    this.apiService.createKnowledge(this.root.contextMenuPosition, knowledge)
  }

  openTooltip(item: IKnowledgebase, overlayTrigger: CdkOverlayOrigin) {
    this.detailOpen.set(true)
    this.detailTrigger.set(overlayTrigger)
    this.knowledgebase.set(item)
  }
}
