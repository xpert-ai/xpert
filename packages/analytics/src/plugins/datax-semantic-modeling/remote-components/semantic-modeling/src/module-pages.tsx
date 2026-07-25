import * as React from 'react'
import {
	Badge,
	Button,
	Card,
	Input,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@xpert-ai/shadcn-ui'
import { JsonObject, readNumber, readString } from '../../../../remote-components/shared/runtime'
import { StudioModuleSection } from './module-sections'
import { localized, objectCollection, readFactTableName, StudioIssue } from './schema-utils'
import { QueryRun, WorkspaceDetail } from './studio-types'

type ModuleRow = {
	id: string
	cells: string[]
	status?: 'success' | 'warning' | 'error' | 'neutral'
}

type ModuleDefinition = {
	eyebrow: string
	title: string
	description: string
	columns: string[]
	actions: Array<{ id: string; label: string; primary?: boolean }>
	rows: ModuleRow[]
	empty: string
}

export function StudioModulePage(props: {
	section: StudioModuleSection
	workspace: WorkspaceDetail
	schema: JsonObject
	issues: StudioIssue[]
	queryRuns: QueryRun[]
	locale?: string
	onAction(actionId: string): void
	onRowOpen?(rowId: string): void
}) {
	const [search, setSearch] = React.useState('')
	const [blockingOnly, setBlockingOnly] = React.useState(false)
	const definition = buildModuleDefinition(props)
	if (!definition) {
		return null
	}
	const normalizedSearch = search.trim().toLowerCase()
	const rows = definition.rows.filter((row) => {
		if (blockingOnly && props.section === 'quality' && row.status !== 'error') {
			return false
		}
		return !normalizedSearch || row.cells.join(' ').toLowerCase().includes(normalizedSearch)
	})

	return (
		<div className="flex min-h-full flex-col bg-background">
			<div className="border-b bg-card/40 px-5 py-5">
				<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
					{definition.eyebrow}
				</div>
				<div className="mt-1 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-xl font-semibold tracking-tight">{definition.title}</h1>
						<p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
							{definition.description}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{definition.actions.map((action) => (
							<Button
								key={action.id}
								variant={action.primary ? 'default' : 'outline'}
								size="sm"
								onClick={() => {
									if (action.id === 'quality-blocking') {
										setBlockingOnly((value) => !value)
										return
									}
									props.onAction(action.id)
								}}
							>
								{action.id === 'quality-blocking' && blockingOnly
									? localized(props.locale, 'Show all', '查看全部')
									: action.label}
							</Button>
						))}
					</div>
				</div>
			</div>

			<div className="flex items-center justify-between gap-3 border-b px-5 py-3">
				<Input
					className="h-8 max-w-xs text-xs"
					value={search}
					placeholder={localized(props.locale, 'Filter this module', '筛选当前模块')}
					onChange={(event) => setSearch(event.currentTarget.value)}
				/>
				<div className="text-xs text-muted-foreground">
					{localized(props.locale, `${rows.length} records`, `${rows.length} 条记录`)}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-5">
				<Card className="overflow-hidden rounded-lg shadow-none">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/35">
								{definition.columns.map((column) => (
									<TableHead key={column} className="h-10 whitespace-nowrap text-xs">
										{column}
									</TableHead>
								))}
								<TableHead className="w-14" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow
									key={row.id}
									className={props.onRowOpen ? 'cursor-pointer' : undefined}
									onClick={() => props.onRowOpen?.(row.id)}
								>
									{row.cells.map((cell, index) => (
										<TableCell
											key={`${row.id}:${index}`}
											className={
												index === 0
													? 'h-12 whitespace-nowrap text-sm font-medium'
													: 'h-12 max-w-[360px] truncate text-xs text-muted-foreground'
											}
										>
											{index === row.cells.length - 1 && row.status ? (
												<StatusBadge status={row.status} label={cell} />
											) : (
												cell
											)}
										</TableCell>
									))}
									<TableCell className="text-right text-muted-foreground">›</TableCell>
								</TableRow>
							))}
							{!rows.length ? (
								<TableRow>
									<TableCell colSpan={definition.columns.length + 1}>
										<div className="grid min-h-40 place-items-center text-center">
											<div>
												<div className="text-sm font-medium">{definition.empty}</div>
												<p className="mt-1 text-xs text-muted-foreground">
													{localized(
														props.locale,
														'Use an action above or ask the Agent to create it.',
														'可使用上方操作，或让 Agent 自动创建。'
													)}
												</p>
											</div>
										</div>
									</TableCell>
								</TableRow>
							) : null}
						</TableBody>
					</Table>
				</Card>
			</div>
		</div>
	)
}

