import { IWFNSubflow, XpertParameterTypeEnum } from '@metad/contracts'

export function subflowOutputVariables(subflow: IWFNSubflow) {
	return subflow.outputParams?.map((item) => ({
		...item,
		type: item.type || XpertParameterTypeEnum.STRING,
	})) ?? []
}
