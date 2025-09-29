import { CommonModule } from '@angular/common'
import { Component, model } from '@angular/core'
import { IKnowledgeDocument } from '@cloud/app/@core'

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'xp-knowledge-web-crawl',
  templateUrl: 'web-crawl.component.html',
  styleUrls: ['web-crawl.component.scss']
})
export class KnowledgeWebCrawlComponent {
  readonly documents = model<Partial<IKnowledgeDocument>[]>(null)
}