function StatusBadge(props: { status: ModuleRow['status']; label: string }) {
	const variant =
		props.status === 'error'
			? 'destructive'
			: props.status === 'success'
				? 'default'
				: props.status === 'warning'
					? 'secondary'
					: 'outline'
	return (
		<Badge variant={variant} className="whitespace-nowrap text-[10px]">
			{props.label}
		</Badge>
	)
}

function buildModuleDefinition(props: Parameters<typeof StudioModulePage>[0]): ModuleDefinition | null {
	switch (props.section) {
		case 'dimensions':
			return dimensionsDefinition(props.schema, props.locale)
		case 'cubes':
			return cubesDefinition(props.schema, props.locale)
		case 'virtualCubes':
			return virtualCubesDefinition(props.schema, props.locale)
		case 'calculations':
			return calculationsDefinition(props.schema, props.locale)
		case 'members':
			return membersDefinition(props.schema, props.locale)
		case 'quality':
			return qualityDefinition(props.issues, props.locale)
		case 'security':
			return securityDefinition(props.schema, props.locale)
		case 'operations':
			return operationsDefinition(props.queryRuns, props.locale)
		case 'settings':
			return settingsDefinition(props.workspace, props.schema, props.locale)
		default:
			return null
	}
}

function dimensionsDefinition(schema: JsonObject, locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'Shared semantics', '共享语义'),
		title: localized(locale, 'Dimensions and hierarchies', '维度与层级'),
		description: localized(
			locale,
			'Maintain reusable dimensions, hierarchies, levels, member properties, and parent-child relationships.',
			'集中维护可复用维度、层级、级别、成员属性与父子关系。'
		),
		columns: localizedColumns(locale, [
			['Name', '名称'],
			['Type', '类型'],
			['Default hierarchy', '默认层级'],
			['Levels', '级别'],
			['Visibility', '可见性'],
			['Status', '状态']
		]),
		actions: [
			{ id: 'dimension-create', label: localized(locale, 'New dimension', '新建维度'), primary: true },
			{ id: 'dimension-source', label: localized(locale, 'Generate from source', '从源表生成') },
			{ id: 'dimension-sync', label: localized(locale, 'Batch sync', '批量同步') }
		],
		rows: objectCollection(schema, 'dimensions').map((dimension, index) => {
			const hierarchies = objectCollection(dimension, 'hierarchies')
			const hierarchy = hierarchies[0] ?? {}
			const levels = objectCollection(hierarchy, 'levels')
			return {
				id: `dimension:${index}`,
				cells: [
					readString(dimension, 'caption') ?? readString(dimension, 'name') ?? `#${index + 1}`,
					readString(dimension, 'type') ?? localized(locale, 'Standard', '标准维度'),
					readString(hierarchy, 'name') ?? '—',
					levels
						.map((level) => readString(level, 'name') ?? readString(level, 'column') ?? '')
						.filter(Boolean)
						.join(' › ') || '—',
					dimension['visible'] === false
						? localized(locale, 'Hidden', '隐藏')
						: localized(locale, 'Visible', '可见'),
					localized(locale, 'Valid', '有效')
				],
				status: 'success' as const
			}
		}),
		empty: localized(locale, 'No shared dimensions', '尚未创建共享维度')
	}
}

