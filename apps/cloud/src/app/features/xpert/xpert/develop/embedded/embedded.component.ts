import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Clipboard } from '@angular/cdk/clipboard'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { IXpert } from '@metad/contracts'
import { routeAnimations } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectToastr } from 'apps/cloud/src/app/@core'

export type EmbeddedType = 'iframe' | 'scripts' | 'chromeplugin'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, RouterModule, MatTooltipModule, NgmI18nPipe],
  selector: 'xpert-develop-embedded',
  templateUrl: './embedded.component.html',
  styleUrl: 'embedded.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertDevelopEmbeddedComponent {

  readonly #data = inject<{xpert: IXpert}>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()

  types = [
    {
      value: 'iframe',
      image: 'iframe-option.svg'
    },
    {
      value: 'scripts',
      image: 'scripts-option.svg'
    },
    {
      value: 'chromeplugin',
      image: 'chromeplugin-option.svg'
    }
  ] as {value: EmbeddedType; image: string}[]

  readonly selectedType = signal<EmbeddedType>('iframe')
  readonly xpert = signal(this.#data.xpert)
  readonly baseUrl = signal(window.location.origin)
  readonly appUrl = computed(() => this.baseUrl() + '/x/' + this.xpert()?.slug)

  readonly app = computed(() => {
    const type = this.selectedType()
    switch(type) {
      case 'iframe': {
        return {
          code: `<iframe
 src="${this.appUrl()}"
 style="width: 100%; height: 100%; min-height: 700px"
 frameborder="0"
 allow="microphone">
</iframe>`,
          caption: {
            en_US: `To add the chat app any where on your website, add this iframe to your html code.`,
            zh_Hans: `要在您网站的任何位置添加聊天应用程序，请将此 iframe 添加到您的 html 代码中。`
          }
        }
      }
      case 'scripts': {
        return {
          code: `<script>
 window.xpertConfig = {
  token: '${this.xpert()?.slug}',
  baseUrl: '${this.baseUrl()}'
 }
</script>
<script
 src="${this.baseUrl()}/assets/embed.min.js"
 id="${this.xpert()?.slug}"
 defer>
</script>
<style>
  #xpert-bubble-button {
    background-color: #1C64F2 !important;
  }
  #xpert-bubble-window {
    width: 28rem !important;
    height: 40rem !important;
    max-height: calc(100vh - 100px);
  }
</style>`,
          caption: {
            en_US: `To add a chat app to the bottom right of your website add this code to your html.`,
            zh_Hans: `要将聊天应用程序添加到您的网站右下角，请将此代码添加到您的 html。`
          }
        }
      }
      case 'chromeplugin': {
        return {
          code: `xxxx`,
          caption: {
            en_US: `Coming soon`,
            zh_Hans: `即将推出`
          }
        }
      }
    }
  })

  copy() {
    this.#clipboard.copy(this.app().code)
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
  }

  close() {
    this.#dialogRef.close()
  }
}
