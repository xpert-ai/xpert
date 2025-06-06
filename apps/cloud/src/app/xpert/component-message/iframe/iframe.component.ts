import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { RouterModule } from '@angular/router'
import { TMessageComponent, TMessageComponentIframe } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertHomeService } from '../../home.service'

@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, RouterModule, TranslateModule, MatTooltipModule],
  selector: 'chat-component-message-iframe',
  templateUrl: './iframe.component.html',
  styleUrl: 'iframe.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageIframeComponent {
  readonly homeService = inject(XpertHomeService)
  readonly #dialog = inject(Dialog)
  readonly sanitizer = inject(DomSanitizer)

  // Inputs
  readonly data = input<TMessageComponent<TMessageComponentIframe>>()

  // Safe URL
  readonly url = computed<SafeResourceUrl | null>(() => {
    const rawUrl = this.data()?.url
    return rawUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl) : null
  })

  openTab() {
    window.open(this.data().url, '_blank')
  }
}