function cubesDefinition(schema: JsonObject, locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'Analytical model', '分析模型'),
		title: localized(locale, 'Cubes, measures, and calculated members', 'Cube、度量与计算成员'),
		description: localized(
			locale,
			'Define fact sources, dimension usages, aggregation rules, formatting, and business semantics for LLMs.',
			'定义事实来源、维度用法、聚合规则、格式和面向 LLM 的业务语义。'
		),
		columns: localizedColumns(locale, [
			['Cube', 'Cube'],
			['Fact source', '事实来源'],
			['Dimensions', '维度'],
			['Measures', '度量'],
			['Default measure', '默认度量'],
			['Runtime status', '运行状态']
		]),
		actions: [
			{ id: 'cube-create', label: localized(locale, 'New Cube', '新建 Cube'), primary: true },
			{ id: 'cube-measure', label: localized(locale, 'Add measure', '添加度量') },
			{ id: 'cube-calculated-member', label: localized(locale, 'Calculated member', '计算成员') }
		],
		rows: objectCollection(schema, 'cubes').map((cube, index) => ({
			id: `cube:${index}`,
			cells: [
				readString(cube, 'caption') ?? readString(cube, 'name') ?? `#${index + 1}`,
				readFactTableName(cube) || '—',
				String(objectCollection(cube, 'dimensionUsages').length + objectCollection(cube, 'dimensions').length),
				String(objectCollection(cube, 'measures').length),
				readString(cube, 'defaultMeasure') ?? '—',
				localized(locale, 'Draft ready', '草稿就绪')
			],
			status: readString(cube, 'defaultMeasure') ? ('success' as const) : ('warning' as const)
		})),
		empty: localized(locale, 'No Cubes', '尚未创建 Cube')
	}
}

function virtualCubesDefinition(schema: JsonObject, locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'Composite analytics', '组合分析'),
		title: localized(locale, 'Virtual Cubes', '虚拟 Cube'),
		description: localized(
			locale,
			'Combine dimensions and measures across Cubes and explicitly handle unrelated dimensions.',
			'跨 Cube 组合维度与度量，并显式处理不相关维度。'
		),
		columns: localizedColumns(locale, [
			['Name', '名称'],
			['Cube usages', 'Cube 用法'],
			['Dimensions', '维度'],
			['Measures', '度量'],
			['Calculated members', '计算成员'],
			['Status', '状态']
		]),
		actions: [
			{ id: 'virtual-create', label: localized(locale, 'New virtual Cube', '新建虚拟 Cube'), primary: true },
			{ id: 'virtual-validate', label: localized(locale, 'Validate formulas', '验证公式') }
		],
		rows: objectCollection(schema, 'virtualCubes').map((cube, index) => ({
			id: `virtual:${index}`,
			cells: [
				readString(cube, 'caption') ?? readString(cube, 'name') ?? `#${index + 1}`,
				objectCollection(cube, 'cubeUsages')
					.map((usage) => readString(usage, 'cubeName') ?? readString(usage, 'name') ?? '')
					.filter(Boolean)
					.join(', ') || '—',
				String(objectCollection(cube, 'virtualCubeDimensions').length),
				String(objectCollection(cube, 'virtualCubeMeasures').length),
				String(objectCollection(cube, 'calculatedMembers').length),
				localized(locale, 'Draft', '草稿')
			],
			status: 'neutral' as const
		})),
		empty: localized(locale, 'No virtual Cubes', '尚未创建虚拟 Cube')
	}
}

