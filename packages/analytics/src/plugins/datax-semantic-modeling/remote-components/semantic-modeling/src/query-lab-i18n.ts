import { normalizeLocale } from '../../../../remote-components/shared/runtime'

const enUS = {
	chooseCube: 'Choose Cube',
	cube: 'Cube',
	duration: '{{duration}} ms',
	editorHint: 'Run with ⌘/Ctrl + Enter',
	emptyDescription: 'Choose a Cube, edit the MDX statement, and run it against the semantic service.',
	emptyTitle: 'Ready to query real data',
	executionError: 'Failed',
	executionRunning: 'Running',
	executionSuccess: 'Succeeded',
	groupBy: 'Group by {{dimension}}',
	history: 'History',
	mdx: 'MDX',
	noHistory: 'No queries have run in this session.',
	publishedRuntime: 'Published runtime',
	queryTemplate: 'Query template',
	queryResult: 'Result',
	resultTruncated: 'Result truncated',
	rowCount: '{{count}} rows',
	runQuery: 'Run',
	running: 'Running…',
	allMeasures: 'All measures',
	startedAt: 'Started',
	statement: 'Statement',
	status: 'Status',
	sqlEmpty: 'Run a query to inspect generated SQL and execution details.',
	title: 'Query Lab'
} as const

type QueryLabMessageKey = keyof typeof enUS
type MessageValues = Record<string, string | number>

const zhHans: { [K in QueryLabMessageKey]: string } = {
	chooseCube: '选择立方体',
	cube: '立方体',
	duration: '{{duration}} 毫秒',
	editorHint: '按 ⌘/Ctrl + Enter 运行',
	emptyDescription: '选择立方体、编辑 MDX，然后通过语义服务执行。',
	emptyTitle: '可以开始查询真实数据',
	executionError: '失败',
	executionRunning: '运行中',
	executionSuccess: '成功',
	groupBy: '按 {{dimension}} 分组',
	history: '执行记录',
	mdx: 'MDX',
	noHistory: '当前会话尚未运行查询。',
	publishedRuntime: '已发布运行时',
	queryTemplate: '查询模板',
	queryResult: '查询结果',
	resultTruncated: '结果已截断',
	rowCount: '{{count}} 行',
	runQuery: '运行',
	running: '运行中…',
	allMeasures: '全部度量',
	startedAt: '开始时间',
	statement: '查询语句',
	status: '状态',
	sqlEmpty: '运行查询后可查看生成的 SQL 与执行信息。',
	title: 'Query Lab'
}

const zhHant: { [K in QueryLabMessageKey]: string } = {
	...zhHans,
	chooseCube: '選擇立方體',
	cube: '立方體',
	duration: '{{duration}} 毫秒',
	editorHint: '按 ⌘/Ctrl + Enter 執行',
	emptyDescription: '選擇立方體、編輯 MDX，然後透過語意服務執行。',
	emptyTitle: '可以開始查詢真實資料',
	executionError: '失敗',
	executionRunning: '執行中',
	executionSuccess: '成功',
	groupBy: '按 {{dimension}} 分組',
	history: '執行記錄',
	noHistory: '目前工作階段尚未執行查詢。',
	publishedRuntime: '已發佈執行環境',
	queryTemplate: '查詢範本',
	queryResult: '查詢結果',
	resultTruncated: '結果已截斷',
	rowCount: '{{count}} 列',
	runQuery: '執行',
	running: '執行中…',
	allMeasures: '全部度量',
	startedAt: '開始時間',
	statement: '查詢語句',
	status: '狀態',
	sqlEmpty: '執行查詢後可查看產生的 SQL 與執行資訊。'
}

export type QueryLabI18n = ReturnType<typeof createQueryLabI18n>

export function createQueryLabI18n(locale?: string) {
	const normalized = normalizeLocale(locale)
	const catalog = normalized === 'zh-Hans' ? zhHans : normalized === 'zh-Hant' ? zhHant : enUS
	return {
		locale: normalized,
		t(key: QueryLabMessageKey, values: MessageValues = {}) {
			return Object.entries(values).reduce(
				(message, [name, value]) => message.split(`{{${name}}}`).join(String(value)),
				catalog[key]
			)
		},
		formatTime(value: string) {
			const date = new Date(value)
			return Number.isNaN(date.getTime())
				? value
				: new Intl.DateTimeFormat(normalized, {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					}).format(date)
		}
	}
}
