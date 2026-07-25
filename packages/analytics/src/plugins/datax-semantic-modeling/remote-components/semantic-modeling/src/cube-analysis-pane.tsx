import * as React from 'react'
import {
	Badge,
	Button,
	cn,
	Input,
	Label,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Switch,
	Textarea
} from '@xpert-ai/shadcn-ui'
import { Database, Plus, Search, Sigma, Sparkles } from 'lucide-react'
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { CubeModelingI18n } from './cube-modeling-i18n'
import { MeasureRow } from './cube-workbench-model'
import { objectCollection, readFactTableName, replaceAt, replaceCollection, setObjectValue } from './schema-utils'

export type SelectedMeasure = { kind: MeasureRow['kind']; index: number }
type MeasureFilter = 'all' | MeasureRow['kind']

export function AnalysisModelPane(props: {
	cubes: JsonObject[]
	cube: JsonObject
	cubeIndex: number
	rows: MeasureRow[]
	activeMeasure?: JsonObject
	selectedMeasure: SelectedMeasure | null
	search: string
	generatingMeasures?: boolean
	footer?: React.ReactNode
	i18n: CubeModelingI18n
	onSelectCube(index: number): void
	onSelectDimension(name: string): void
	onSearch(value: string): void
	onSelectMeasure(value: SelectedMeasure): void
	onAddMeasure(): void
	onGenerateMeasures(): void
	onChange(cube: JsonObject): void
}) {
	const [filter, setFilter] = React.useState<MeasureFilter>('all')
	const dimensionUsages = objectCollection(props.cube, 'dimensionUsages')
	const normalizedSearch = props.search.trim().toLowerCase()
	const filteredRows = props.rows.filter(
		(row) =>
			(filter === 'all' || row.kind === filter) &&
			`${row.name} ${row.column} ${row.aggregator}`.toLowerCase().includes(normalizedSearch)
	)
	return (
		<section className="flex h-full min-h-0 min-w-0 flex-col bg-background" data-testid="cube-analysis-model">
			<div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
				<div className="min-w-0 flex-1">
					<h2 className="text-xs font-semibold">{props.i18n.t('analysisModel')}</h2>
					<p className="truncate text-[10px] text-muted-foreground">{props.i18n.t('mappingDescription')}</p>
				</div>
				<Button size="xs" onClick={props.onAddMeasure}>
					<Plus aria-hidden="true" />
					{props.i18n.t('addMeasure')}
				</Button>
				<Button
					variant="outline"
					size="xs"
					disabled={props.generatingMeasures || !readFactTableName(props.cube)}
					onClick={props.onGenerateMeasures}
				>
					<Sparkles aria-hidden="true" />
					{props.i18n.t('fromFields')}
				</Button>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-[138px_minmax(220px,1fr)_246px] max-[760px]:grid-cols-[minmax(220px,1fr)_246px]">
				<aside className="min-h-0 border-r bg-card/45 max-[760px]:hidden">
					<div className="border-b p-2">
						<Label className="text-[10px] text-muted-foreground">{props.i18n.t('cubeSelector')}</Label>
						<Select
							value={String(props.cubeIndex)}
							onValueChange={(value) => props.onSelectCube(Number(value))}
						>
							<SelectTrigger className="mt-1 h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{props.cubes.map((cube, index) => (
									<SelectItem
										key={`${index}:${readString(cube, 'name') ?? ''}`}
										value={String(index)}
									>
										{props.i18n.t('cubeDisplayName', {
											name: readString(cube, 'caption') ?? readString(cube, 'name') ?? index + 1
										})}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="border-b px-2 py-2 text-[10px] font-semibold text-muted-foreground">
						{props.i18n.t('dimensionList')}
					</div>
					<ScrollArea className="h-[calc(100%-94px)]">
						<div className="space-y-0.5 p-1.5">
							{dimensionUsages.map((usage, index) => {
								const name =
									readString(usage, 'name') ??
									readString(usage, 'source') ??
									`${props.i18n.t('dimensionList')} ${index + 1}`
								return (
									<Button
										key={`${index}:${name}`}
										variant="ghost"
										size="xs"
										className="w-full justify-start px-2 font-normal"
										onClick={() => props.onSelectDimension(name)}
									>
										<Database aria-hidden="true" />
										<span className="truncate">{name}</span>
									</Button>
								)
							})}
							{!dimensionUsages.length ? (
								<p className="px-2 py-3 text-[10px] text-muted-foreground">
									{props.i18n.t('noDimensions')}
								</p>
							) : null}
						</div>
					</ScrollArea>
				</aside>

				<section className="min-h-0 min-w-0 border-r">
					<div className="flex h-11 items-center gap-2 border-b px-2.5">
						<div className="relative min-w-0 flex-1">
							<Search
								className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								className="h-7 pl-7 text-[11px]"
								value={props.search}
								placeholder={props.i18n.t('searchMeasures')}
								aria-label={props.i18n.t('searchMeasures')}
								onChange={(event) => props.onSearch(event.currentTarget.value)}
							/>
						</div>
						<Badge variant="secondary" className="text-[9px]">
							{props.rows.length}
						</Badge>
					</div>
					<div className="flex h-8 items-center gap-1 border-b px-2.5">
						<MeasureFilterButton
							active={filter === 'all'}
							label={`${props.i18n.t('all')} (${props.rows.length})`}
							onClick={() => setFilter('all')}
						/>
						<MeasureFilterButton
							active={filter === 'physical'}
							label={`${props.i18n.t('physicalMeasure')} (${props.rows.filter((row) => row.kind === 'physical').length})`}
							onClick={() => setFilter('physical')}
						/>
						<MeasureFilterButton
							active={filter === 'calculated'}
							label={`${props.i18n.t('calculatedMeasure')} (${props.rows.filter((row) => row.kind === 'calculated').length})`}
							onClick={() => setFilter('calculated')}
						/>
					</div>
					<div className="grid grid-cols-[minmax(100px,1fr)_54px_68px] border-b px-2.5 py-2 text-[9px] font-medium text-muted-foreground">
						<span>{props.i18n.t('name')}</span>
						<span>{props.i18n.t('physicalMeasure')}</span>
						<span>{props.i18n.t('aggregator')}</span>
					</div>
					<ScrollArea className="h-[calc(100%-108px)]">
						<div>
							{filteredRows.map((row) => {
								const selected =
									props.selectedMeasure?.kind === row.kind &&
									props.selectedMeasure.index === row.index
								return (
									<button
										key={row.id}
										type="button"
										data-testid={`cube-measure-${row.id}`}
										className={cn(
											'grid w-full grid-cols-[minmax(100px,1fr)_54px_68px] items-center border-b px-2.5 py-2.5 text-left text-[10px] hover:bg-muted/35',
											selected &&
												'bg-primary/7 text-primary shadow-[inset_2px_0_0_var(--primary)]'
										)}
										onClick={() => props.onSelectMeasure({ kind: row.kind, index: row.index })}
									>
										<span className="flex min-w-0 items-center gap-1.5 font-medium">
											{row.kind === 'calculated' ? (
												<Sigma className="size-3 shrink-0" aria-hidden="true" />
											) : (
												<Database className="size-3 shrink-0" aria-hidden="true" />
											)}
											<span className="truncate">{row.name}</span>
										</span>
										<span className="truncate text-muted-foreground">
											{row.kind === 'physical'
												? props.i18n.t('physicalMeasure')
												: props.i18n.t('calculatedMeasure')}
										</span>
										<span className="truncate text-muted-foreground">{row.aggregator || '—'}</span>
									</button>
								)
							})}
							{!filteredRows.length ? (
								<div className="grid min-h-40 place-items-center px-4 text-center text-[11px] text-muted-foreground">
									{props.i18n.t('noMeasures')}
								</div>
							) : null}
						</div>
					</ScrollArea>
				</section>

				<MeasurePropertyPanel
					cube={props.cube}
					selected={props.selectedMeasure}
					value={props.activeMeasure}
					i18n={props.i18n}
					onChange={props.onChange}
				/>
			</div>
			{props.footer ? <div className="shrink-0 border-t bg-card/70 px-3 pb-3">{props.footer}</div> : null}
		</section>
	)
}