function calculationsDefinition(schema: JsonObject, locale?: string): ModuleDefinition {
	const rows: ModuleRow[] = []
	for (const [cubeIndex, cube] of objectCollection(schema, 'cubes').entries()) {
		const scope = readString(cube, 'caption') ?? readString(cube, 'name') ?? `Cube ${cubeIndex + 1}`
		for (const [index, value] of objectCollection(cube, 'calculations').entries()) {
			rows.push(
				calculationRow(
					`calculation:${cubeIndex}:${index}`,
					value,
					localized(locale, 'Calculation', '计算'),
					scope,
					locale
				)
			)
		}
		for (const [index, value] of objectCollection(cube, 'calculatedMembers').entries()) {
			rows.push(
				calculationRow(
					`member:${cubeIndex}:${index}`,
					value,
					localized(locale, 'Calculated member', '计算成员'),
					scope,
					locale
				)
			)
		}
		for (const [index, value] of objectCollection(cube, 'parameters').entries()) {
			rows.push(
				calculationRow(
					`parameter:${cubeIndex}:${index}`,
					value,
					localized(locale, 'Parameter', '参数'),
					scope,
					locale
				)
			)
		}
	}
	return {
		eyebrow: localized(locale, 'Derived semantics', '派生语义'),
		title: localized(locale, 'Calculations, parameters, and variables', '计算、参数与变量'),
		description: localized(
			locale,
			'Manage reusable, testable expressions and trace the dependencies of every calculation.',
			'集中管理可测试、可复用的表达式，并追踪每项计算的依赖关系。'
		),
		columns: localizedColumns(locale, [
			['Name', '名称'],
			['Type', '类型'],
			['Expression / default', '表达式 / 默认值'],
			['Scope', '作用域'],
			['Last validation', '最近验证'],
			['Status', '状态']
		]),
		actions: [
			{ id: 'calculation-create', label: localized(locale, 'New calculation', '新建计算'), primary: true },
			{ id: 'parameter-create', label: localized(locale, 'New parameter', '新建参数') },
			{ id: 'calculation-test', label: localized(locale, 'Test all', '批量测试') }
		],
		rows,
		empty: localized(locale, 'No calculations or parameters', '尚未创建计算或参数')
	}
}

function calculationRow(id: string, value: JsonObject, type: string, scope: string, locale?: string): ModuleRow {
	return {
		id,
		cells: [
			readString(value, 'caption') ?? readString(value, 'name') ?? '—',
			type,
			readString(value, 'formula') ?? readString(value, 'expression') ?? readString(value, 'defaultValue') ?? '—',
			scope,
			localized(locale, 'Draft validation', '草稿校验'),
			localized(locale, 'Ready', '通过')
		],
		status: 'success'
	}
}

function membersDefinition(schema: JsonObject, locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'AI retrieval readiness', 'AI 检索准备'),
		title: localized(locale, 'Dimension members and semantic retrieval', '维度成员与语义检索'),
		description: localized(
			locale,
			'Synchronize, embed, and test dimension members so Agents can map natural language to real members.',
			'同步、嵌入和测试维度成员，让 Agent 能将自然语言映射到真实成员。'
		),
		columns: localizedColumns(locale, [
			['Dimension / hierarchy', '维度 / 层级'],
			['Levels', '级别数'],
			['Embedding', '嵌入状态'],
			['Last sync', '最后同步'],
			['Schedule', '计划'],
			['Status', '状态']
		]),
		actions: [
			{ id: 'member-sync', label: localized(locale, 'Create sync job', '创建同步任务'), primary: true },
			{ id: 'member-upload', label: localized(locale, 'Upload members', '上传成员') },
			{ id: 'member-test', label: localized(locale, 'Retrieval test', '检索测试') }
		],
		rows: objectCollection(schema, 'dimensions').flatMap((dimension, dimensionIndex) => {
			const dimensionName =
				readString(dimension, 'caption') ?? readString(dimension, 'name') ?? `#${dimensionIndex + 1}`
			return objectCollection(dimension, 'hierarchies').map((hierarchy, hierarchyIndex) => ({
				id: `member:${dimensionIndex}:${hierarchyIndex}`,
				cells: [
					`${dimensionName} · ${readString(hierarchy, 'name') ?? localized(locale, 'Default', '默认')}`,
					String(objectCollection(hierarchy, 'levels').length),
					localized(locale, 'Not synchronized', '未同步'),
					'—',
					localized(locale, 'Manual', '手动'),
					localized(locale, 'Ready to configure', '待配置')
				],
				status: 'neutral' as const
			}))
		}),
		empty: localized(locale, 'No dimension hierarchies to synchronize', '没有可同步的维度层级')
	}
}

