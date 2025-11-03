import { ParameterRule, ParameterType } from '@metad/contracts'
import { AIModel } from '../ai-model'

export abstract class TextToSpeechModel extends AIModel {
	public override getParameterRules(model: string, credentials: Record<string, string>): ParameterRule[] {
		const rules = this._commonParameterRules(model) ?? []

		const modelSchema = this.getModelSchema(model, credentials)

		if (modelSchema.model_properties) {
			if (modelSchema.model_properties['voices']) {
				rules.push({
					name: 'voice',
					type: ParameterType.STRING,
					required: true,
					options: modelSchema.model_properties['voices'].map(({ mode }) => mode),
					label: {
						zh_Hans: '音色',
						en_US: `Voice`
					},
					help: {
						zh_Hans: '合成声音的音色。可以选择不同的声音风格。',
						en_US: `The voice style for the synthesized speech. Different styles can be selected.`
					},
					default: modelSchema.model_properties['default_voice']
				})
			}
		}

		return rules
	}
}