function MeasureFilterButton(props: { active: boolean; label: string; onClick(): void }) {
	return (
		<Button
			variant="ghost"
			size="xs"
			className={cn(
				'h-6 px-2 text-[9px] font-normal',
				props.active && 'bg-primary/8 text-primary hover:bg-primary/12'
			)}
			onClick={props.onClick}
		>
			{props.label}
		</Button>
	)
}

function MeasurePropertyPanel(props: {
	cube: JsonObject
	selected: SelectedMeasure | null
	value?: JsonObject
	i18n: CubeModelingI18n
	onChange(cube: JsonObject): void
}) {
	if (!props.selected || !props.value) {
		return (
			<aside className="grid min-h-0 place-items-center bg-card/30 p-5 text-center">
				<div>
					<Sigma className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
					<p className="mt-2 text-[11px] text-muted-foreground">{props.i18n.t('selectMeasure')}</p>
				</div>
			</aside>
		)
	}
	const collection = props.selected.kind === 'physical' ? 'measures' : 'calculatedMembers'
	const items = objectCollection(props.cube, collection)
	const update = (key: string, value: JsonValue | undefined) => {
		const currentName = readString(props.value, 'name')
		const nextValue = setObjectValue(props.value ?? {}, key, value)
		let nextCube = replaceCollection(
			props.cube,
			collection,
			replaceAt(items, props.selected?.index ?? 0, nextValue)
		)
		if (
			key === 'name' &&
			currentName &&
			readString(props.cube, 'defaultMeasure') === currentName &&
			typeof value === 'string'
		) {
			nextCube = setObjectValue(nextCube, 'defaultMeasure', value)
		}
		props.onChange(nextCube)
	}
	const name = readString(props.value, 'name') ?? ''
	const isDefault = Boolean(name && readString(props.cube, 'defaultMeasure') === name)
	return (
		<aside className="min-h-0 bg-card/35" data-testid="cube-measure-properties">
			<div className="flex h-11 items-center border-b px-3">
				<span className="text-[11px] font-semibold">{props.i18n.t('measureProperties')}</span>
			</div>
			<ScrollArea className="h-[calc(100%-44px)]">
				<div className="space-y-3 p-3">
					<PropertyField label={props.i18n.t('name')}>
						<Input
							value={name}
							aria-label={props.i18n.t('name')}
							onChange={(event) => update('name', event.currentTarget.value)}
						/>
					</PropertyField>
					<PropertyField label={props.i18n.t('caption')}>
						<Input
							value={readString(props.value, 'caption') ?? ''}
							aria-label={props.i18n.t('caption')}
							onChange={(event) => update('caption', event.currentTarget.value)}
						/>
					</PropertyField>
					<PropertyField label={props.i18n.t('description')}>
						<Textarea
							className="min-h-20 text-xs"
							value={readString(props.value, 'description') ?? ''}
							aria-label={props.i18n.t('description')}
							onChange={(event) => update('description', event.currentTarget.value)}
						/>
					</PropertyField>
					{props.selected.kind === 'physical' ? (
						<>
							<Separator />
							<PropertyField label={props.i18n.t('column')}>
								<Input
									value={readString(props.value, 'column') ?? ''}
									aria-label={props.i18n.t('column')}
									onChange={(event) => update('column', event.currentTarget.value)}
								/>
							</PropertyField>
							<div className="grid grid-cols-2 gap-2">
								<PropertyField label={props.i18n.t('dataType')}>
									<Select
										value={readString(props.value, 'datatype') ?? 'Numeric'}
										onValueChange={(value) => update('datatype', value)}
									>
										<SelectTrigger aria-label={props.i18n.t('dataType')}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{['Numeric', 'Integer', 'Decimal', 'Currency'].map((value) => (
												<SelectItem key={value} value={value}>
													{value}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</PropertyField>
								<PropertyField label={props.i18n.t('aggregator')}>
									<Select
										value={readString(props.value, 'aggregator') ?? 'sum'}
										onValueChange={(value) => update('aggregator', value)}
									>
										<SelectTrigger aria-label={props.i18n.t('aggregator')}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{['sum', 'count', 'min', 'max', 'avg', 'distinct-count'].map((value) => (
												<SelectItem key={value} value={value}>
													{value.toUpperCase()}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</PropertyField>
							</div>
						</>
					) : (
						<PropertyField label={props.i18n.t('formula')}>
							<Textarea
								className="min-h-24 font-mono text-xs"
								value={readString(props.value, 'formula') ?? ''}
								aria-label={props.i18n.t('formula')}
								onChange={(event) => update('formula', event.currentTarget.value)}
							/>
						</PropertyField>
					)}
					<PropertyField label={props.i18n.t('formatString')}>
						<Input
							value={readString(props.value, 'formatString') ?? ''}
							placeholder="#,##0.00"
							aria-label={props.i18n.t('formatString')}
							onChange={(event) => update('formatString', event.currentTarget.value)}
						/>
					</PropertyField>
					<Separator />
					<div className="flex items-center justify-between gap-3">
						<Label>{props.i18n.t('defaultMeasure')}</Label>
						<Switch
							checked={isDefault}
							onCheckedChange={(checked) =>
								props.onChange(
									setObjectValue(props.cube, 'defaultMeasure', checked && name ? name : undefined)
								)
							}
						/>
					</div>
					<div className="flex items-center justify-between gap-3">
						<Label>{props.i18n.t('visible')}</Label>
						<Switch
							checked={props.value['visible'] !== false}
							onCheckedChange={(checked) => update('visible', checked)}
						/>
					</div>
				</div>
			</ScrollArea>
		</aside>
	)
}

function PropertyField(props: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-1.5">
			<Label>{props.label}</Label>
			{props.children}
		</div>
	)
}
