import { normalizeLocale } from '../../../../remote-components/shared/runtime'

const enUS = {
	cached: 'Cached',
	column: 'Column',
	cube: 'Cube',
	editor: 'MDX query editor',
	empty: 'Run a query to see real data rows.',
	failed: 'Query failed',
	loading: 'Running query…',
	model: 'Semantic model',
	next: 'Next',
	noCube: 'Select cube',
	noModel: 'Select semantic model',
	previous: 'Previous',
	refresh: 'Refresh',
	rowCount: '{count} row(s)',
	run: 'Run query',
	selectContext: 'Select a semantic model and cube before running a query.',
	statementRequired: 'Enter an MDX SELECT statement.',
	truncated: 'Showing the first {count} rows',
	value: 'Value'
} as const

type MessageKey = keyof typeof enUS

const zhHans: { [K in MessageKey]: string } = {
	cached: '缓存',
	column: '列',
	cube: 'Cube',
	editor: 'MDX 查询编辑器',
	empty: '运行查询后可查看真实数据结果。',
	failed: '查询失败',
	loading: '正在运行查询…',
	model: '语义模型',
	next: '下一页',
	noCube: '选择 Cube',
	noModel: '选择语义模型',
	previous: '上一页',
	refresh: '刷新',
	rowCount: '共 {count} 行',
	run: '运行查询',
	selectContext: '请先选择语义模型和 Cube。',
	statementRequired: '请输入 MDX SELECT 语句。',
	truncated: '当前展示前 {count} 行',
	value: '值'
}

const zhHant: { [K in MessageKey]: string } = {
	...zhHans,
	empty: '執行查詢後可查看真實資料結果。',
	failed: '查詢失敗',
	loading: '正在執行查詢…',
	model: '語意模型',
	next: '下一頁',
	noModel: '選擇語意模型',
	previous: '上一頁',
	refresh: '重新整理',
	rowCount: '共 {count} 行',
	run: '執行查詢',
	selectContext: '請先選擇語意模型和 Cube。',
	statementRequired: '請輸入 MDX SELECT 語句。',
	truncated: '目前顯示前 {count} 行'
}

export function createI18n(locale?: string) {
	const normalized = normalizeLocale(locale)
	const catalog = normalized === 'zh-Hans' ? zhHans : normalized === 'zh-Hant' ? zhHant : enUS
	return {
		locale: normalized,
		t(key: MessageKey, values?: { [key: string]: string | number }) {
			let output = catalog[key]
			for (const [name, value] of Object.entries(values ?? {})) {
				output = output.split(`{${name}}`).join(String(value))
			}
			return output
		},
		formatValue(value: unknown) {
			if (value === null || value === undefined) {
				return '—'
			}
			if (typeof value === 'number') {
				return new Intl.NumberFormat(normalized, {
					maximumFractionDigits: 12
				}).format(value)
			}
			if (typeof value === 'object') {
				return JSON.stringify(value)
			}
			return String(value)
		}
	}
}
