import { normalizeLocale } from '../../../../remote-components/shared/runtime'

const enUS = {
	addCube: 'New Cube',
	addMeasure: 'Add measure',
	aggregator: 'Aggregator',
	all: 'All',
	allMeasures: 'All measures',
	analysisModel: 'Analysis model',
	autoLayout: 'Auto layout',
	calculatedMeasure: 'Calculated',
	caption: 'Display name',
	column: 'Source column',
	cube: 'Cube',
	cubeDisplayName: '{{name}} Cube',
	cubeSelector: 'Cube',
	dataStructure: 'Data structure',
	dataType: 'Data type',
	defaultMeasure: 'Default measure',
	description: 'Description',
	dimensionList: 'Dimensions',
	editRelationships: 'Edit relationships',
	entityName: '{{name}} entity',
	fitDiagram: 'Fit diagram',
	formula: 'Formula',
	formatString: 'Format string',
	fromFields: 'Generate from fields',
	mapping: 'Mapping',
	mappingBridge: '{{entity}} ↔ {{cube}}',
	mappingDescription: 'Keep physical relationships and analytical definitions aligned.',
	measureProperties: 'Measure properties',
	measureSummary: '{{total}} measures · {{valid}} valid · {{warning}} need attention',
	name: 'Name',
	noCubes: 'Create a Cube to connect a data structure with an analysis model.',
	noDimensions: 'No dimensions are mapped to this Cube.',
	noMeasures: 'No measures yet.',
	physicalMeasure: 'Physical',
	properties: 'Properties',
	removeMeasure: 'Remove measure',
	searchMeasures: 'Search measures',
	selectMeasure: 'Select a measure to edit its properties.',
	statusSummary: '{{cube}} is based on {{entity}} · {{dimensions}} dimensions · {{measures}} measures',
	structureAndMappingReady: 'Structure and mapping validation passed',
	visible: 'Visible in analysis',
	zoomIn: 'Zoom in',
	zoomOut: 'Zoom out'
} as const

export type CubeModelingMessageKey = keyof typeof enUS
type MessageValues = Record<string, string | number>

const zhHans: { [K in CubeModelingMessageKey]: string } = {
	addCube: '新建立方体',
	addMeasure: '添加度量',
	aggregator: '聚合函数',
	all: '全部',
	allMeasures: '全部度量',
	analysisModel: '分析模型',
	autoLayout: '自动布局',
	calculatedMeasure: '计算',
	caption: '显示名称',
	column: '来源字段',
	cube: '立方体',
	cubeDisplayName: '{{name}} 立方体',
	cubeSelector: '立方体',
	dataStructure: '数据结构',
	dataType: '数据类型',
	defaultMeasure: '默认度量',
	description: '说明',
	dimensionList: '维度',
	editRelationships: '编辑关系',
	entityName: '{{name}} 实体',
	fitDiagram: '适配画布',
	formula: '表达式',
	formatString: '格式字符串',
	fromFields: '从字段生成',
	mapping: '映射',
	mappingBridge: '{{entity}} ↔ {{cube}}',
	mappingDescription: '让物理关系与分析定义始终保持同步。',
	measureProperties: '度量属性',
	measureSummary: '{{total}} 个度量 · {{valid}} 个有效 · {{warning}} 个需完善',
	name: '名称',
	noCubes: '创建一个立方体，将数据结构连接到分析模型。',
	noDimensions: '当前立方体尚未映射维度。',
	noMeasures: '暂无度量。',
	physicalMeasure: '物理',
	properties: '属性',
	removeMeasure: '删除度量',
	searchMeasures: '搜索度量',
	selectMeasure: '选择一个度量以编辑属性。',
	statusSummary: '{{cube}} 基于 {{entity}} · {{dimensions}} 个维度 · {{measures}} 个度量',
	structureAndMappingReady: '结构与映射验证通过',
	visible: '在分析中可见',
	zoomIn: '放大',
	zoomOut: '缩小'
}

const zhHant: { [K in CubeModelingMessageKey]: string } = {
	...zhHans,
	addCube: '新增立方體',
	addMeasure: '新增度量',
	analysisModel: '分析模型',
	autoLayout: '自動佈局',
	caption: '顯示名稱',
	column: '來源欄位',
	cube: '立方體',
	cubeDisplayName: '{{name}} 立方體',
	cubeSelector: '立方體',
	dataStructure: '資料結構',
	dataType: '資料類型',
	defaultMeasure: '預設度量',
	description: '說明',
	dimensionList: '維度',
	editRelationships: '編輯關係',
	entityName: '{{name}} 實體',
	fitDiagram: '適配畫布',
	formatString: '格式字串',
	formula: '運算式',
	fromFields: '從欄位產生',
	mapping: '映射',
	mappingDescription: '讓實體關係與分析定義始終保持同步。',
	measureProperties: '度量屬性',
	noCubes: '建立一個立方體，將資料結構連接到分析模型。',
	noDimensions: '目前立方體尚未映射維度。',
	noMeasures: '暫無度量。',
	properties: '屬性',
	removeMeasure: '刪除度量',
	searchMeasures: '搜尋度量',
	selectMeasure: '選擇一個度量以編輯屬性。',
	structureAndMappingReady: '結構與映射驗證通過',
	visible: '在分析中可見',
	zoomIn: '放大',
	zoomOut: '縮小'
}

export type CubeModelingI18n = ReturnType<typeof createCubeModelingI18n>

export function createCubeModelingI18n(locale?: string) {
	const normalized = normalizeLocale(locale)
	const catalog = normalized === 'zh-Hans' ? zhHans : normalized === 'zh-Hant' ? zhHant : enUS
	return {
		locale: normalized,
		t(key: CubeModelingMessageKey, values: MessageValues = {}) {
			return Object.entries(values).reduce(
				(message, [name, value]) => message.split(`{{${name}}}`).join(String(value)),
				catalog[key] as string
			)
		}
	}
}
