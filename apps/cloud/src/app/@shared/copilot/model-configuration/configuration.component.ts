import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, ModelConfiguration, ModelFeature, modelConfigurationSchema } from '@xpert-ai/contracts'
import { ZardFormImports, ZardInputDirective, ZardCheckboxComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'copilot-model-configuration',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, ...ZardFormImports, ZardInputDirective, ZardCheckboxComponent],
  templateUrl: './configuration.component.html'
})
export class ModelConfigurationComponent {
  readonly configuration = model.required<ModelConfiguration>()
  readonly llm = computed(() => {
    const configuration = this.configuration()
    return configuration.modelType === AiModelTypeEnum.LLM ? configuration : null
  })
  readonly embedding = computed(() => {
    const configuration = this.configuration()
    return configuration.modelType === AiModelTypeEnum.TEXT_EMBEDDING ? configuration : null
  })
  readonly invalid = computed(() => !modelConfigurationSchema.safeParse(this.configuration()).success)
  readonly features = [
    ModelFeature.TOOL_CALL,
    ModelFeature.MULTI_TOOL_CALL,
    ModelFeature.STREAM_TOOL_CALL,
    ModelFeature.VISION,
    ModelFeature.VIDEO,
    ModelFeature.STRUCTURED_OUTPUT
  ]

  changeNumber(
    field: 'contextSize' | 'maxConcurrency' | 'maxOutputTokens' | 'defaultMaxTokens' | 'dimensions' | 'batchSize',
    value: number | null
  ) {
    this.configuration.update((configuration) => {
      if (field === 'contextSize' || field === 'maxConcurrency') return { ...configuration, [field]: value ?? 0 }
      if (
        configuration.modelType === AiModelTypeEnum.LLM &&
        (field === 'maxOutputTokens' || field === 'defaultMaxTokens')
      ) {
        return { ...configuration, [field]: value ?? 0 }
      }
      if (configuration.modelType === AiModelTypeEnum.TEXT_EMBEDDING) {
        if (field === 'dimensions') return { ...configuration, dimensions: value ?? undefined }
        if (field === 'batchSize') return { ...configuration, batchSize: value ?? 0 }
      }
      return configuration
    })
  }

  toggleFeature(feature: ModelFeature, enabled: boolean) {
    this.configuration.update((configuration) =>
      configuration.modelType === AiModelTypeEnum.LLM
        ? {
            ...configuration,
            features: enabled
              ? [...new Set([...configuration.features, feature])]
              : configuration.features.filter((item) => item !== feature)
          }
        : configuration
    )
  }
}
