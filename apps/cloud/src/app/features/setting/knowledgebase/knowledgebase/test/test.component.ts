import { Component, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { DocumentInterface } from '@langchain/core/documents'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgebaseService, Store, ToastrService, getErrorMessage, routeAnimations } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'

@Component({
  standalone: true,
  selector: 'pac-settings-knowledgebase-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.scss'],
  imports: [RouterModule, FormsModule, TranslateModule, MaterialModule, NgmCommonModule],
  animations: [routeAnimations]
})
export class KnowledgeTestComponent extends TranslationBaseComponent {
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly score = model<number>(null)
  readonly topK = model<number>(null)
  readonly query = model<string>('')
  readonly results = signal<{ doc: DocumentInterface; score: number }[]>([])

  readonly loading = signal<boolean>(false)

  test() {
    this.loading.set(true)
    this.knowledgebaseService
      .test(this.knowledgebase().id, { query: this.query(), k: this.topK() ?? 10, score: this.score() })
      .subscribe({
        next: (results) => {
          this.results.set(results)
          this.loading.set(false)
        },
        error: (err) => {
          this._toastrService.error(getErrorMessage(err))
          this.loading.set(false)
        }
      })
  }
}
