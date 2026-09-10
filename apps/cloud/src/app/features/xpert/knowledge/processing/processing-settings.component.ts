import { Component, computed, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { AiModelTypeEnum, IKnowledgeDocument, ModelFeature } from '@cloud/app/@core'
import {
  XpI18nPipe,
  ZardAccordionImports,
  ZardButtonComponent,
  ZardInputDirective,
  ZardSelectImports,
  ZardSliderComponent,
  ZardSwitchComponent,
  ZardTagSelectComponent
} from '@xpert-ai/headless-ui'
import { KnowledgeProcessingForm, KnowledgeProcessingSection, PROCESSING_I18N_PREFIX } from './processing-form'
import { documentFileType } from './document-file-types'
import { ParentChildChunkSettingsComponent } from './parent-child-settings.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-processing-settings',
  imports: [
    FormsModule,
    TranslateModule,
    JSONSchemaFormComponent,
    IntegrationSelectComponent,
    CopilotModelSelectComponent,
    XpI18nPipe,
    ...ZardAccordionImports,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    ZardSliderComponent,
    ZardSwitchComponent,
    ZardTagSelectComponent,
    ParentChildChunkSettingsComponent
  ],
  templateUrl: './processing-settings.component.html'
})
export class KnowledgeProcessingSettingsComponent {
  readonly form = input.required<KnowledgeProcessingForm>()
  readonly section = input.required<KnowledgeProcessingSection>()
  readonly scope = input<'knowledgebase' | 'documents'>('knowledgebase')
  readonly showHeading = input(true)
  readonly documents = input<Partial<IKnowledgeDocument>[] | null>(null)
  readonly fileTypes = computed(() => new Set((this.documents() ?? []).map(documentFileType)))
  readonly showPdfParser = computed(() => this.documents() === null || this.fileTypes().has('pdf'))
  readonly parserRows = computed(() =>
    this.form().parserEngineRows.filter(
      (row) => this.documents() === null || row.extensions.some((extension) => this.fileTypes().has(extension.slice(1)))
    )
  )
  readonly i18nPrefix = PROCESSING_I18N_PREFIX
  readonly eAiModelTypeEnum = AiModelTypeEnum
  readonly eModelFeature = ModelFeature
  readonly defaultsHint = computed(() =>
    this.scope() === 'documents'
      ? 'XP.Knowledgebase.Import.DefaultsHint'
      : this.i18nPrefix + '.Implemented.DefaultsHelp'
  )
}
