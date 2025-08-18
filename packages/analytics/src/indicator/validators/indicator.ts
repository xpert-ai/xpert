import { ChecklistItem, IndicatorType, RuleValidator, TIndicatorDraft } from '@metad/contracts'

export class IndicatorValidator implements RuleValidator {
	async validate(draft: TIndicatorDraft): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []
		if (!draft.validity) {
			issues.push({
				ruleCode: 'INDICATOR_VALIDITY_REQUIRED',
				field: 'validity',
				message: {
					en_US: `Indicator validity is empty`,
					zh_Hans: `指标有效期未指定`,
				},
				level: 'warning'
			})
		}

		if (!draft.business) {
			issues.push({
				ruleCode: 'INDICATOR_BUSINESS_REQUIRED',
				field: 'business',
				message: {
					en_US: `Indicator business is empty`,
					zh_Hans: `指标业务口径未填写`,
				},
				level: 'warning'
			})
		}
		if (!draft.visible) {
			issues.push({
				ruleCode: 'INDICATOR_VISIBLE_REQUIRED',
				field: 'visible',
				message: {
					en_US: `Indicators will be hidden from users`,
					zh_Hans: `指标将对用户隐藏`,
				},
				level: 'warning'
			})
		}
		if (!draft.modelId) {
			issues.push({
				ruleCode: 'INDICATOR_MODEL_ID_REQUIRED',
				field: 'modelId',
				message: {
					en_US: `Indicator semantic model is required`,
					zh_Hans: `指标语义模型是必需的`,
				},
				level: 'error'
			})
		}
		if (!draft.entity) {
			issues.push({
				ruleCode: 'INDICATOR_ENTITY_REQUIRED',
				field: 'entity',
				message: {
					en_US: `Indicator cube entity is required`,
					zh_Hans: `指标数据集是必需的`,
				},
				level: 'error'
			})
		}
		if (!draft.type) {
			issues.push({
				ruleCode: 'INDICATOR_TYPE_REQUIRED',
				field: 'type',
				message: {
					en_US: `Indicator type is required`,
					zh_Hans: `指标类型是必需的`,
				},
				level: 'error'
			})
		} else {
			if (draft.type === IndicatorType.BASIC && !draft.options?.measure) {
				issues.push({
					ruleCode: 'INDICATOR_MEASURE_REQUIRED',
					field: 'options.measure',
					message: {
						en_US: `Indicator measure is required for basic indicators`,
						zh_Hans: `基础指标必须指定度量`,
					},
					level: 'error'
				})
			}
			if (draft.type === IndicatorType.DERIVE && !draft.options?.formula) {
				issues.push({
					ruleCode: 'INDICATOR_FORMULA_REQUIRED',
					field: 'options.formula',
					message: {
						en_US: `Indicator formula is required for derivative indicators`,
						zh_Hans: `衍生指标必须指定计算公式`,
					},
					level: 'error'
				})
			}
		}
		if (draft.isApplication && !draft.options?.calendar) {
			issues.push({
				ruleCode: 'INDICATOR_CALENDAR_REQUIRED',
				field: 'options.calendar',
				message: {
					en_US: `Indicator calendar is required for application indicators`,
					zh_Hans: `应用指标必须指定日历`,
				},
				level: 'error'
			})
		}
		return issues
	}
}
