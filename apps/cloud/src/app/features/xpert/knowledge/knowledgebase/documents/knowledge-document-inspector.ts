import { CdkMenuModule } from '@angular/cdk/menu'
import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, TemplateRef } from '@angular/core'
import { IKnowledgeDocument } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardIconComponent, ZardStepperImports } from '@xpert-ai/headless-ui'
import { KnowledgeDocumentCoverPreviewComponent } from './document-cover-preview.component'
import { DocumentGraphProgressComponent } from './document-graph-progress.component'
import { DocumentWikiProgressComponent } from './document-wiki-progress.component'
import type { KnowledgeDocumentsComponent } from './documents.component'
import { ParserCoverageComponent } from './parser-coverage.component'
@Component({
  selector: 'xp-knowledge-document-inspector',
  standalone: true,
  imports: [
    ParserCoverageComponent,
    NgTemplateOutlet,
    TranslateModule,
    CdkMenuModule,
    ...ZardStepperImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    KnowledgeDocumentCoverPreviewComponent,
    DocumentWikiProgressComponent,
    DocumentGraphProgressComponent
  ],
  templateUrl: './knowledge-document-inspector.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeDocumentInspectorComponent {
  readonly rowMenu = input.required<TemplateRef<{ doc: IKnowledgeDocument }>>()
  readonly vm = input.required<KnowledgeDocumentsComponent>()
}