function qualityDefinition(issues: StudioIssue[], locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'Publish gate', '发布门禁'),
		title: localized(locale, 'Model quality', '模型质量'),
		description: localized(
			locale,
			'Review structural, semantic, security, and query validation results before publishing.',
			'统一查看结构、语义、安全与查询验证结果，并在发布前清零阻塞项。'
		),
		columns: localizedColumns(locale, [
			['Rule', '规则'],
			['Scope', '作用域'],
			['Severity', '级别'],
			['Result', '结果'],
			['Owner', '责任人'],
			['Last check', '最后检查']
		]),
		actions: [
			{ id: 'quality-run', label: localized(locale, 'Validate again', '重新验证'), primary: true },
			{ id: 'quality-blocking', label: localized(locale, 'Blocking only', '仅看阻塞项') },
			{ id: 'quality-export', label: localized(locale, 'Export report', '导出报告') }
		],
		rows: issues.map((issue, index) => ({
			id: `quality:${index}`,
			cells: [
				issue.message,
				issue.location,
				localized(
					locale,
					issue.level,
					issue.level === 'error' ? '错误' : issue.level === 'warning' ? '警告' : '提示'
				),
				issue.level === 'error' ? localized(locale, 'Failed', '失败') : localized(locale, 'Passed', '通过'),
				localized(locale, 'Model owner', '模型所有者'),
				localized(locale, 'Just now', '刚刚')
			],
			status:
				issue.level === 'error'
					? ('error' as const)
					: issue.level === 'warning'
						? ('warning' as const)
						: ('success' as const)
		})),
		empty: localized(locale, 'All quality checks passed', '所有质量检查均已通过')
	}
}

function securityDefinition(schema: JsonObject, locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'Data governance', '数据治理'),
		title: localized(locale, 'Roles and access control', '角色与访问控制'),
		description: localized(
			locale,
			'Configure model, Cube, hierarchy, level, and member grants with explicit rollup policies.',
			'配置模型、Cube、层级、级别和成员粒度的授权及 Rollup 策略。'
		),
		columns: localizedColumns(locale, [
			['Role', '角色'],
			['Model access', '模型访问'],
			['Cube grants', 'Cube 授权'],
			['Users', '用户'],
			['Composition', '组合方式'],
			['Status', '状态']
		]),
		actions: [
			{ id: 'role-create', label: localized(locale, 'New role', '新建角色'), primary: true },
			{ id: 'role-user', label: localized(locale, 'Add user', '添加用户') },
			{ id: 'role-simulate', label: localized(locale, 'Permission simulation', '权限模拟') }
		],
		rows: objectCollection(schema, 'roles').map((role, index) => ({
			id: `role:${index}`,
			cells: [
				readString(role, 'name') ?? `Role ${index + 1}`,
				readString(role, 'modelAccess') ?? localized(locale, 'All', '全部'),
				String(objectCollection(role, 'grants').length),
				String(objectCollection(role, 'users').length),
				readString(role, 'composition') ?? localized(locale, 'Single role', '单一角色'),
				localized(locale, 'Draft', '草稿')
			],
			status: 'neutral' as const
		})),
		empty: localized(locale, 'No model roles configured', '尚未配置模型角色')
	}
}

