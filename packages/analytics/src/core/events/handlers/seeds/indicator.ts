import { IIndicator, IndicatorStatusEnum, IndicatorType } from '@metad/contracts'
import { assign, omit } from 'lodash'
import { Repository } from 'typeorm'
import { Indicator } from '../../../../indicator/indicator.entity'
import { BusinessArea } from '../../../entities/internal'

export async function createIndicators(
	indicatorRepository: Repository<Indicator>,
	businessGroupRepository: Repository<BusinessArea>,
	tenantId: string,
	organizationId: string,
	createdById: string,
	modelId: string
) {
	return await Promise.all(
		INDICATORS.map((item) =>
			createIndicator(
				indicatorRepository,
				businessGroupRepository,
				tenantId,
				organizationId,
				createdById,
				modelId,
				item
			)
		)
	)
}

async function createIndicator(
	repository: Repository<Indicator>,
	businessAreaIdRepo: Repository<BusinessArea>,
	tenantId: string,
	organizationId: string,
	createdById: string,
	modelId: string,
	indicatorOptions: IIndicator
) {
	const businessArea = await businessAreaIdRepo.findOne({
		where: { tenantId, organizationId, name: indicatorOptions.businessAreaId }
	})

	let indicator = new Indicator()
	indicator.tenantId = tenantId
	indicator.organizationId = organizationId
	indicator.createdById = createdById
	indicator.businessAreaId = businessArea.id
	indicator.modelId = modelId
	indicator.status = IndicatorStatusEnum.RELEASED
	indicator.isApplication = true

	assign(indicator, omit(indicatorOptions, ['businessAreaId']))

	indicator = await repository.save(indicator)
}

const INDICATORS = [
	{
		businessAreaId: '核心指标',
		code: 'FEXP0010',
		name: '公司总净利',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: 'All Stores', label: 'All Stores' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0011',
		name: '美国区净利',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: 'USA', label: 'USA' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0012',
		name: '加拿大净利',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: 'Canada', label: 'Canada' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0013',
		name: '墨西哥净利',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: 'Mexico', label: 'Mexico' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0014',
		name: '管理费',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: '[USA].[WA]', label: 'WA' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0015',
		name: 'IT研发费',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[USA].[CA]', label: 'CA' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				},
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]'
					}
				},
				{
					members: [{ value: 'ACTUAL', label: "Current Year's Actuals" }],
					dimension: {
						dimension: '[category]',
						displayBehaviour: 'descriptionAndId'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0016',
		name: '市场营销费',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000]', label: '5000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: '[Mexico].[DF]', label: 'DF' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'amount'
		}
	},
	{
		businessAreaId: '核心指标',
		code: 'FEXP0017',
		name: '租赁费',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Expense',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[All Accounts].[5000].[4000]', label: '4000' }],
					dimension: {
						dimension: '[Account]',
						displayBehaviour: 'descriptionAndId'
					}
				},
				{
					members: [{ value: '[USA].[OR]', label: 'OR' }],
					dimension: {
						dimension: '[Store]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'amount'
		}
	},

	// 门店指标
	{
		businessAreaId: '门店指标',
		code: 'SALST1000',
		name: '门店总销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'All Stores', label: 'All Stores' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	{
		businessAreaId: '门店指标',
		code: 'SALST1001',
		name: '墨西哥门店销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'Mexico', label: 'Mexico' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	{
		businessAreaId: '门店指标',
		code: 'SALST1002',
		name: '加拿大门店销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'Canada', label: 'Canada' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	{
		businessAreaId: '门店指标',
		code: 'SALST1003',
		name: '美国门店销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'USA', label: 'USA' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	{
		businessAreaId: '门店指标',
		code: 'SALST1004',
		name: '加州门店销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[USA].[CA]', label: 'CA' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	{
		businessAreaId: '门店指标',
		code: 'SALST1005',
		name: '俄勒冈销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[USA].[OR]', label: 'OR' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	{
		businessAreaId: '门店指标',
		code: 'SALST1006',
		name: '华盛顿销量',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: '[USA].[WA]', label: 'WA' }],
					dimension: {
						dimension: '[Store]'
					}
				}
			],
			measure: 'sales'
		}
	},
	// 仓库指标
	{
		businessAreaId: '仓库指标',
		code: 'SCMIN1000',
		name: '公司总库存',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: { dimensions: ['[Time]'], measure: 'Ordered' }
	},
	{
		businessAreaId: '仓库指标',
		code: 'SCMIN1001',
		name: '美国仓库存',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'USA', label: 'USA' }],
					dimension: {
						dimension: '[Warehouse]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'Ordered'
		}
	},
	{
		businessAreaId: '仓库指标',
		code: 'SCMIN1002',
		name: '加拿大仓库存',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'Canada', label: 'Canada' }],
					dimension: {
						dimension: '[Warehouse]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'Ordered'
		}
	},
	{
		businessAreaId: '仓库指标',
		code: 'SCMIN1003',
		name: '墨西哥仓库存',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Inventory',
		unit: '台',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]'],
			filters: [
				{
					members: [{ value: 'Mexico', label: 'Mexico' }],
					dimension: {
						dimension: '[Warehouse]',
						displayBehaviour: 'descriptionOnly'
					}
				}
			],
			measure: 'Ordered'
		}
	},

	// 产品线销售指标
	{
		businessAreaId: '产品线销售',
		code: 'PRDSALE_JEFFERS',
		name: '杰弗斯销售额',
		type: IndicatorType.BASIC,
		visible: true,
		entity: 'Sales',
		unit: '美元',
		principal: 'Tiven Wang',
		authentication: 'ERP',
		options: {
			dimensions: ['[Time]', '[Store]', '[Customers]'],
			filters: [
				{
					members: [{ value: '[Jeffers]', label: 'Jeffers' }],
					dimension: { dimension: '[Product]' }
				},
				{
					members: [{ value: '[All Promotionss]', label: 'All Promotionss' }],
					dimension: { dimension: '[Promotions]' }
				}
			],
			measure: 'Sales'
		}
	}
]
