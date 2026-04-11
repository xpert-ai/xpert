import { IWFNSubflow, XpertParameterTypeEnum } from '@xpert-ai/contracts'

export function subflowOutputVariables(subflow: IWFNSubflow) {
	return subflow.outputParams?.map((item) => ({
		...item,
		type: item.type || XpertParameterTypeEnum.STRING,
	})) ?? []
}
