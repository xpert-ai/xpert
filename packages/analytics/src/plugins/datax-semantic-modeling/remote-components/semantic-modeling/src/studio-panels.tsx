import * as React from 'react'
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea
} from '@xpert-ai/shadcn-ui'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { localized, objectCollection, setObjectValue, StudioIssue } from './schema-utils'
import { CreateForm, Option, Section, WorkspaceDetail } from './studio-types'

export function Overview(props: {
	workspace: WorkspaceDetail
	schema: JsonObject
	issues: StudioIssue[]
	locale?: string
	onChange(schema: JsonObject): void
	onNavigate(section: Section): void
}) {
	const cards = [
		{
			label: localized(props.locale, 'Shared dimensions', '共享维度'),
			value: objectCollection(props.schema, 'dimensions').length,
			section: 'dimensions' as const
		},
		{
			label: localized(props.locale, 'Physical cubes', '物理 Cube'),
			value: objectCollection(props.schema, 'cubes').length,
			section: 'cubes' as const
		},
		{
			label: localized(props.locale, 'Virtual cubes', '虚拟 Cube'),
			value: objectCollection(props.schema, 'virtualCubes').length,
			section: 'virtualCubes' as const
		},
		{
			label: localized(props.locale, 'Blocking issues', '阻塞问题'),
			value: props.issues.filter((issue) => issue.level === 'error').length,
			section: 'validation' as const
		}
	]
	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">
					{localized(props.locale, 'Workspace overview', '工作空间概览')}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{localized(
						props.locale,
						'Model metadata, semantic coverage, version state, and the recommended authoring flow.',
						'查看模型元数据、语义覆盖度、版本状态和推荐建模流程。'
					)}
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{cards.map((card) => (
					<Card
						key={card.label}
						className="cursor-pointer hover:bg-muted/30"
						onClick={() => props.onNavigate(card.section)}
					>
						<CardHeader className="pb-2">
							<CardTitle className="text-xs font-medium text-muted-foreground">{card.label}</CardTitle>
						</CardHeader>
						<CardContent className="text-3xl font-semibold">{card.value}</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						{localized(props.locale, 'Schema identity', 'Schema 标识')}
					</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 lg:grid-cols-2">
					<div className="grid gap-1.5">
						<Label htmlFor="schema-name">{localized(props.locale, 'Schema name', 'Schema 名称')}</Label>
						<Input
							id="schema-name"
							value={readString(props.schema, 'name') ?? ''}
							onChange={(event) =>
								props.onChange(setObjectValue(props.schema, 'name', event.currentTarget.value))
							}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label>{localized(props.locale, 'Catalog', '数据目录')}</Label>
						<Input value={props.workspace.model.catalog ?? ''} disabled />
					</div>
					<div className="grid gap-1.5">
						<Label>{localized(props.locale, 'Data source', '数据源')}</Label>
						<Input value={props.workspace.model.dataSourceName ?? ''} disabled />
					</div>
					<div className="grid gap-1.5">
						<Label>{localized(props.locale, 'Draft version', '草稿版本')}</Label>
						<Input value={String(props.workspace.model.draftVersion ?? 0)} disabled />
					</div>
				</CardContent>
			</Card>
			<div className="grid gap-3 lg:grid-cols-3">
				{[
					{
						step: '01',
						title: localized(props.locale, 'Inspect source', '检查数据源'),
						description: localized(
							props.locale,
							'Load tables and verify column metadata.',
							'加载数据表并验证字段元数据。'
						),
						section: 'sources' as const
					},
					{
						step: '02',
						title: localized(props.locale, 'Model semantics', '构建语义'),
						description: localized(
							props.locale,
							'Define dimensions, cubes, and governed calculations.',
							'定义维度、Cube 与受治理计算。'
						),
						section: 'dimensions' as const
					},
					{
						step: '03',
						title: localized(props.locale, 'Validate and publish', '校验并发布'),
						description: localized(
							props.locale,
							'Resolve blocking issues, save, and publish.',
							'解决阻塞问题，保存并发布。'
						),
						section: 'validation' as const
					}
				].map((item) => (
					<Card
						key={item.step}
						className="cursor-pointer hover:bg-muted/30"
						onClick={() => props.onNavigate(item.section)}
					>
						<CardContent className="pt-5">
							<div className="text-xs font-semibold text-primary">{item.step}</div>
							<div className="mt-2 font-medium">{item.title}</div>
							<div className="mt-1 text-sm text-muted-foreground">{item.description}</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	)
}

export function Snapshot(props: { schema: JsonObject; workspace: WorkspaceDetail; locale?: string }) {
	const counts = [
		[localized(props.locale, 'Dimensions', '维度'), objectCollection(props.schema, 'dimensions').length],
		[localized(props.locale, 'Cubes', 'Cube'), objectCollection(props.schema, 'cubes').length],
		[localized(props.locale, 'Virtual cubes', '虚拟 Cube'), objectCollection(props.schema, 'virtualCubes').length],
		[
			localized(props.locale, 'Measures', '度量'),
			objectCollection(props.schema, 'cubes').reduce(
				(total, cube) => total + objectCollection(cube, 'measures').length,
				0
			)
		]
	] as const
	return (
		<div className="space-y-2">
			<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{localized(props.locale, 'Model snapshot', '模型快照')}
			</div>
			{counts.map(([label, value]) => (
				<div key={label} className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">{label}</span>
					<span className="font-medium">{value}</span>
				</div>
			))}
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">{localized(props.locale, 'Status', '状态')}</span>
				<Badge variant="outline">{props.workspace.model.status ?? 'draft'}</Badge>
			</div>
		</div>
	)
}

export function ValidationView(props: { issues: StudioIssue[]; locale?: string }) {
	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">
					{localized(props.locale, 'Validation', '模型校验')}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{localized(
						props.locale,
						'Studio checks structural completeness before the server performs authoritative draft validation.',
						'Studio 先检查结构完整性，服务端保存时再执行权威草稿校验。'
					)}
				</p>
			</div>
			<div className="space-y-2">
				{props.issues.map((issue, index) => (
					<Card key={`${issue.location}:${index}`}>
						<CardContent className="flex items-start gap-3 py-4">
							<Badge
								variant={
									issue.level === 'error'
										? 'destructive'
										: issue.level === 'success'
											? 'default'
											: 'secondary'
								}
							>
								{issue.level}
							</Badge>
							<div className="min-w-0">
								<div className="text-sm font-medium">{issue.message}</div>
								<div className="mt-1 truncate font-mono text-xs text-muted-foreground">
									{issue.location}
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	)
}

export function AdvancedJson(props: {
	value: string
	locale?: string
	onChange(value: string): void
	onApply(): void
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">
						{localized(props.locale, 'Advanced schema JSON', '高级 Schema JSON')}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{localized(
							props.locale,
							'Edit advanced fields that are not yet represented by structured controls. Applying updates the local draft only.',
							'编辑尚未由结构化控件呈现的高级字段。应用后仅更新本地草稿。'
						)}
					</p>
				</div>
				<Button onClick={props.onApply}>{localized(props.locale, 'Apply JSON', '应用 JSON')}</Button>
			</div>
			<Textarea
				className="min-h-[680px] resize-y font-mono text-xs leading-6"
				spellCheck={false}
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

export function CreateWorkspaceDialog(props: {
	open: boolean
	form: CreateForm
	dataSources: Option[]
	busy: boolean
	locale?: string
	onOpenChange(open: boolean): void
	onChange(form: CreateForm): void
	onSubmit(event: React.FormEvent): void
}) {
	function update<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
		props.onChange({ ...props.form, [key]: value })
	}
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="max-w-2xl">
				<form onSubmit={props.onSubmit}>
					<DialogHeader>
						<DialogTitle>
							{localized(props.locale, 'Create semantic workspace', '创建语义工作空间')}
						</DialogTitle>
						<DialogDescription>
							{localized(
								props.locale,
								'Connect a data source and catalog. The new workspace starts as a governed draft.',
								'连接数据源和目录，新工作空间将以受治理草稿开始。'
							)}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-5 lg:grid-cols-2">
						<FormField label={localized(props.locale, 'Stable key', '稳定标识')}>
							<Input
								required
								value={props.form.key}
								onChange={(event) => update('key', event.currentTarget.value)}
							/>
						</FormField>
						<FormField label={localized(props.locale, 'Display name', '显示名称')}>
							<Input
								required
								value={props.form.name}
								onChange={(event) => update('name', event.currentTarget.value)}
							/>
						</FormField>
						<FormField label={localized(props.locale, 'Data source', '数据源')}>
							<Select
								value={props.form.dataSourceId}
								onValueChange={(value) => update('dataSourceId', value)}
							>
								<SelectTrigger>
									<SelectValue
										placeholder={localized(props.locale, 'Choose data source', '选择数据源')}
									/>
								</SelectTrigger>
								<SelectContent>
									{props.dataSources.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
						<FormField label={localized(props.locale, 'Catalog / schema', '目录 / Schema')}>
							<Input
								required
								value={props.form.catalog}
								onChange={(event) => update('catalog', event.currentTarget.value)}
							/>
						</FormField>
						<FormField label={localized(props.locale, 'Model type', '模型类型')}>
							<Select
								value={props.form.type}
								onValueChange={(value) => update('type', value === 'XMLA' ? 'XMLA' : 'SQL')}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="SQL">SQL</SelectItem>
									<SelectItem value="XMLA">XMLA</SelectItem>
								</SelectContent>
							</Select>
						</FormField>
						<FormField label={localized(props.locale, 'Business area ID', '业务域 ID')}>
							<Input
								value={props.form.businessAreaId}
								onChange={(event) => update('businessAreaId', event.currentTarget.value)}
							/>
						</FormField>
						<div className="lg:col-span-2">
							<FormField label={localized(props.locale, 'Description', '描述')}>
								<Textarea
									value={props.form.description}
									onChange={(event) => update('description', event.currentTarget.value)}
								/>
							</FormField>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
							{localized(props.locale, 'Cancel', '取消')}
						</Button>
						<Button
							type="submit"
							disabled={props.busy || !props.form.dataSourceId || !props.form.key || !props.form.name}
						>
							{props.busy
								? localized(props.locale, 'Creating…', '创建中…')
								: localized(props.locale, 'Create workspace', '创建工作空间')}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function FormField(props: { label: string; children: React.ReactNode }) {
	const id = React.useId()
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{props.label}</Label>
			<div id={id}>{props.children}</div>
		</div>
	)
}
