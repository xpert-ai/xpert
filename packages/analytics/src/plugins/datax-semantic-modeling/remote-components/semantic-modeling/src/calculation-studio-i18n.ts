import { normalizeLocale } from '../../../../remote-components/shared/runtime'

const enUS = {
	addCalculation: 'New calculation',
	addParameter: 'New parameter',
	calculatedMember: 'Calculated member',
	calculation: 'Calculation',
	caption: 'Display name',
	createCubeFirst: 'Create a Cube before adding calculations or parameters.',
	cube: 'Scope Cube',
	defaultValue: 'Default value',
	description: 'Description',
	derivedSemantics: 'Derived semantics',
	editorDescription: 'Define the scope and expression here. Changes stay in the current draft.',
	empty: 'No calculations or parameters yet',
	expression: 'Expression',
	filterPlaceholder: 'Filter calculations and parameters',
	formatString: 'Format string',
	formula: 'Formula',
	name: 'Technical name',
	needsExpression: 'Needs expression',
	noSelection: 'Select an item, or create a calculation or parameter.',
	parameter: 'Parameter',
	ready: 'Ready',
	recordCount: '{{count}} records',
	scopeExplanation: 'Every calculation belongs to a Cube. Create and edit it here without leaving this page.',
	selectCube: 'Open Cubes',
	status: 'Status',
	testAll: 'Test all',
	title: 'Calculations, parameters, and variables',
	type: 'Type',
	visible: 'Visible in analysis'
} as const

type MessageKey = keyof typeof enUS
type MessageValues = Record<string, string | number>

const zhHans: { [K in MessageKey]: string } = {
	addCalculation: '新建计算',
	addParameter: '新建参数',
	calculatedMember: '计算成员',
	calculation: '计算',
	caption: '显示名称',
	createCubeFirst: '请先创建立方体，再添加计算或参数。',
	cube: '作用域立方体',
	defaultValue: '默认值',
	description: '说明',
	derivedSemantics: '派生语义',
	editorDescription: '在这里设置作用域和表达式；更改会保留在当前草稿中。',
	empty: '尚未创建计算或参数',
	expression: '表达式',
	filterPlaceholder: '筛选计算与参数',
	formatString: '格式字符串',
	formula: '公式',
	name: '技术名称',
	needsExpression: '待填写表达式',
	noSelection: '请选择一项，或新建计算/参数。',
	parameter: '参数',
	ready: '就绪',
	recordCount: '{{count}} 条记录',
	scopeExplanation: '每项计算都归属于一个立方体；可直接在本页创建和编辑，无需跳转。',
	selectCube: '前往立方体',
	status: '状态',
	testAll: '批量测试',
	title: '计算、参数与变量',
	type: '类型',
	visible: '在分析中可见'
}

const zhHant: { [K in MessageKey]: string } = {
	...zhHans,
	addCalculation: '新增計算',
	addParameter: '新增參數',
	calculatedMember: '計算成員',
	calculation: '計算',
	caption: '顯示名稱',
	createCubeFirst: '請先建立立方體，再新增計算或參數。',
	cube: '作用域立方體',
	defaultValue: '預設值',
	description: '說明',
	derivedSemantics: '衍生語意',
	editorDescription: '在這裡設定作用域和運算式；變更會保留在目前草稿中。',
	empty: '尚未建立計算或參數',
	expression: '運算式',
	filterPlaceholder: '篩選計算與參數',
	formatString: '格式字串',
	name: '技術名稱',
	needsExpression: '待填寫運算式',
	noSelection: '請選擇一項，或新增計算／參數。',
	parameter: '參數',
	ready: '就緒',
	recordCount: '{{count}} 筆記錄',
	scopeExplanation: '每項計算都歸屬於一個立方體；可直接在本頁建立和編輯，無需跳轉。',
	selectCube: '前往立方體',
	status: '狀態',
	testAll: '批次測試',
	title: '計算、參數與變數',
	type: '類型',
	visible: '在分析中可見'
}

export type CalculationStudioI18n = ReturnType<typeof createCalculationStudioI18n>

export function createCalculationStudioI18n(locale?: string) {
	const normalized = normalizeLocale(locale)
	const catalog = normalized === 'zh-Hans' ? zhHans : normalized === 'zh-Hant' ? zhHant : enUS
	return {
		locale: normalized,
		t(key: MessageKey, values: MessageValues = {}) {
			return Object.entries(values).reduce(
				(message, [name, value]) => message.split(`{{${name}}}`).join(String(value)),
				catalog[key]
			)
		}
	}
}
