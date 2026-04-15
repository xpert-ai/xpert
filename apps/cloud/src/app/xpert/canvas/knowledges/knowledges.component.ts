import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { IKnowledgeDocument, TChatMessageStep } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { DocumentInterface } from '@langchain/core/documents'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule],
  selector: 'chat-canvas-knowledges',
  templateUrl: './knowledges.component.html',
  styleUrl: 'knowledges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasKnowledgesComponent {
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
