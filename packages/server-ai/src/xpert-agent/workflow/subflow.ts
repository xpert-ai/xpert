import { IWFNSubflow, XpertParameterTypeEnum } from '@metad/contracts'

export function subflowOutputVariables(subflow: IWFNSubflow) {
	return subflow.outputs?.map((item) => ({
		type: XpertParameterTypeEnum.STRING,
		name: item.name
	})) ?? []
}
