import { Component, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { DocumentInterface } from '@langchain/core/documents'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  DocumentMetadata,
  KnowledgebaseService,
  Store,
  ToastrService,
  getErrorMessage,
  routeAnimations
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatInputModule,
    MatButtonModule,
    NgmCommonModule,
    KnowledgeChunkComponent
  ],
  animations: [routeAnimations]
})
export class KnowledgeTestComponent {
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly score = model<number>(null)
  readonly topK = model<number>(null)
  readonly query = model<string>('')
  readonly results = signal<DocumentInterface<DocumentMetadata>[]>([])

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
