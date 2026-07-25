import * as React from 'react'
import {
	Button,
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
import {
	Box,
	Check,
	ChevronRight,
	Database,
	EllipsisVertical,
	FunctionSquare,
	PanelRightClose,
	Pencil,
	Plus,
	Search,
	Sigma,
	Sparkles,
	X
} from 'lucide-react'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { createCubeWorkbenchI18n, CubeWorkbenchI18n } from './cube-workbench-i18n'
import { cubeReadiness, MeasureRow, measureRows } from './cube-workbench-model'
import { CubeReadinessPopover } from './cube-readiness-panel'
import { MeasureValidationStrip, ValidationStep } from './cube-validation'
import {
	appendItem,
	objectCollection,
	readFactTableName,
	removeAt,
	replaceAt,
	replaceCollection,
	setFactTableName,
	setObjectValue,
	StudioIssue
} from './schema-utils'

type Step = 'basics' | 'dimensions' | 'measures' | 'calculations' | 'validation'
type MeasureFilter = 'all' | 'physical' | 'calculated'
type SelectedMeasure = { kind: 'physical' | 'calculated'; index: number }
export function CubeWorkbench(props: {
	schema: JsonObject
	tables: string[]
	issues: StudioIssue[]
	locale?: string
	generatingMeasures?: boolean
	onChange(schema: JsonObject): void
	onGenerateMeasures(cubeIndex: number): void
}) {
	const i18n = React.useMemo(() => createCubeWorkbenchI18n(props.locale), [props.locale])
	const cubes = objectCollection(props.schema, 'cubes')
	const [selectedCubeIndex, setSelectedCubeIndex] = React.useState(0)
	const [activeStep, setActiveStep] = React.useState<Step>('measures')
	const [filter, setFilter] = React.useState<MeasureFilter>('all')
	const [search, setSearch] = React.useState('')
	const [selectedMeasure, setSelectedMeasure] = React.useState<SelectedMeasure | null>(null)

	React.useEffect(() => {
		setSelectedCubeIndex((index) => Math.max(0, Math.min(index, Math.max(0, cubes.length - 1))))
	}, [cubes.length])

	const cube = cubes[selectedCubeIndex]
	const rows = React.useMemo(() => (cube ? measureRows(cube) : []), [cube])
	const normalizedSearch = search.trim().toLowerCase()
	const filteredRows = rows.filter((row) => {
		if (filter !== 'all' && row.kind !== filter) {
			return false
		}
		return (
			!normalizedSearch || `${row.name} ${row.column} ${row.aggregator}`.toLowerCase().includes(normalizedSearch)
		)
	})
	const activeMeasure =
		selectedMeasure && cube
			? selectedMeasure.kind === 'physical'
				? objectCollection(cube, 'measures')[selectedMeasure.index]
				: objectCollection(cube, 'calculatedMembers')[selectedMeasure.index]
			: undefined

	React.useEffect(() => {
		if (!cube) {
			setSelectedMeasure(null)
			return
		}
		const nextRows = measureRows(cube)
		if (!nextRows.length) {
			setSelectedMeasure(null)
			return
		}
		const currentExists =
			selectedMeasure &&
			nextRows.some((row) => row.kind === selectedMeasure.kind && row.index === selectedMeasure.index)
		if (!currentExists) {
			const defaultMeasure = readString(cube, 'defaultMeasure')
			const preferred = nextRows.find((row) => row.name === defaultMeasure) ?? nextRows[0]
			setSelectedMeasure({ kind: preferred.kind, index: preferred.index })
		}
	}, [cube, selectedMeasure])

	const updateCubes = (nextCubes: JsonObject[]) => props.onChange(replaceCollection(props.schema, 'cubes', nextCubes))
	const updateCube = (nextCube: JsonObject) => updateCubes(replaceAt(cubes, selectedCubeIndex, nextCube))
	const addCube = () => {
		const nextIndex = cubes.length
		updateCubes(
			appendItem(cubes, {
				name: `Cube ${nextIndex + 1}`,
				caption: `Cube ${nextIndex + 1}`,
				fact: { type: 'table' },
				dimensionUsages: [],
				dimensions: [],
				measures: [],
				calculatedMembers: [],
				calculations: [],
				parameters: []
			})
		)
		setSelectedCubeIndex(nextIndex)
		setActiveStep('basics')
		setSelectedMeasure(null)
	}
	const selectCube = (index: number) => {
		setSelectedCubeIndex(index)
		setSelectedMeasure(null)
	}
	const addMeasure = (kind: SelectedMeasure['kind']) => {
		if (!cube) {
			return
		}
		const collection = kind === 'physical' ? 'measures' : 'calculatedMembers'
		const values = objectCollection(cube, collection)
		const nextValue: JsonObject =
			kind === 'physical'
				? {
						name: `Measure ${values.length + 1}`,
						column: '',
						aggregator: 'sum',
						datatype: 'Numeric',
						visible: true
					}
				: {
						name: `Calculated Measure ${values.length + 1}`,
						formula: '',
						datatype: 'Numeric',
						visible: true
					}
		updateCube(replaceCollection(cube, collection, appendItem(values, nextValue)))
		setSelectedMeasure({ kind, index: values.length })
	}

	if (!cube) {
		return (
			<div className="grid h-full min-h-[420px] place-items-center bg-background p-8">
				<div className="max-w-sm text-center">
					<div className="mx-auto grid size-10 place-items-center rounded-lg border bg-card">
						<Box className="size-5 text-muted-foreground" aria-hidden="true" />
					</div>
					<h1 className="mt-4 text-base font-semibold">{i18n.t('cubeEmptyTitle')}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{i18n.t('cubeEmptyDescription')}</p>
					<Button className="mt-4" size="sm" onClick={addCube}>
						<Plus aria-hidden="true" />
						{i18n.t('addCube')}
					</Button>
				</div>
			</div>
		)
	}

	const dimensionCount =
		objectCollection(cube, 'dimensionUsages').length + objectCollection(cube, 'dimensions').length
	const validCount = rows.filter((row) => row.valid).length
	const warningCount = rows.length - validCount
	const readiness = cubeReadiness(cube, rows)
	const cubeName = readString(cube, 'caption') ?? readString(cube, 'name') ?? `Cube ${selectedCubeIndex + 1}`
	const factTable = readFactTableName(cube)

	return (
		<div className="grid h-full min-h-0 grid-cols-[164px_minmax(0,1fr)] overflow-hidden bg-background max-[1100px]:grid-cols-1">
			<aside className="min-h-0 border-r bg-card/45 max-[1100px]:hidden">
				<div className="flex h-12 items-center justify-between border-b px-3">
					<span className="text-xs font-semibold">{i18n.t('cube')}</span>
					<Button variant="ghost" size="icon-xs" aria-label={i18n.t('moreActions')}>
						<EllipsisVertical aria-hidden="true" />
					</Button>
				</div>
				<div className="p-2">
					<Button variant="outline" size="sm" className="w-full justify-start" onClick={addCube}>
						<Plus aria-hidden="true" />
						{i18n.t('addCube')}
					</Button>
				</div>
				<ScrollArea className="h-[calc(100%-96px)] px-2 pb-2">
					<div className="space-y-1">
						{cubes.map((item, index) => {
							const selected = index === selectedCubeIndex
							return (
								<button
									key={`${index}:${readString(item, 'name') ?? ''}`}
									type="button"
									className={
										selected
											? 'w-full rounded-md bg-primary/8 px-2.5 py-2 text-left text-primary ring-1 ring-inset ring-primary/10'
											: 'w-full rounded-md px-2.5 py-2 text-left hover:bg-muted/60'
									}
									onClick={() => selectCube(index)}
								>
									<div className="truncate text-sm font-medium">
										{readString(item, 'caption') ?? readString(item, 'name') ?? `Cube ${index + 1}`}
									</div>
									<div className="mt-0.5 truncate text-[11px] text-muted-foreground">
										{readFactTableName(item) || i18n.t('noFactTable')}
									</div>
								</button>
							)
						})}
					</div>
				</ScrollArea>
			</aside>

			<main className="min-h-0 min-w-0 overflow-auto">
				<div className="mx-auto flex min-h-full max-w-[1180px] flex-col px-4 py-3">
					<CubeSummary
						cube={cube}
						name={cubeName}
						factTable={factTable}
						dimensionCount={dimensionCount}
						measureCount={rows.length}
						i18n={i18n}
						onEdit={() => setActiveStep('basics')}
						readinessControl={
							<CubeReadinessPopover
								schema={props.schema}
								issues={props.issues}
								readiness={readiness}
								i18n={i18n}
							/>
						}
					/>
					<StepNavigation active={activeStep} cube={cube} rows={rows} i18n={i18n} onSelect={setActiveStep} />
					<div className={activeStep === 'measures' ? 'min-h-0' : 'min-h-0 flex-1'}>
						{activeStep === 'basics' ? (
							<BasicInfoStep cube={cube} tables={props.tables} i18n={i18n} onChange={updateCube} />
						) : null}
						{activeStep === 'dimensions' ? (
							<DimensionsStep cube={cube} schema={props.schema} i18n={i18n} onChange={updateCube} />
						) : null}
						{activeStep === 'measures' ? (
							<MeasuresStep
								cube={cube}
								rows={rows}
								filteredRows={filteredRows}
								filter={filter}
								search={search}
								selected={selectedMeasure}
								activeMeasure={activeMeasure}
								generatingMeasures={props.generatingMeasures}
								i18n={i18n}
								onFilter={setFilter}
								onSearch={setSearch}
								onSelect={setSelectedMeasure}
								onAdd={addMeasure}
								onGenerate={() => props.onGenerateMeasures(selectedCubeIndex)}
								onChange={updateCube}
							/>
						) : null}
						{activeStep === 'calculations' ? (
							<CalculationsStep
								cube={cube}
								i18n={i18n}
								onChange={updateCube}
								onSelectCalculated={(index) => {
									setSelectedMeasure({ kind: 'calculated', index })
									setActiveStep('measures')
								}}
							/>
						) : null}
						{activeStep === 'validation' ? (
							<ValidationStep cube={cube} rows={rows} issues={props.issues} i18n={i18n} />
						) : null}
					</div>
					{activeStep === 'measures' ? (
						<MeasureValidationStrip
							rows={rows}
							validCount={validCount}
							warningCount={warningCount}
							i18n={i18n}
							onOpen={() => setActiveStep('validation')}
							onFix={(row) => setSelectedMeasure({ kind: row.kind, index: row.index })}
						/>
					) : null}
				</div>
			</main>
		</div>
	)
}
function CubeSummary(props: {
	cube: JsonObject
	name: string
	factTable: string
	dimensionCount: number
	measureCount: number
	i18n: CubeWorkbenchI18n
	readinessControl: React.ReactNode
	onEdit(): void
}) {
	return (
		<div className="grid min-h-20 grid-cols-[minmax(180px,1.4fr)_90px_90px_minmax(130px,1fr)_132px] items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-xs max-[1100px]:grid-cols-[minmax(0,1fr)_auto_auto_auto] max-[560px]:grid-cols-[minmax(0,1fr)_auto_auto]">
			<div className="flex min-w-0 items-center gap-3">
				<div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/8 text-primary">
					<Box className="size-4" aria-hidden="true" />
				</div>
				<div className="min-w-0">
					<button
						type="button"
						className="flex max-w-full items-center gap-1.5 text-left text-sm font-semibold hover:text-primary"
						onClick={props.onEdit}
					>
						<span className="truncate">{props.name}</span>
						<Pencil className="size-3 text-muted-foreground" aria-hidden="true" />
					</button>
					<div className="mt-0.5 truncate text-xs text-muted-foreground">
						{props.factTable || props.i18n.t('noFactTable')}
					</div>
				</div>
			</div>
			<SummaryMetric value={props.dimensionCount} label={props.i18n.t('dimension')} />
			<SummaryMetric value={props.measureCount} label={props.i18n.t('measure')} />
			<div className="min-w-0 max-[1100px]:hidden">
				<div className="text-[10px] text-muted-foreground">{props.i18n.t('defaultMeasureLabel')}</div>
				<div className="mt-1 truncate text-xs font-medium">
					{readString(props.cube, 'defaultMeasure') ?? '—'}
				</div>
			</div>
			{props.readinessControl}
		</div>
	)
}
function SummaryMetric(props: { value: number; label: string }) {
	return (
		<div>
			<div className="text-sm font-semibold">{props.value}</div>
			<div className="mt-0.5 text-[10px] text-muted-foreground">{props.label}</div>
		</div>
	)
}
function StepNavigation(props: {
	active: Step
	cube: JsonObject
	rows: MeasureRow[]
	i18n: CubeWorkbenchI18n
	onSelect(step: Step): void
}) {
	const basicsComplete = Boolean(readString(props.cube, 'name') && readFactTableName(props.cube))
	const dimensionsComplete =
		objectCollection(props.cube, 'dimensionUsages').length + objectCollection(props.cube, 'dimensions').length > 0
	const measuresComplete = props.rows.length > 0 && props.rows.every((row) => row.valid)
	const steps: Array<{ key: Step; label: string; complete: boolean }> = [
		{ key: 'basics', label: props.i18n.t('basicInfo'), complete: basicsComplete },
		{ key: 'dimensions', label: props.i18n.t('dimension'), complete: dimensionsComplete },
		{ key: 'measures', label: props.i18n.t('measure'), complete: measuresComplete },
		{
			key: 'calculations',
			label: props.i18n.t('calculations'),
			complete:
				objectCollection(props.cube, 'calculatedMembers').length > 0 &&
				objectCollection(props.cube, 'calculatedMembers').every((value) =>
					Boolean(readString(value, 'formula')?.trim())
				)
		},
		{ key: 'validation', label: props.i18n.t('stepValidation'), complete: measuresComplete }
	]
	return (
		<nav className="my-4 grid grid-cols-5" aria-label={props.i18n.t('cubeSummary')}>
			{steps.map((step, index) => {
				const active = step.key === props.active
				return (
					<button
						type="button"
						key={step.key}
						className={
							active
								? 'relative flex h-11 items-center justify-center gap-2 border-b-2 border-primary px-2 text-xs font-semibold text-foreground'
								: 'relative flex h-11 items-center justify-center gap-2 border-b px-2 text-xs text-muted-foreground hover:text-foreground'
						}
						onClick={() => props.onSelect(step.key)}
					>
						<span
							className={
								step.complete
									? 'grid size-5 place-items-center rounded-full bg-success text-[10px] text-white'
									: active
										? 'grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground'
										: 'grid size-5 place-items-center rounded-full bg-muted text-[10px] text-muted-foreground'
							}
						>
							{step.complete ? <Check className="size-3" aria-hidden="true" /> : index + 1}
						</span>
						<span className="max-[720px]:hidden">{step.label}</span>
					</button>
				)
			})}
		</nav>
	)
}
function BasicInfoStep(props: {
	cube: JsonObject
	tables: string[]
	i18n: CubeWorkbenchI18n
	onChange(cube: JsonObject): void
}) {
	const factTableName = readFactTableName(props.cube)
	const tableOptions = Array.from(new Set([factTableName, ...props.tables].filter(Boolean)))
	return (
		<StepCard title={props.i18n.t('editCube')} description={props.i18n.t('saveHint')}>
			<div className="grid gap-4 p-4 md:grid-cols-2">
				<TextField
					label={props.i18n.t('name')}
					value={readString(props.cube, 'name') ?? ''}
					onChange={(value) => props.onChange(setObjectValue(props.cube, 'name', value))}
				/>
				<TextField
					label={props.i18n.t('businessCaption')}
					value={readString(props.cube, 'caption') ?? ''}
					onChange={(value) => props.onChange(setObjectValue(props.cube, 'caption', value))}
				/>
				<div className="grid gap-1.5">
					<Label>{props.i18n.t('factTable')}</Label>
					<Select
						value={factTableName}
						onValueChange={(value) => props.onChange(setFactTableName(props.cube, value))}
					>
						<SelectTrigger>
							<SelectValue placeholder={props.i18n.t('selectFactTable')} />
						</SelectTrigger>
						<SelectContent>
							{tableOptions.map((table) => (
								<SelectItem key={table} value={table}>
									{table}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<TextField
					label={props.i18n.t('defaultMeasureLabel')}
					value={readString(props.cube, 'defaultMeasure') ?? ''}
					onChange={(value) => props.onChange(setObjectValue(props.cube, 'defaultMeasure', value))}
				/>
				<div className="grid gap-1.5 md:col-span-2">
					<Label>{props.i18n.t('description')}</Label>
					<Textarea
						className="min-h-24"
						value={readString(props.cube, 'description') ?? ''}
						onChange={(event) =>
							props.onChange(setObjectValue(props.cube, 'description', event.currentTarget.value))
						}
					/>
				</div>
			</div>
		</StepCard>
	)
}

function DimensionsStep(props: {
	cube: JsonObject
	schema: JsonObject
	i18n: CubeWorkbenchI18n
	onChange(cube: JsonObject): void
}) {
	const usages = objectCollection(props.cube, 'dimensionUsages')
	const localDimensions = objectCollection(props.cube, 'dimensions')
	const sharedNames = objectCollection(props.schema, 'dimensions')
		.map((dimension) => readString(dimension, 'name'))
		.filter((name): name is string => Boolean(name))
	const updateUsages = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.cube, 'dimensionUsages', items))
	return (
		<StepCard title={props.i18n.t('dimension')} description={props.i18n.t('saveHint')}>
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="text-xs text-muted-foreground">
					{usages.length} {props.i18n.t('dimensionUsage')} · {localDimensions.length}{' '}
					{props.i18n.t('localDimensions')}
				</div>
				<Button
					size="sm"
					variant="outline"
					disabled={!sharedNames.length}
					onClick={() =>
						updateUsages(
							appendItem(usages, {
								name: sharedNames[0] ?? `Dimension ${usages.length + 1}`,
								source: sharedNames[0] ?? '',
								foreignKey: ''
							})
						)
					}
				>
					<Plus aria-hidden="true" />
					{props.i18n.t('addDimensionUsage')}
				</Button>
			</div>
			<div className="divide-y">
				{usages.map((usage, index) => (
					<div
						key={`${index}:${readString(usage, 'name') ?? ''}`}
						className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3 p-4"
					>
						<TextField
							label={props.i18n.t('name')}
							value={readString(usage, 'name') ?? ''}
							onChange={(value) =>
								updateUsages(replaceAt(usages, index, setObjectValue(usage, 'name', value)))
							}
						/>
						<div className="grid gap-1.5">
							<Label>{props.i18n.t('source')}</Label>
							<Select
								value={readString(usage, 'source') ?? ''}
								onValueChange={(value) =>
									updateUsages(replaceAt(usages, index, setObjectValue(usage, 'source', value)))
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{sharedNames.map((name) => (
										<SelectItem key={name} value={name}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<TextField
							label={props.i18n.t('column')}
							value={readString(usage, 'foreignKey') ?? ''}
							onChange={(value) =>
								updateUsages(replaceAt(usages, index, setObjectValue(usage, 'foreignKey', value)))
							}
						/>
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
							onClick={() => updateUsages(removeAt(usages, index))}
						>
							{props.i18n.t('remove')}
						</Button>
					</div>
				))}
			</div>
		</StepCard>
	)
}

function MeasuresStep(props: {
	cube: JsonObject
	rows: MeasureRow[]
	filteredRows: MeasureRow[]
	filter: MeasureFilter
	search: string
	selected: SelectedMeasure | null
	activeMeasure?: JsonObject
	generatingMeasures?: boolean
	i18n: CubeWorkbenchI18n
	onFilter(filter: MeasureFilter): void
	onSearch(value: string): void
	onSelect(value: SelectedMeasure): void
	onAdd(kind: SelectedMeasure['kind']): void
	onGenerate(): void
	onChange(cube: JsonObject): void
}) {
	const physicalCount = props.rows.filter((row) => row.kind === 'physical').length
	const calculatedCount = props.rows.length - physicalCount
	return (
		<div>
			<p className="mb-3 text-xs text-muted-foreground">{props.i18n.t('measureDescription')}</p>
			<div className="grid min-h-[480px] grid-cols-[minmax(360px,1.25fr)_minmax(280px,0.9fr)] overflow-hidden rounded-lg border bg-card shadow-xs max-[880px]:grid-cols-1">
				<section className="min-w-0 border-r max-[880px]:border-r-0 max-[880px]:border-b">
					<div className="flex flex-wrap items-center gap-2 border-b p-3">
						<Button size="sm" onClick={() => props.onAdd('physical')}>
							<Plus aria-hidden="true" />
							{props.i18n.t('addMeasure')}
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={props.generatingMeasures || !readFactTableName(props.cube)}
							onClick={props.onGenerate}
						>
							<Sparkles aria-hidden="true" />
							{props.i18n.t('fromFields')}
						</Button>
						<div className="min-w-32 flex-1" />
						<div className="relative">
							<Search
								className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								className="h-8 w-36 pl-8 text-xs"
								value={props.search}
								placeholder={props.i18n.t('searchMeasures')}
								onChange={(event) => props.onSearch(event.currentTarget.value)}
							/>
						</div>
					</div>
					<div className="flex items-center gap-1 border-b px-3 py-2">
						<FilterButton
							active={props.filter === 'all'}
							label={`${props.i18n.t('all')} (${props.rows.length})`}
							onClick={() => props.onFilter('all')}
						/>
						<FilterButton
							active={props.filter === 'physical'}
							label={`${props.i18n.t('physical')} (${physicalCount})`}
							onClick={() => props.onFilter('physical')}
						/>
						<FilterButton
							active={props.filter === 'calculated'}
							label={`${props.i18n.t('calculated')} (${calculatedCount})`}
							onClick={() => props.onFilter('calculated')}
						/>
					</div>
					<div className="grid grid-cols-[minmax(150px,1.35fr)_62px_72px_minmax(100px,1fr)_28px] items-center border-b px-3 py-2 text-[10px] font-medium text-muted-foreground">
						<span>{props.i18n.t('measureName')}</span>
						<span>{props.i18n.t('type')}</span>
						<span>{props.i18n.t('aggregator')}</span>
						<span>{props.i18n.t('column')}</span>
						<span />
					</div>
					<div className="max-h-[360px] min-h-72 overflow-auto">
						{props.filteredRows.map((row) => {
							const selected = props.selected?.kind === row.kind && props.selected.index === row.index
							return (
								<button
									type="button"
									key={row.id}
									className={
										selected
											? 'grid w-full grid-cols-[minmax(150px,1.35fr)_62px_72px_minmax(100px,1fr)_28px] items-center border-b bg-primary/6 px-3 py-2.5 text-left text-xs text-primary shadow-[inset_2px_0_0_var(--primary)]'
											: 'grid w-full grid-cols-[minmax(150px,1.35fr)_62px_72px_minmax(100px,1fr)_28px] items-center border-b px-3 py-2.5 text-left text-xs hover:bg-muted/35'
									}
									onClick={() => props.onSelect({ kind: row.kind, index: row.index })}
								>
									<span className="flex min-w-0 items-center gap-2 font-medium">
										{row.kind === 'calculated' ? (
											<Sigma className="size-3.5 shrink-0" aria-hidden="true" />
										) : (
											<Database className="size-3.5 shrink-0" aria-hidden="true" />
										)}
										<span className="truncate">{row.name}</span>
									</span>
									<span className="text-muted-foreground">
										{row.kind === 'physical'
											? props.i18n.t('physical')
											: props.i18n.t('calculated')}
									</span>
									<span className="truncate text-muted-foreground">{row.aggregator || '—'}</span>
									<span className="truncate text-muted-foreground">{row.column || '—'}</span>
									<EllipsisVertical className="size-3.5 text-muted-foreground" aria-hidden="true" />
								</button>
							)
						})}
						{!props.filteredRows.length ? (
							<div className="grid min-h-40 place-items-center px-6 text-center text-xs text-muted-foreground">
								{props.rows.length ? props.i18n.t('noMatchingMeasures') : props.i18n.t('noMeasures')}
							</div>
						) : null}
					</div>
					<div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
						{props.filteredRows.length} / {props.rows.length}
					</div>
				</section>
				<MeasureInspector
					cube={props.cube}
					selected={props.selected}
					value={props.activeMeasure}
					i18n={props.i18n}
					onChange={props.onChange}
				/>
			</div>
		</div>
	)
}

function MeasureInspector(props: {
	cube: JsonObject
	selected: SelectedMeasure | null
	value?: JsonObject
	i18n: CubeWorkbenchI18n
	onChange(cube: JsonObject): void
}) {
	if (!props.selected || !props.value) {
		return (
			<div className="grid min-h-72 place-items-center p-6 text-center">
				<div>
					<PanelRightClose className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
					<p className="mt-2 text-xs text-muted-foreground">{props.i18n.t('selectMeasure')}</p>
				</div>
			</div>
		)
	}
	const selected = props.selected
	const value = props.value
	const collection = selected.kind === 'physical' ? 'measures' : 'calculatedMembers'
	const items = objectCollection(props.cube, collection)
	const updateValue = (nextValue: JsonObject) =>
		props.onChange(replaceCollection(props.cube, collection, replaceAt(items, selected.index, nextValue)))
	const update = (field: string, nextValue: string | boolean | undefined) => {
		const previousName = readString(value, 'name')
		let nextCube = replaceCollection(
			props.cube,
			collection,
			replaceAt(items, selected.index, setObjectValue(value, field, nextValue))
		)
		if (
			field === 'name' &&
			previousName &&
			readString(props.cube, 'defaultMeasure') === previousName &&
			typeof nextValue === 'string'
		) {
			nextCube = setObjectValue(nextCube, 'defaultMeasure', nextValue)
		}
		props.onChange(nextCube)
	}
	const name = readString(value, 'name') ?? ''
	const isDefault = Boolean(name && readString(props.cube, 'defaultMeasure') === name)
	return (
		<section className="min-w-0">
			<div className="flex h-12 items-center justify-between border-b px-4">
				<div className="text-xs font-semibold">
					{selected.kind === 'physical' ? props.i18n.t('editMeasure') : props.i18n.t('editCalculatedMeasure')}
				</div>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={props.i18n.t('remove')}
					className="text-muted-foreground hover:text-destructive"
					onClick={() => {
						const nextCube = replaceCollection(props.cube, collection, removeAt(items, selected.index))
						props.onChange(isDefault ? setObjectValue(nextCube, 'defaultMeasure', undefined) : nextCube)
					}}
				>
					<X aria-hidden="true" />
				</Button>
			</div>
			<div className="space-y-4 p-4">
				<TextField
					label={props.i18n.t('name')}
					value={name}
					required
					onChange={(value) => update('name', value)}
				/>
				<TextField
					label={props.i18n.t('caption')}
					value={readString(value, 'caption') ?? ''}
					onChange={(value) => update('caption', value)}
				/>
				{selected.kind === 'physical' ? (
					<>
						<Separator />
						<div className="text-[11px] font-semibold">{props.i18n.t('source')}</div>
						<div className="grid grid-cols-[1fr_110px] gap-3">
							<TextField
								label={props.i18n.t('column')}
								value={readString(value, 'column') ?? ''}
								required
								onChange={(value) => update('column', value)}
							/>
							<div className="grid gap-1.5">
								<Label>{props.i18n.t('dataType')}</Label>
								<Select
									value={readString(value, 'datatype') ?? 'Numeric'}
									onValueChange={(value) => update('datatype', value)}
								>
									<SelectTrigger>
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
							</div>
						</div>
						<div className="grid gap-1.5">
							<Label>
								{props.i18n.t('aggregator')} <span className="text-destructive">*</span>
							</Label>
							<Select
								value={readString(value, 'aggregator') ?? 'sum'}
								onValueChange={(value) => update('aggregator', value)}
							>
								<SelectTrigger>
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
						</div>
					</>
				) : (
					<div className="grid gap-1.5">
						<Label>
							{props.i18n.t('formula')} <span className="text-destructive">*</span>
						</Label>
						<Textarea
							className="min-h-28 font-mono text-xs"
							value={readString(value, 'formula') ?? ''}
							onChange={(event) => update('formula', event.currentTarget.value)}
						/>
					</div>
				)}
				<Separator />
				<div className="text-[11px] font-semibold">{props.i18n.t('format')}</div>
				<TextField
					label={props.i18n.t('formatString')}
					value={readString(value, 'formatString') ?? ''}
					placeholder="#,##0.00"
					onChange={(value) => update('formatString', value)}
				/>
				<Separator />
				<div className="space-y-3">
					<ToggleRow
						label={props.i18n.t('defaultMeasure')}
						checked={isDefault}
						onChange={(checked) =>
							props.onChange(
								setObjectValue(props.cube, 'defaultMeasure', checked && name ? name : undefined)
							)
						}
					/>
					<ToggleRow
						label={props.i18n.t('semanticVisibility')}
						checked={value['visible'] !== false}
						onChange={(checked) => updateValue(setObjectValue(value, 'visible', checked))}
					/>
				</div>
			</div>
		</section>
	)
}

function CalculationsStep(props: {
	cube: JsonObject
	i18n: CubeWorkbenchI18n
	onChange(cube: JsonObject): void
	onSelectCalculated(index: number): void
}) {
	const members = objectCollection(props.cube, 'calculatedMembers')
	const calculations = objectCollection(props.cube, 'calculations')
	return (
		<StepCard title={props.i18n.t('calculations')} description={props.i18n.t('saveHint')}>
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="text-xs text-muted-foreground">
					{members.length} {props.i18n.t('calculated')} · {calculations.length} {props.i18n.t('calculations')}
				</div>
				<Button
					size="sm"
					onClick={() => {
						const nextMembers = appendItem(members, {
							name: `Calculated Measure ${members.length + 1}`,
							formula: '',
							visible: true
						})
						props.onChange(replaceCollection(props.cube, 'calculatedMembers', nextMembers))
						props.onSelectCalculated(members.length)
					}}
				>
					<Plus aria-hidden="true" />
					{props.i18n.t('addCalculatedMeasure')}
				</Button>
			</div>
			<div className="divide-y">
				{members.map((member, index) => (
					<button
						type="button"
						key={`${index}:${readString(member, 'name') ?? ''}`}
						className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/35"
						onClick={() => props.onSelectCalculated(index)}
					>
						<FunctionSquare className="size-4 text-primary" aria-hidden="true" />
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium">
								{readString(member, 'name') ?? `${props.i18n.t('calculated')} ${index + 1}`}
							</div>
							<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
								{readString(member, 'formula') || '—'}
							</div>
						</div>
						<ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
					</button>
				))}
			</div>
		</StepCard>
	)
}

function StepCard(props: { title: string; description: string; children: React.ReactNode }) {
	return (
		<section className="overflow-hidden rounded-lg border bg-card shadow-xs">
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-semibold">{props.title}</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p>
			</div>
			{props.children}
		</section>
	)
}

function TextField(props: {
	label: string
	value: string
	placeholder?: string
	required?: boolean
	onChange(value: string): void
}) {
	const id = React.useId()
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>
				{props.label} {props.required ? <span className="text-destructive">*</span> : null}
			</Label>
			<Input
				id={id}
				value={props.value}
				placeholder={props.placeholder}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

function ToggleRow(props: { label: string; checked: boolean; onChange(checked: boolean): void }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<Label>{props.label}</Label>
			<Switch checked={props.checked} onCheckedChange={props.onChange} />
		</div>
	)
}

function FilterButton(props: { active: boolean; label: string; onClick(): void }) {
	return (
		<Button
			variant={props.active ? 'secondary' : 'ghost'}
			size="xs"
			className={props.active ? 'bg-primary/8 text-primary hover:bg-primary/12' : undefined}
			onClick={props.onClick}
		>
			{props.label}
		</Button>
	)
}
