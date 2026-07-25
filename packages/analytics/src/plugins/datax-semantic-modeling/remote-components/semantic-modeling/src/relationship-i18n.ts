import { normalizeLocale } from '../../../../remote-components/shared/runtime'

const enUS = {
	aggregator: 'Aggregator',
	caption: 'Caption',
	captionColumn: 'Caption column',
	column: 'Column',
	dataType: 'Data type',
	description: 'Description',
	diagramLabel: 'Semantic model ER diagram',
	dimension: 'Dimension',
	emptyFields: 'No fields',
	fact: 'Fact',
	fieldProperties: 'Field properties',
	fieldPropertiesDescription: 'Edit the selected field schema without leaving the ER diagram.',
	formatString: 'Format string',
	formatter: 'Time formatter',
	hiddenForAgent: 'Hidden for Agent',
	keyColumn: 'Key column',
	level: 'Level',
	levelType: 'Level type',
	measure: 'Measure',
	name: 'Name',
	nameColumn: 'Name column',
	nullParentValue: 'Null parent value',
	ordinalColumn: 'Ordinal column',
	parentColumn: 'Parent column',
	regular: 'Regular',
	selectField: 'Select a field in an entity to edit its schema.',
	semantic: 'Semantic',
	sourceMapping: 'Source mapping',
	table: 'Table',
	timeDay: 'Day',
	timeMonth: 'Month',
	timeQuarter: 'Quarter',
	timeWeek: 'Week',
	timeYear: 'Year',
	uniqueMembers: 'Unique members',
	visible: 'Visible'
} as const

export type RelationshipMessageKey = keyof typeof enUS

const zhHans: { [K in RelationshipMessageKey]: string } = {
	aggregator: '聚合器',
	caption: '显示名称',
	captionColumn: '标题字段',
	column: '字段',
	dataType: '数据类型',
	description: '说明',
	diagramLabel: '语义模型 ER 图',
	dimension: '维度',
	emptyFields: '暂无字段',
	fact: '事实',
	fieldProperties: '字段属性',
	fieldPropertiesDescription: '无需离开 ER 图即可编辑所选字段的 Schema。',
	formatString: '格式字符串',
	formatter: '时间格式',
	hiddenForAgent: '对 Agent 隐藏',
	keyColumn: '键字段',
	level: 'Level',
	levelType: 'Level 类型',
	measure: '度量',
	name: '名称',
	nameColumn: '名称字段',
	nullParentValue: '空父级值',
	ordinalColumn: '排序字段',
	parentColumn: '父级字段',
	regular: '常规',
	selectField: '选择实体中的字段以编辑其 Schema。',
	semantic: '语义',
	sourceMapping: '来源映射',
	table: '数据表',
	timeDay: '日',
	timeMonth: '月',
	timeQuarter: '季度',
	timeWeek: '周',
	timeYear: '年',
	uniqueMembers: '成员唯一',
	visible: '可见'
}

const zhHant: { [K in RelationshipMessageKey]: string } = {
	...zhHans,
	aggregator: '彙總器',
	caption: '顯示名稱',
	captionColumn: '標題欄位',
	column: '欄位',
	dataType: '資料類型',
	description: '說明',
	diagramLabel: '語義模型 ER 圖',
	dimension: '維度',
	emptyFields: '暫無欄位',
	fact: '事實',
	fieldProperties: '欄位屬性',
	fieldPropertiesDescription: '無需離開 ER 圖即可編輯所選欄位的 Schema。',
	formatString: '格式字串',
	formatter: '時間格式',
	hiddenForAgent: '對 Agent 隱藏',
	keyColumn: '鍵欄位',
	levelType: 'Level 類型',
	measure: '度量',
	nameColumn: '名稱欄位',
	nullParentValue: '空父層值',
	ordinalColumn: '排序欄位',
	parentColumn: '父層欄位',
	selectField: '選擇實體中的欄位以編輯其 Schema。',
	sourceMapping: '來源對應',
	table: '資料表',
	timeQuarter: '季度',
	uniqueMembers: '成員唯一',
	visible: '可見'
}

export type RelationshipI18n = ReturnType<typeof createRelationshipI18n>

export function createRelationshipI18n(locale?: string) {
	const normalized = normalizeLocale(locale)
	const catalog = normalized === 'zh-Hans' ? zhHans : normalized === 'zh-Hant' ? zhHant : enUS
	return {
		locale: normalized,
		t(key: RelationshipMessageKey) {
			return catalog[key]
		}
	}
}
