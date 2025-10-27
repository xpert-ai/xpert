import { CdkMenuModule } from "@angular/cdk/menu";
import { CommonModule } from "@angular/common";
import { Component, computed, effect, inject, model, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { MatTooltipModule } from "@angular/material/tooltip";
import { DocumentTextParserConfig, IKnowledgeDocument, KBDocumentCategoryEnum, KDocumentSourceType, KnowledgebaseService } from "@cloud/app/@core";
import { JsonSchema7ObjectType } from 'zod-to-json-schema'
import { attrModel, linkedModel, NgmI18nPipe } from "@metad/ocap-angular/core";
import { TranslateModule } from "@ngx-translate/core";
import { NgmSelectComponent } from "@cloud/app/@shared/common";
import { IconComponent } from "@cloud/app/@shared/avatar";
import { JSONSchemaFormComponent } from "@cloud/app/@shared/forms";
import { NgmCheckboxComponent, NgmInputComponent, NgmSlideToggleComponent } from "@metad/ocap-angular/common";
import { KnowledgeDocIdComponent } from "@cloud/app/@shared/knowledge";
import { KnowledgeDocumentPreviewComponent } from "../preview/preview.component";
import { KnowledgeDocumentWebpagesComponent } from "../webpages/webpages.component";
import { IntegrationSelectComponent } from "@cloud/app/@shared/integration";

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-create-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmI18nPipe,
    NgmInputComponent,
    NgmCheckboxComponent,
    NgmSlideToggleComponent,
    NgmSelectComponent,
    IconComponent,
    JSONSchemaFormComponent,
    KnowledgeDocIdComponent,
    IntegrationSelectComponent,
    KnowledgeDocumentPreviewComponent,
    KnowledgeDocumentWebpagesComponent,
  ]
})
export class KnowledgeDocumentCreateSettingsComponent {
  eKDocumentSourceType = KDocumentSourceType
  eKBDocumentCategoryEnum = KBDocumentCategoryEnum

  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Input Models
  readonly documents = model<Partial<IKnowledgeDocument>[]>()
  readonly parserConfig = model<DocumentTextParserConfig>()


  // Strategies
  readonly #textSplitterStrategies = toSignal(this.knowledgebaseAPI.getTextSplitterStrategies())
  readonly #documentTransformerStrategies = toSignal(this.knowledgebaseAPI.getDocumentTransformerStrategies())
  readonly documentSourceStrategies = toSignal(this.knowledgebaseAPI.getDocumentSourceStrategies())
  readonly #understandingStrategies = toSignal(this.knowledgebaseAPI.understandingStrategies$)

  // Text Splitter
  readonly textSplitterType = attrModel(this.parserConfig, 'textSplitterType', 'recursive-character')
  readonly textSplitter = attrModel(this.parserConfig, 'textSplitter')

  readonly textSplitterStrategies = computed(() => this.#textSplitterStrategies()?.map((strategy) => ({
    value: strategy.name,
    label: strategy.label,
    description: strategy.description,
    _icon: strategy.icon
  })))

  readonly textSplitterStrategy = computed(() => this.#textSplitterStrategies()?.find((strategy) => strategy.name === this.textSplitterType()))
  readonly textSplitterConfigSchema = computed(() => this.textSplitterStrategy()?.configSchema || {} as JsonSchema7ObjectType)

  // Document Transformer
  readonly transformerType = attrModel(this.parserConfig, 'transformerType', 'default')
  readonly transformer = attrModel(this.parserConfig, 'transformer')
  readonly transformerIntegrationId = attrModel(this.parserConfig, 'transformerIntegration')
  readonly transformerStrategy = computed(() => this.#documentTransformerStrategies()?.find((strategy) => strategy.meta.name === this.transformerType()))
  readonly transformerConfigSchema = computed(() => this.transformerStrategy()?.meta.configSchema || {} as JsonSchema7ObjectType)
  readonly transformerIntegration = computed(() => this.transformerStrategy()?.integration)
  readonly transformerIntegrationProvider = computed(() => this.transformerIntegration()?.service)

  readonly documentTransformerStrategies = computed(() => this.#documentTransformerStrategies()?.map((strategy) => ({
    value: strategy.meta.name,
    label: strategy.meta.label,
    description: strategy.meta.description,
    _icon: strategy.meta.icon
  })))

  // Image Understanding
  readonly imageUnderstandingType = attrModel(this.parserConfig, 'imageUnderstandingType', 'vlm-default')
  readonly imageUnderstanding = attrModel(this.parserConfig, 'imageUnderstanding')
  readonly imageUnderstandingIntegrationId = attrModel(this.parserConfig, 'imageUnderstandingIntegration')
  readonly enableImageUnderstanding = linkedModel({
    initialValue: false,
    compute: () => !!this.parserConfig().imageUnderstandingType,
    update: (value) => {
      this.parserConfig.update((state) => {
        if (value) {
          return {
            ...state,
            imageUnderstandingType: state.imageUnderstandingType || 'vlm-default',
            imageUnderstanding: state.imageUnderstanding || {}
          }
        } else {
          const { imageUnderstandingType, imageUnderstanding, ...rest } = state
          return rest
        }
      })
    }
  })

  readonly imageUnderstandingStrategies = computed(() => this.#understandingStrategies()?.map(({meta: strategy}) => ({
    value: strategy.name,
    label: strategy.label,
    description: strategy.description,
    _icon: strategy.icon
  })))

  readonly imageUnderstandingStrategy = computed(() => this.#understandingStrategies()?.find((strategy) => strategy.meta.name === this.imageUnderstandingType()))
  readonly imageUnderstandingConfigSchema = computed(() => this.imageUnderstandingStrategy()?.meta.configSchema || {} as JsonSchema7ObjectType)
  readonly imageUnderstandingIntegration = computed(() => this.imageUnderstandingStrategy()?.integration)
  readonly imageUnderstandingIntegrationProvider = computed(() => this.imageUnderstandingIntegration()?.service)

  readonly delimiter = attrModel(this.parserConfig, 'delimiter', '\n\n')
  readonly chunkSize = attrModel(this.parserConfig, 'chunkSize', 1000)
  readonly chunkOverlap = attrModel(this.parserConfig, 'chunkOverlap', 200)
  readonly replaceWhitespace = attrModel(this.parserConfig, 'replaceWhitespace', true)
  readonly removeSensitive = attrModel(this.parserConfig, 'removeSensitive', false)

  readonly onlySheet = computed(() => this.documents()?.every((item) => item.category === KBDocumentCategoryEnum.Sheet))

  // Preview
  readonly selectedDocIndex = signal(null)
  readonly selectedDocument = linkedModel({
    initialValue: null,
    compute: () => {
      const index = this.selectedDocIndex()
      return index === null ? null : this.documents()?.[index]
    },
    update: (document: Partial<IKnowledgeDocument>) => {
      this.documents.update((docs) => {
        docs[this.selectedDocIndex()] = document
        return [...docs]
      })
    }
  })

  readonly preview = signal(false)

  // constructor() {
  //   effect(() => {
  //     this.preview()
  //   }, { allowSignalWrites: true })
  // }

  onPreview() {
    if (!this.selectedDocument()) {
      if (this.documents().length) {
        this.selectedDocIndex.set(0)
      }
    }
  }

  toggleAllPreview() {
    this.preview.update((state) => !state)
  }
}