import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIModelEntity, AiModelTypeEnum, FetchFrom, ICopilotModel, ModelFeature, ParameterRule, PriceInfo, PriceType, } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { DefaultParameterName, PARAMETER_RULE_TEMPLATE, valueOf } from './entities'
import { CommonParameterRules, IAIModel, ModelProfile, TChatModelOptions } from './types/'
import { ModelProvider } from './abstract-provider';
import { getPositionMap } from '../core';

@Injectable()
export abstract class AIModel implements IAIModel{
	protected logger = new Logger(AIModel.name)

	protected modelSchemas: AIModelEntity[] | null = null

	private positions: Record<string, number> = null

	constructor(
		protected readonly modelProvider: ModelProvider,
		public modelType: AiModelTypeEnum
	) {
		this.modelProvider.registerAIModelInstance(this.modelType, this)
	}

	abstract validateCredentials(model: string, credentials: Record<string, any>): Promise<void>

	getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		throw new Error(`Unsupport chat model!`)
	}

	getPrice(
		model: string,
		credentials: Record<string, any>,
		priceType: PriceType,
		tokens: number
	): PriceInfo {
		const modelSchema = this.getModelSchema(model, credentials)
		if (!modelSchema || !modelSchema.pricing) {
			return {
				unitPrice: 0,
				unit: 0,
				totalAmount: 0,
				currency: 'USD'
			}
		}

		const { pricing } = modelSchema
		const unitPrice = priceType === PriceType.INPUT ? pricing.input : pricing.output

		if (unitPrice === undefined) {
			return {
				unitPrice: 0,
				unit: 0,
				totalAmount: 0,
				currency: 'USD'
			}
		}

		const totalAmount = Number((tokens * unitPrice * pricing.unit).toFixed(7))

		return {
			unitPrice,
			unit: pricing.unit,
			totalAmount,
			currency: pricing.currency
		}
	}

	protected getModelPath() {
		const modelType = this.modelType.toLowerCase()
		return path.join(this.modelProvider.getProviderServerPath(), modelType)
	}

	predefinedModels(): AIModelEntity[] {
		if (this.modelSchemas) {
			return this.modelSchemas
		}

		const providerName = this.modelProvider.name.toLowerCase()
		const modelType = this.modelType.toLowerCase()
		const providerModelTypePath = this.getModelPath()

		const modelSchemaFiles = fs
			.readdirSync(providerModelTypePath)
			.filter((file) => !file.startsWith('_') && file.endsWith('.yaml'))

		const modelSchemas: AIModelEntity[] = []

		for (const file of modelSchemaFiles) {
			const filePath = path.join(providerModelTypePath, file)

			const yamlContent = fs.readFileSync(filePath, 'utf8')
			const yamlData = yaml.parse(yamlContent)

			// Processing parameter rules and tags
			this.processParameterRules(yamlData)
			this.processLabel(yamlData)

			try {
				const modelSchema = yamlData as AIModelEntity
				modelSchemas.push(modelSchema)
			} catch (error: any) {
				throw new Error(`Invalid model schema for ${providerName}.${modelType}.${file}: ${error.message}`)
			}
		}

		// Sorting model architecture by position
		this.modelSchemas = this.sortModelSchemas(modelSchemas, providerModelTypePath)
		return this.modelSchemas
	}

	getModelSchema(model: string, credentials?: Record<string, any>): AIModelEntity | null {
		const models = this.predefinedModels()
		const schema = models.find((_) => _.model === model)

		if (schema) {
			return schema
		}

		if (credentials) {
			return this.getCustomizableModelSchemaFromCredentials(model, credentials)
		}

		return null
	}

	/**
	 * Get customizable model schema.
	 * Implement this method in ai model sub class that can customize model
	 * 
	 * @param model model name
	 * @param credentials model credentials
	 * @returns model schema
	 */
	protected getCustomizableModelSchemaFromCredentials(
		model: string,
		credentials: Record<string, any>
	): AIModelEntity | null {
		return null
	}

	private processParameterRules(yamlData: Record<string, any>): void {
		const newParameterRules: any[] = []
		const parameterRules = yamlData['parameter_rules'] || []

		for (let parameterRule of parameterRules) {
			if (parameterRule.use_template) {
				try {
					const defaultParameterName = valueOf(DefaultParameterName, parameterRule.use_template)
					const defaultParameterRule = getDefaultParameterRuleVariableMap(defaultParameterName)
					const copyDefaultParameterRule = { ...defaultParameterRule, ...parameterRule }
					parameterRule = copyDefaultParameterRule
				} catch (error) {
					// Handle error if necessary
				}
			}

			if (!parameterRule.label) {
				parameterRule.label = { zh_Hans: parameterRule.name, en_US: parameterRule.name }
			}

			newParameterRules.push(parameterRule)
		}

		yamlData['parameter_rules'] = newParameterRules
	}

	private processLabel(yamlData: Record<string, any>): void {
		if (!yamlData['label']) {
			yamlData['label'] = { zh_Hans: yamlData['model'], en_US: yamlData['model'] }
		}
		yamlData['fetch_from'] = FetchFrom.PREDEFINED_MODEL
	}

	private sortModelSchemas(modelSchemas: AIModelEntity[], providerModelTypePath: string) {
		// Implementing model architecture sorting logic
		if (!this.positions) {
			this.positions = getPositionMap(providerModelTypePath)
		}

		return modelSchemas.sort((a, b) => {
			const positionA = this.positions[a.model] ?? Number.MAX_SAFE_INTEGER;
			const positionB = this.positions[b.model] ?? Number.MAX_SAFE_INTEGER;
			return positionA - positionB;
		})
	}

	protected _commonParameterRules(model: string,): ParameterRule[] {
		return null
	}

	public getParameterRules(model: string, credentials: Record<string, string>): ParameterRule[] {
		const modelSchema = this.getModelSchema(model, credentials)
		const parameterRules: ParameterRule[] = modelSchema?.parameter_rules ?? []
		return [
			...(this._commonParameterRules(model) ?? []),
			...parameterRules.filter((_) => !CommonParameterRules.some((r) => r.name === _.name))
		]
	}

	getModelProfile(model: string, credentials: unknown): ModelProfile {
		const modelSchema = this.getModelSchema(model, credentials)
		return modelSchema && {
			maxInputTokens: modelSchema.model_properties?.context_size,
			toolCalling: modelSchema.features?.includes(ModelFeature.TOOL_CALL) ||
				modelSchema.features?.includes(ModelFeature.MULTI_TOOL_CALL) ||
				  modelSchema.features?.includes(ModelFeature.STREAM_TOOL_CALL),
			structuredOutput: modelSchema.features?.includes(ModelFeature.STRUCTURED_OUTPUT),
		}
	}
}

function getDefaultParameterRuleVariableMap(name: DefaultParameterName): ParameterRule {
	/**
	 * Get default parameter rule for given name
	 *
	 * @param name - parameter name
	 * @return parameter rule
	 */
	const defaultParameterRule = PARAMETER_RULE_TEMPLATE[name]

	if (!defaultParameterRule) {
		throw new Error(`Invalid model parameter rule name ${name}`)
	}

	return defaultParameterRule
}
