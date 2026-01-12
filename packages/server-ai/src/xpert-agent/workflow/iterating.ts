import { IWFNIterating, XpertParameterTypeEnum } from '@metad/contracts'

export const STATE_VARIABLE_ITERATING_OUTPUT = 'output'
export const STATE_VARIABLE_ITERATING_OUTPUT_STR = 'output_str'

export function iteratingOutputVariables(iterating: IWFNIterating) {
	return [
		{
			name: STATE_VARIABLE_ITERATING_OUTPUT,
			type: iterating.outputParams?.length ? XpertParameterTypeEnum.ARRAY : XpertParameterTypeEnum.STRING,
			item: iterating.outputParams?.map((item) => ({
				...item,
				type: item.type || XpertParameterTypeEnum.STRING,
			})) ?? [],
			description: {
				en_US: 'Structured data sequence',
				zh_Hans: '结构化数据序列'
			}
		},
		{
			name: STATE_VARIABLE_ITERATING_OUTPUT_STR,
			type: XpertParameterTypeEnum.ARRAY_STRING,
			description: {
				en_US: 'Serialized data sequence',
				zh_Hans: '序列化数据序列'
			}
		}
	]
}
