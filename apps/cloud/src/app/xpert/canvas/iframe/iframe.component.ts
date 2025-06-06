import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { TChatMessageStep, TFile } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertHomeService } from '../../home.service'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'chat-canvas-iframe',
  templateUrl: './iframe.component.html',
  styleUrl: 'iframe.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasIframeComponent {
  readonly homeService = inject(XpertHomeService)
  readonly sanitizer = inject(DomSanitizer)

  // Inputs
  readonly step = input<TChatMessageStep<TFile>>()

  // Safe URL
  readonly url = computed<SafeResourceUrl | null>(() => {
    const rawUrl = this.step()?.data?.url
    return rawUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl) : null
  })

  openTab() {
    window.open(this.step()?.data?.url, '_blank')
  }
}
