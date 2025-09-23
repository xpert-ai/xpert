import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { Document } from 'langchain/document'
import { MarkdownModule } from 'ngx-markdown'
import { DocumentMetadata } from '../../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, MatTooltipModule, MarkdownModule],
  selector: 'xp-knowledge-chunk',
  templateUrl: 'chunk.component.html',
  styleUrls: ['chunk.component.scss']
})
export class KnowledgeChunkComponent {
  // Inputs
  readonly chunk = input<Document<DocumentMetadata>>()
  readonly index = input<number>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly expanded = signal(false)
  readonly preview = signal(false)

  togglePreview() {
    this.preview.set(!this.preview())
  }
}
