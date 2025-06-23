import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
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
  readonly sanitizer = inject(DomSanitizer)

  // Inputs
  readonly data = input<TMessageComponent>()

  readonly _url = computed(() => (<TMessageComponent<TMessageComponentIframe>>this.data())?.url)
  readonly title = computed(() => (<TMessageComponent<TMessageComponentIframe>>this.data())?.title)

  // Safe URL
  readonly url = computed<SafeResourceUrl | null>(() => {
    const rawUrl = this._url()
    return rawUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl) : null
  })

  openTab() {
    window.open(this._url(), '_blank')
  }
}
