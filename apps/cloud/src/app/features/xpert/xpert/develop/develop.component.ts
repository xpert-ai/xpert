import { CommonModule } from '@angular/common'
import { afterNextRender, afterRender, AfterRenderPhase, ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { injectApiBaseUrl, routeAnimations } from '../../../../@core'
import { Dialog } from '@angular/cdk/dialog'
import { XpertDevelopApiKeyComponent } from './api-key/api-key.component'
import { XpertComponent } from '../xpert.component'
import SwaggerUI from 'swagger-ui';
import customerApiDoc from './openapi.json'


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, RouterModule],
  selector: 'xpert-develop',
  templateUrl: './develop.component.html',
  styleUrl: 'develop.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpertDevelopComponent {
  readonly xpertComponent = inject(XpertComponent)
  readonly #dialog = inject(Dialog)
  readonly #elementRef = inject(ElementRef)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly swaggerUIContainer = viewChild('swaggeruiContainer', { read: ElementRef })

  readonly xpertId = this.xpertComponent.paramId

  constructor() {
    afterNextRender(() => {
      console.log(customerApiDoc)
      const apiDocumentation = {...customerApiDoc, 
        "servers": [
          {
            "url": this.apiBaseUrl + '/api/ai/'
          }
        ],
       }
      const ui = SwaggerUI({
        spec: apiDocumentation,
        domNode: this.swaggerUIContainer().nativeElement,
      })
    }, { phase: AfterRenderPhase.Write })
  }

  openApiKey() {
    this.#dialog.open(XpertDevelopApiKeyComponent, {
      data: {
        xpertId: this.xpertId()
      }
    }).closed.subscribe({
      next: (token) => {
        console.log(token)
      }
    })
  }
}
