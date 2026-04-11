import { CurrenciesEnum, DefaultValueDateTypeEnum } from '@xpert-ai/contracts'

export const DEFAULT_ORGANIZATIONS = [
	{
		name: 'Default Company',
		currency: CurrenciesEnum.CNY,
		defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
		imageUrl: '',
		isDefault: true
	}
]

export function getTenantDefaultOrganization(tenantName: string) {
	return {
		name: `${tenantName} Company`,
		currency: CurrenciesEnum.CNY,
		defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
		imageUrl: '',
		isDefault: false
	}
}
