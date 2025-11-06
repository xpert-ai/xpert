import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { IKnowledgeDocument, TChatMessageStep } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { DocumentInterface } from '@langchain/core/documents'
import { XpertHomeService } from '../../home.service'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'chat-canvas-knowledges',
  templateUrl: './knowledges.component.html',
  styleUrl: 'knowledges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasKnowledgesComponent {
  readonly homeService = inject(XpertHomeService)

  // Inputs
  readonly message = input<TChatMessageStep<(DocumentInterface & {document: Partial<IKnowledgeDocument>})[]>>()

  // States
  readonly knowledges = computed(() => this.message()?.data)

  // constructor() {
  //   effect(() => {
  //     console.log('Knowledges:', this.knowledges())
  //   })
  // }

}