function operationsDefinition(queryRuns: QueryRun[], locale?: string): ModuleDefinition {
	return {
		eyebrow: localized(locale, 'Observability', '可观测性'),
		title: localized(locale, 'Run logs and service cache', '运行日志与服务缓存'),
		description: localized(
			locale,
			'Filter query activity by Cube, state, and time to diagnose latency, errors, and cache behavior.',
			'按 Cube、状态和时间筛选查询日志，定位耗时、错误与缓存命中。'
		),
		columns: localizedColumns(locale, [
			['Cube', 'Cube'],
			['Status', '状态'],
			['Rows', '结果行'],
			['Duration', '执行'],
			['Initiator', '发起人'],
			['Updated', '更新时间']
		]),
		actions: [
			{ id: 'cache-view', label: localized(locale, 'View cache', '查看缓存'), primary: true },
			{ id: 'cache-clear', label: localized(locale, 'Clear model cache', '清空模型缓存') },
			{ id: 'operations-refresh', label: localized(locale, 'Refresh', '刷新') }
		],
		rows: queryRuns.map((run) => ({
			id: run.id,
			cells: [
				run.cubeName,
				run.status === 'success'
					? localized(locale, 'Succeeded', '成功')
					: run.status === 'error'
						? localized(locale, 'Failed', '失败')
						: localized(locale, 'Running', '运行中'),
				typeof run.rowCount === 'number' ? String(run.rowCount) : '—',
				typeof run.durationMs === 'number' ? `${run.durationMs} ms` : '—',
				localized(locale, 'Current user', '当前用户'),
				formatTimestamp(run.startedAt, locale)
			],
			status:
				run.status === 'success'
					? ('success' as const)
					: run.status === 'error'
						? ('error' as const)
						: ('warning' as const)
		})),
		empty: localized(locale, 'No query runs in this session', '当前会话暂无查询运行记录')
	}
}

function settingsDefinition(workspace: WorkspaceDetail, schema: JsonObject, locale?: string): ModuleDefinition {
	const settings = readObjectValue(schema, 'studioSettings')
	return {
		eyebrow: localized(locale, 'Workspace governance', '工作空间治理'),
		title: localized(locale, 'Model settings and collaborators', '模型设置与协作成员'),
		description: localized(
			locale,
			'Manage the source, catalog, visibility, locale, caching, XMLA exposure, and ownership.',
			'维护数据源、目录、可见性、语言、缓存、XMLA 暴露和所有权。'
		),
		columns: localizedColumns(locale, [
			['Setting', '设置项'],
			['Current value', '当前值'],
			['Policy source', '策略来源'],
			['Last modified', '最后修改'],
			['Modified by', '修改人'],
			['Status', '状态']
		]),
		actions: [
			{ id: 'settings-edit', label: localized(locale, 'Edit settings', '编辑设置'), primary: true },
			{ id: 'settings-member', label: localized(locale, 'Add collaborator', '添加成员') },
			{ id: 'settings-owner', label: localized(locale, 'Transfer ownership', '转移所有权') }
		],
		rows: [
			settingRow(
				'source',
				localized(locale, 'Data source', '数据源'),
				workspace.model.dataSourceName ?? '—',
				locale
			),
			settingRow('catalog', localized(locale, 'Catalog', '目录'), workspace.model.catalog ?? '—', locale),
			settingRow(
				'visibility',
				localized(locale, 'Visibility', '可见性'),
				readString(settings, 'visibility') ?? 'Internal',
				locale
			),
			settingRow(
				'cache',
				localized(locale, 'Service cache', '服务缓存'),
				readString(settings, 'cache') ?? localized(locale, 'Enabled · 900s', '启用 · 900 秒'),
				locale
			),
			settingRow(
				'locale',
				localized(locale, 'Language context', '语言上下文'),
				readString(settings, 'locale') ?? locale ?? 'zh-Hans',
				locale
			),
			settingRow(
				'xmla',
				localized(locale, 'XMLA service', 'XMLA 服务'),
				readString(settings, 'xmla') ?? localized(locale, 'Enabled', '启用'),
				locale
			)
		],
		empty: localized(locale, 'No workspace settings', '没有工作空间设置')
	}
}

function settingRow(id: string, name: string, value: string, locale?: string): ModuleRow {
	return {
		id: `setting:${id}`,
		cells: [
			name,
			value,
			localized(locale, 'Model', '模型'),
			localized(locale, 'Current draft', '当前草稿'),
			localized(locale, 'Current user', '当前用户'),
			localized(locale, 'Valid', '有效')
		],
		status: 'success'
	}
}

function localizedColumns(locale: string | undefined, columns: Array<[string, string]>) {
	return columns.map(([en, zh]) => localized(locale, en, zh))
}

function readObjectValue(input: JsonObject, key: string): JsonObject {
	const value = input[key]
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
}

function formatTimestamp(value: string, locale?: string) {
	const date = new Date(value)
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleTimeString(locale?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			})
}
