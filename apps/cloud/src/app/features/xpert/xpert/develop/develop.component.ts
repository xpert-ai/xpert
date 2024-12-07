import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  AfterRenderPhase,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { injectApiBaseUrl, routeAnimations } from '../../../../@core'
import { XpertComponent } from '../xpert.component'
import { XpertDevelopApiKeyComponent } from './api-key/api-key.component'
import customerApiDoc from './openapi.json'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, RouterModule, MatTooltipModule],
  selector: 'xpert-develop',
  templateUrl: './develop.component.html',
  styleUrl: 'develop.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertDevelopComponent {
  readonly xpertComponent = inject(XpertComponent)
  readonly #dialog = inject(Dialog)
  readonly #clipboard = inject(Clipboard)
  readonly apiBaseUrl = injectApiBaseUrl() + '/api/ai/'

  readonly swaggerUIContainer = viewChild('swaggeruiContainer', { read: ElementRef })

  readonly xpertId = this.xpertComponent.paramId

  readonly copied = signal(false)

  constructor() {
    afterNextRender(
      () => {
        const apiDocumentation = {
          ...customerApiDoc,
          servers: [
            {
              url: this.apiBaseUrl
            }
          ]
        }

        import('swagger-ui').then(({default: SwaggerUI}) => {
          SwaggerUI({
            spec: apiDocumentation,
            domNode: this.swaggerUIContainer().nativeElement
          })
        })
   
      },
      { phase: AfterRenderPhase.Write }
    )
  }

  openApiKey() {
    this.#dialog
      .open(XpertDevelopApiKeyComponent, {
        data: {
          xpertId: this.xpertId()
        }
      })
      .closed.subscribe({
        next: (token) => {
          // console.log(token)
        }
      })
  }

  copy(content: string) {
    this.copied.set(true)
    this.#clipboard.copy(content)
    setTimeout(() => {
      this.copied.set(false)
    }, 2000)
  }
}
