import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, signal, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { Document } from 'langchain/document'

@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, MatTooltipModule],
  selector: 'xp-knowledge-chunk',
  templateUrl: 'chunk.component.html',
  styleUrls: ['chunk.component.scss'],
})
export class KnowledgeChunkComponent {
  
  // Inputs
  readonly chunk = input<Document>()
  readonly index = input<number>()

  // States
  readonly expanded = signal(false)
}
