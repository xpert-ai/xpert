import { normalizeLocale } from '../../../../remote-components/shared/runtime'

const enUS = {
	businessArea: 'Business area',
	cancel: 'Cancel',
	catalog: 'Catalog',
	changeSummary: 'Change summary',
	close: 'Close',
	collapseNavigation: 'Collapse navigation',
	create: 'Create',
	createModel: 'Create semantic model',
	cubeCount: 'Cubes',
	cubes: 'Cubes',
	dataSource: 'Data source',
	description: 'Description',
	dimensions: 'Shared dimensions',
	draftVersion: 'Draft version',
	emptyModel: 'Select a semantic model to begin.',
	emptySection: 'No items',
	expandNavigation: 'Expand navigation',
	failed: 'Operation failed',
	issues: 'Validation issues',
	key: 'Key',
	loadTables: 'Source tables',
	loading: 'Loading semantic model…',
	model: 'Semantic model',
	modelType: 'Model type',
	name: 'Name',
	newModel: 'New model',
	noIssues: 'No validation issues',
	publish: 'Publish',
	publishDescription: 'Publish the current validated draft for downstream metrics and queries.',
	publishModel: 'Publish semantic model?',
	refresh: 'Refresh',
	releaseNotes: 'Release notes',
	save: 'Save draft',
	schema: 'Schema JSON',
	selectModel: 'Select semantic model',
	sourceTables: 'Source tables',
	success: 'Operation completed',
	updatedAt: 'Updated',
	workspace: 'Workspace'
} as const

type MessageKey = keyof typeof enUS

const zhHans: { [K in MessageKey]: string } = {
	businessArea: '业务域',
	cancel: '取消',
	catalog: '目录',
	changeSummary: '变更说明',
	close: '关闭',
	collapseNavigation: '收起导航',
	create: '创建',
	createModel: '创建语义模型',
	cubeCount: 'Cube 数',
	cubes: 'Cube',
	dataSource: '数据源',
	description: '描述',
	dimensions: '共享维度',
	draftVersion: '草稿版本',
	emptyModel: '请选择一个语义模型开始建模。',
	emptySection: '暂无内容',
	expandNavigation: '展开导航',
	failed: '操作失败',
	issues: '验证问题',
	key: '标识',
	loadTables: '数据表',
	loading: '正在加载语义模型…',
	model: '语义模型',
	modelType: '模型类型',
	name: '名称',
	newModel: '新建模型',
	noIssues: '没有验证问题',
	publish: '发布',
	publishDescription: '将当前已验证草稿发布给下游指标和查询使用。',
	publishModel: '发布语义模型？',
	refresh: '刷新',
	releaseNotes: '发布说明',
	save: '保存草稿',
	schema: 'Schema JSON',
	selectModel: '选择语义模型',
	sourceTables: '数据表',
	success: '操作已完成',
	updatedAt: '更新时间',
	workspace: '工作空间'
}

const zhHant: { [K in MessageKey]: string } = {
	...zhHans,
	businessArea: '業務域',
	cancel: '取消',
	changeSummary: '變更說明',
	close: '關閉',
	collapseNavigation: '收起導覽',
	create: '建立',
	createModel: '建立語意模型',
	dataSource: '資料來源',
	description: '描述',
	dimensions: '共享維度',
	draftVersion: '草稿版本',
	emptyModel: '請選擇一個語意模型開始建模。',
	emptySection: '暫無內容',
	expandNavigation: '展開導覽',
	failed: '操作失敗',
	issues: '驗證問題',
	key: '識別碼',
	loading: '正在載入語意模型…',
	model: '語意模型',
	modelType: '模型類型',
	name: '名稱',
	newModel: '建立模型',
	noIssues: '沒有驗證問題',
	publish: '發佈',
	publishDescription: '將目前已驗證草稿發佈給下游指標和查詢使用。',
	publishModel: '發佈語意模型？',
	refresh: '重新整理',
	releaseNotes: '發佈說明',
	save: '儲存草稿',
	selectModel: '選擇語意模型',
	sourceTables: '資料表',
	success: '操作已完成',
	updatedAt: '更新時間',
	workspace: '工作空間'
}

export function createI18n(locale?: string) {
	const normalized = normalizeLocale(locale)
	const catalog = normalized === 'zh-Hans' ? zhHans : normalized === 'zh-Hant' ? zhHant : enUS
	return {
		locale: normalized,
		t(key: MessageKey) {
			return catalog[key]
		},
		formatDate(value?: string) {
			if (!value) {
				return '—'
			}
			const date = new Date(value)
			return Number.isNaN(date.getTime())
				? value
				: new Intl.DateTimeFormat(normalized, {
						dateStyle: 'medium',
						timeStyle: 'short'
					}).format(date)
		}
	}
}
