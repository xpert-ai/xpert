import * as React from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Badge,
	Button,
	cn,
	Input,
	Label,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Progress,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Switch
} from '@xpert-ai/shadcn-ui'
import {
	Box,
	CalendarDays,
	CheckCircle2,
	ChevronDown,
	Copy,
	Layers3,
	Plus,
	Search,
	Table2,
	Trash2,
	TriangleAlert
} from 'lucide-react'
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { createDimensionStudioI18n, DimensionStudioI18n } from './dimension-studio-i18n'
import {
	appendItem,
	objectCollection,
	readFirstTableName,
	removeAt,
	replaceAt,
	replaceCollection,
	setFirstTableName,
	setObjectValue
} from './schema-utils'

export function DimensionEditor(props: {
	schema: JsonObject
	tables: string[]
	locale?: string
	onChange(schema: JsonObject): void
}) {
	const i18n = React.useMemo(() => createDimensionStudioI18n(props.locale), [props.locale])
	const dimensions = objectCollection(props.schema, 'dimensions')
	const [selectedDimensionIndex, setSelectedDimensionIndex] = React.useState(0)
	const [selectedHierarchyIndex, setSelectedHierarchyIndex] = React.useState(0)
	const [selectedLevelIndex, setSelectedLevelIndex] = React.useState<number | null>(0)
	const [search, setSearch] = React.useState('')

	React.useEffect(() => {
		setSelectedDimensionIndex((index) => Math.max(0, Math.min(index, Math.max(0, dimensions.length - 1))))
	}, [dimensions.length])

	const dimension = dimensions[selectedDimensionIndex]
	const hierarchies = dimension ? objectCollection(dimension, 'hierarchies') : []

	React.useEffect(() => {
		setSelectedHierarchyIndex((index) => Math.max(0, Math.min(index, Math.max(0, hierarchies.length - 1))))
	}, [hierarchies.length, selectedDimensionIndex])

	const hierarchy = hierarchies[selectedHierarchyIndex]
	const levels = hierarchy ? objectCollection(hierarchy, 'levels') : []

	React.useEffect(() => {
		setSelectedLevelIndex((index) => {
			if (!levels.length) {
				return null
			}
			return Math.max(0, Math.min(index ?? 0, levels.length - 1))
		})
	}, [levels.length, selectedHierarchyIndex])

	const updateDimensions = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.schema, 'dimensions', items))
	const updateDimension = (next: JsonObject) => updateDimensions(replaceAt(dimensions, selectedDimensionIndex, next))
	const updateHierarchies = (items: JsonObject[]) => {
		if (dimension) {
			updateDimension(replaceCollection(dimension, 'hierarchies', items))
		}
	}
	const updateHierarchy = (next: JsonObject) =>
		updateHierarchies(replaceAt(hierarchies, selectedHierarchyIndex, next))
	const updateLevels = (items: JsonObject[]) => {
		if (hierarchy) {
			updateHierarchy(replaceCollection(hierarchy, 'levels', items))
		}
	}

	const addDimension = () => {
		const nextIndex = dimensions.length
		updateDimensions(
			appendItem(dimensions, {
				name: `Dimension ${nextIndex + 1}`,
				caption: `Dimension ${nextIndex + 1}`,
				type: 'StandardDimension',
				visible: true,
				description: '',
				hierarchies: [newHierarchy(1)]
			})
		)
		setSelectedDimensionIndex(nextIndex)
		setSelectedHierarchyIndex(0)
		setSelectedLevelIndex(null)
	}

	if (!dimension) {
		return (
			<div className="grid h-full min-h-[420px] place-items-center bg-background p-8">
				<div className="max-w-sm text-center">
					<div className="mx-auto grid size-10 place-items-center rounded-lg border bg-card">
						<Box className="size-5 text-muted-foreground" aria-hidden="true" />
					</div>
					<h1 className="mt-4 text-base font-semibold">{i18n.t('sharedDimensions')}</h1>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">{i18n.t('emptyDescription')}</p>
					<Button className="mt-4" size="sm" onClick={addDimension}>
						<Plus aria-hidden="true" />
						{i18n.t('addDimension')}
					</Button>
				</div>
			</div>
		)
	}

	const displayName =
		readString(dimension, 'caption') ??
		readString(dimension, 'name') ??
		`${i18n.t('dimension')} ${selectedDimensionIndex + 1}`
	const readiness = dimensionReadiness(dimension)
	const totalLevels = hierarchies.reduce((count, item) => count + objectCollection(item, 'levels').length, 0)
	const filteredDimensions = dimensions
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => {
			const text = `${readString(item, 'name') ?? ''} ${readString(item, 'caption') ?? ''}`.toLowerCase()
			return !search.trim() || text.includes(search.trim().toLowerCase())
		})

	return (
		<div
			className="grid h-full min-h-0 min-w-0 grid-cols-[176px_minmax(0,1fr)] overflow-hidden bg-background max-[900px]:grid-cols-1"
			data-testid="dimension-studio"
		>
			<aside className="min-h-0 border-r bg-card/45 max-[900px]:hidden">
				<div className="flex h-11 items-center justify-between border-b px-3">
					<div className="flex items-center gap-2 text-xs font-semibold">
						<Layers3 className="size-4 text-primary" aria-hidden="true" />
						{i18n.t('sharedDimensions')}
					</div>
					<Button variant="ghost" size="icon-xs" aria-label={i18n.t('addDimension')} onClick={addDimension}>
						<Plus aria-hidden="true" />
					</Button>
				</div>
				<div className="border-b p-2">
					<div className="relative">
						<Search
							className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							className="h-7 pl-8 text-xs"
							value={search}
							placeholder={i18n.t('searchDimensions')}
							onChange={(event) => setSearch(event.currentTarget.value)}
						/>
					</div>
				</div>
				<ScrollArea className="h-[calc(100%-89px)]">
					<div className="space-y-1 p-2">
						{filteredDimensions.map(({ item, index }) => {
							const selected = index === selectedDimensionIndex
							const itemName =
								readString(item, 'caption') ??
								readString(item, 'name') ??
								`${i18n.t('dimension')} ${index + 1}`
							const ItemIcon = readString(item, 'type') === 'TimeDimension' ? CalendarDays : Box
							return (
								<button
									key={`${index}:${readString(item, 'name') ?? ''}`}
									type="button"
									className={cn(
										'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
										selected
											? 'bg-primary/8 text-primary ring-1 ring-inset ring-primary/10'
											: 'hover:bg-muted/60'
									)}
									onClick={() => {
										setSelectedDimensionIndex(index)
										setSelectedHierarchyIndex(0)
										setSelectedLevelIndex(0)
									}}
								>
									<ItemIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">{itemName}</span>
										<span className="mt-0.5 block text-[10px] text-muted-foreground">
											{i18n.t('hierarchyCount', {
												count: objectCollection(item, 'hierarchies').length
											})}
										</span>
									</span>
								</button>
							)
						})}
					</div>
				</ScrollArea>
			</aside>

			<main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
				<header className="flex h-[58px] shrink-0 items-center gap-3 border-b bg-card/70 px-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h1 className="truncate text-sm font-semibold">
								{i18n.t('dimension')} / {displayName}
							</h1>
							<Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
								{i18n.t('hierarchyCount', { count: hierarchies.length })} ·{' '}
								{i18n.t('levelCount', { count: totalLevels })}
							</Badge>
						</div>
						<p className="mt-1 truncate text-[11px] text-muted-foreground">{i18n.t('studioSubtitle')}</p>
					</div>
					<DimensionReadiness dimension={dimension} i18n={i18n} readiness={readiness} />
					<ConfirmDelete
						i18n={i18n}
						name={displayName}
						title={i18n.t('deleteDimensionTitle')}
						description={i18n.t('deleteDimensionDescription', { name: displayName })}
						iconOnly
						onDelete={() => {
							updateDimensions(removeAt(dimensions, selectedDimensionIndex))
							setSelectedDimensionIndex(Math.max(0, selectedDimensionIndex - 1))
						}}
					/>
				</header>

				<DimensionBasics i18n={i18n} dimension={dimension} onChange={updateDimension} />

				<div className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
					{hierarchies.map((item, index) => (
						<button
							key={`${index}:${readString(item, 'name') ?? ''}`}
							type="button"
							className={cn(
								'flex h-7 max-w-[180px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
								index === selectedHierarchyIndex
									? 'bg-muted text-foreground shadow-sm'
									: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
							)}
							onClick={() => {
								setSelectedHierarchyIndex(index)
								setSelectedLevelIndex(0)
							}}
						>
							<span className="truncate">
								{readString(item, 'caption') ??
									readString(item, 'name') ??
									`${i18n.t('hierarchy')} ${index + 1}`}
							</span>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{objectCollection(item, 'levels').length}
							</span>
						</button>
					))}
					<Button
						variant="ghost"
						size="icon-xs"
						className="ml-1"
						aria-label={i18n.t('addHierarchy')}
						onClick={() => {
							const nextIndex = hierarchies.length
							updateHierarchies(appendItem(hierarchies, newHierarchy(nextIndex + 1)))
							setSelectedHierarchyIndex(nextIndex)
							setSelectedLevelIndex(null)
						}}
					>
						<Plus aria-hidden="true" />
					</Button>
				</div>

				{hierarchy ? (
					<div className="grid min-h-0 flex-1 grid-cols-[196px_minmax(0,1fr)_292px] overflow-hidden max-[1120px]:grid-cols-[196px_minmax(0,1fr)] max-[820px]:grid-cols-1">
						<DimensionAssets
							i18n={i18n}
							hierarchy={hierarchy}
							levels={levels}
							tables={props.tables}
							selectedLevelIndex={selectedLevelIndex}
							onSelectLevel={setSelectedLevelIndex}
							onAddLevel={() => {
								const nextIndex = levels.length
								updateLevels(
									appendItem(levels, {
										name: `Level ${nextIndex + 1}`,
										caption: '',
										column: '',
										type: 'String',
										levelType: 'Regular',
										uniqueMembers: false
									})
								)
								setSelectedLevelIndex(nextIndex)
							}}
							onSelectTable={(table) => updateHierarchy(setFirstTableName(hierarchy, table))}
						/>

						<HierarchyWorkspace
							i18n={i18n}
							hierarchy={hierarchy}
							levels={levels}
							tables={props.tables}
							selectedLevelIndex={selectedLevelIndex}
							onSelectLevel={setSelectedLevelIndex}
							onChange={updateHierarchy}
							onDuplicate={() => {
								const copy = duplicateHierarchy(hierarchy)
								updateHierarchies(appendItem(hierarchies, copy))
								setSelectedHierarchyIndex(hierarchies.length)
								setSelectedLevelIndex(objectCollection(copy, 'levels').length ? 0 : null)
							}}
							onDelete={() => {
								updateHierarchies(removeAt(hierarchies, selectedHierarchyIndex))
								setSelectedHierarchyIndex(Math.max(0, selectedHierarchyIndex - 1))
							}}
						/>

						<aside className="min-h-0 overflow-hidden border-l bg-card/35 max-[1120px]:hidden">
							<div className="flex h-11 items-center border-b px-3 text-xs font-semibold">
								{i18n.t('levelProperties')}
							</div>
							<ScrollArea className="h-[calc(100%-44px)]">
								{selectedLevelIndex !== null && levels[selectedLevelIndex] ? (
									<LevelInspector
										i18n={i18n}
										level={levels[selectedLevelIndex]}
										onChange={(next) => updateLevels(replaceAt(levels, selectedLevelIndex, next))}
										onDelete={() => {
											updateLevels(removeAt(levels, selectedLevelIndex))
											setSelectedLevelIndex(Math.max(0, selectedLevelIndex - 1))
										}}
									/>
								) : (
									<div className="p-6 text-center text-xs leading-5 text-muted-foreground">
										{i18n.t('noSelection')}
									</div>
								)}
							</ScrollArea>
						</aside>
					</div>
				) : (
					<div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
						<div>
							<Layers3 className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
							<p className="mt-2 text-xs text-muted-foreground">{i18n.t('emptyLevels')}</p>
							<Button className="mt-3" size="sm" onClick={() => updateHierarchies([newHierarchy(1)])}>
								<Plus aria-hidden="true" />
								{i18n.t('addHierarchy')}
							</Button>
						</div>
					</div>
				)}
			</main>
		</div>
	)
}

function DimensionBasics(props: {
	i18n: DimensionStudioI18n
	dimension: JsonObject
	onChange(dimension: JsonObject): void
}) {
	const setValue = (key: string, value: JsonValue) => props.onChange(setObjectValue(props.dimension, key, value))
	return (
		<div className="grid shrink-0 grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_150px_minmax(160px,1.4fr)_92px] gap-2 border-b bg-muted/10 px-3 py-2 max-[1050px]:grid-cols-3">
			<CompactTextField
				label={props.i18n.t('technicalName')}
				value={readString(props.dimension, 'name') ?? ''}
				onChange={(value) => setValue('name', value)}
			/>
			<CompactTextField
				label={props.i18n.t('businessTitle')}
				value={readString(props.dimension, 'caption') ?? ''}
				onChange={(value) => setValue('caption', value)}
			/>
			<div className="grid gap-1">
				<Label className="text-[10px] font-medium text-muted-foreground">{props.i18n.t('dimensionType')}</Label>
				<Select
					value={readString(props.dimension, 'type') ?? 'StandardDimension'}
					onValueChange={(value) => setValue('type', value)}
				>
					<SelectTrigger className="h-7 bg-background text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="StandardDimension">{props.i18n.t('standard')}</SelectItem>
						<SelectItem value="TimeDimension">{props.i18n.t('time')}</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<CompactTextField
				label={props.i18n.t('description')}
				value={readString(props.dimension, 'description') ?? ''}
				onChange={(value) => setValue('description', value)}
			/>
			<div className="grid gap-1">
				<Label className="text-[10px] font-medium text-muted-foreground">{props.i18n.t('visible')}</Label>
				<div className="flex h-7 items-center justify-between rounded-md border bg-background px-2">
					<span className="text-[10px] text-muted-foreground">{props.i18n.t('visible')}</span>
					<Switch
						checked={props.dimension['visible'] !== false}
						onCheckedChange={(checked) => setValue('visible', checked)}
					/>
				</div>
			</div>
		</div>
	)
}

function DimensionAssets(props: {
	i18n: DimensionStudioI18n
	hierarchy: JsonObject
	levels: JsonObject[]
	tables: string[]
	selectedLevelIndex: number | null
	onSelectLevel(index: number): void
	onAddLevel(): void
	onSelectTable(table: string): void
}) {
	const selectedTable = readFirstTableName(props.hierarchy)
	return (
		<aside className="min-h-0 overflow-hidden border-r bg-card/25 max-[820px]:hidden">
			<ScrollArea className="h-full">
				<div className="flex h-10 items-center justify-between border-b px-3">
					<span className="text-xs font-semibold">{props.i18n.t('levels')}</span>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={props.i18n.t('addLevel')}
						onClick={props.onAddLevel}
					>
						<Plus aria-hidden="true" />
					</Button>
				</div>
				<div className="space-y-1 p-2">
					{props.levels.map((level, index) => (
						<button
							key={`${index}:${readString(level, 'name') ?? ''}`}
							type="button"
							className={cn(
								'w-full rounded-md px-2.5 py-2 text-left transition-colors',
								index === props.selectedLevelIndex ? 'bg-primary/8 text-primary' : 'hover:bg-muted/60'
							)}
							onClick={() => props.onSelectLevel(index)}
						>
							<div className="truncate text-xs font-medium">
								{readString(level, 'caption') ?? readString(level, 'name') ?? `Level ${index + 1}`}
							</div>
							<div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
								{readString(level, 'column') || '—'}
							</div>
						</button>
					))}
				</div>
				<Separator />
				<div className="flex h-10 items-center px-3 text-xs font-semibold">{props.i18n.t('sourceTables')}</div>
				<div className="space-y-1 px-2 pb-3">
					{props.tables.map((table) => (
						<button
							key={table}
							type="button"
							className={cn(
								'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
								table === selectedTable
									? 'bg-muted font-medium text-foreground'
									: 'text-muted-foreground hover:bg-muted/60'
							)}
							onClick={() => props.onSelectTable(table)}
						>
							<Table2 className="size-3.5 shrink-0" aria-hidden="true" />
							<span className="truncate">{table}</span>
						</button>
					))}
				</div>
			</ScrollArea>
		</aside>
	)
}

function HierarchyWorkspace(props: {
	i18n: DimensionStudioI18n
	hierarchy: JsonObject
	levels: JsonObject[]
	tables: string[]
	selectedLevelIndex: number | null
	onSelectLevel(index: number): void
	onChange(hierarchy: JsonObject): void
	onDuplicate(): void
	onDelete(): void
}) {
	const setValue = (key: string, value: JsonValue) => props.onChange(setObjectValue(props.hierarchy, key, value))
	const hierarchyName =
		readString(props.hierarchy, 'caption') ?? readString(props.hierarchy, 'name') ?? props.i18n.t('hierarchy')
	return (
		<section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
			<div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-xs font-semibold">
						{props.i18n.t('mapping')} · {hierarchyName}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={props.i18n.t('duplicateHierarchy')}
					onClick={props.onDuplicate}
				>
					<Copy aria-hidden="true" />
				</Button>
				<ConfirmDelete
					i18n={props.i18n}
					name={hierarchyName}
					title={props.i18n.t('deleteHierarchyTitle')}
					description={props.i18n.t('deleteHierarchyDescription', { name: hierarchyName })}
					iconOnly
					onDelete={props.onDelete}
				/>
			</div>
			<div className="grid shrink-0 grid-cols-[minmax(140px,1fr)_minmax(150px,1fr)_minmax(140px,1fr)_110px] gap-2 border-b bg-muted/10 px-3 py-2 max-[980px]:grid-cols-2">
				<CompactTextField
					label={props.i18n.t('hierarchyName')}
					value={readString(props.hierarchy, 'name') ?? ''}
					onChange={(value) => setValue('name', value)}
				/>
				<div className="grid gap-1">
					<Label className="text-[10px] font-medium text-muted-foreground">
						{props.i18n.t('sourceTables')}
					</Label>
					<Select
						value={readFirstTableName(props.hierarchy)}
						onValueChange={(value) => props.onChange(setFirstTableName(props.hierarchy, value))}
					>
						<SelectTrigger className="h-7 bg-background text-xs">
							<SelectValue placeholder={props.i18n.t('chooseTable')} />
						</SelectTrigger>
						<SelectContent>
							{props.tables.map((table) => (
								<SelectItem key={table} value={table}>
									{table}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<CompactTextField
					label={props.i18n.t('primaryKey')}
					value={readString(props.hierarchy, 'primaryKey') ?? ''}
					onChange={(value) => setValue('primaryKey', value)}
				/>
				<div className="grid gap-1">
					<Label className="text-[10px] font-medium text-muted-foreground">{props.i18n.t('allMember')}</Label>
					<div className="flex h-7 items-center justify-between rounded-md border bg-background px-2">
						<span className="text-[10px] text-muted-foreground">All</span>
						<Switch
							checked={props.hierarchy['hasAll'] !== false}
							onCheckedChange={(checked) => setValue('hasAll', checked)}
						/>
					</div>
				</div>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="min-w-[650px]">
					<div className="grid h-8 grid-cols-[minmax(150px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px_110px] items-center border-b bg-muted/20 px-3 text-[10px] font-medium text-muted-foreground">
						<span>{props.i18n.t('levelName')}</span>
						<span>{props.i18n.t('keyColumn')}</span>
						<span>{props.i18n.t('captionColumn')}</span>
						<span>{props.i18n.t('dataType')}</span>
						<span>{props.i18n.t('levelType')}</span>
					</div>
					{props.levels.map((level, index) => (
						<button
							key={`${index}:${readString(level, 'name') ?? ''}`}
							type="button"
							className={cn(
								'grid h-11 w-full grid-cols-[minmax(150px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_110px_110px] items-center border-b px-3 text-left text-xs transition-colors',
								index === props.selectedLevelIndex ? 'bg-primary/5' : 'hover:bg-muted/25'
							)}
							onClick={() => props.onSelectLevel(index)}
						>
							<span className="truncate font-medium">
								{readString(level, 'caption') ?? readString(level, 'name') ?? `Level ${index + 1}`}
							</span>
							<span className="truncate font-mono text-[10px] text-muted-foreground">
								{readString(level, 'column') || '—'}
							</span>
							<span className="truncate font-mono text-[10px] text-muted-foreground">
								{readString(level, 'captionColumn') || '—'}
							</span>
							<span className="text-muted-foreground">{readString(level, 'type') ?? 'String'}</span>
							<span className="text-muted-foreground">
								{levelTypeLabel(props.i18n, readString(level, 'levelType'))}
							</span>
						</button>
					))}
					{!props.levels.length ? (
						<div className="grid min-h-44 place-items-center text-xs text-muted-foreground">
							{props.i18n.t('emptyLevels')}
						</div>
					) : null}
				</div>
			</ScrollArea>
			<div className="shrink-0 border-t bg-card/35 px-3 py-2.5">
				<div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{props.i18n.t('structurePreview')}
				</div>
				<div className="mt-2 flex min-h-8 items-center gap-1 overflow-x-auto pb-1">
					{props.levels.map((level, index) => (
						<React.Fragment key={`${index}:${readString(level, 'name') ?? ''}`}>
							{index ? (
								<ChevronDown className="size-3 -rotate-90 text-muted-foreground" aria-hidden="true" />
							) : null}
							<button
								type="button"
								className={cn(
									'shrink-0 rounded-md border px-2 py-1 text-[11px]',
									index === props.selectedLevelIndex
										? 'border-primary/30 bg-primary/8 text-primary'
										: 'bg-background'
								)}
								onClick={() => props.onSelectLevel(index)}
							>
								{readString(level, 'caption') ?? readString(level, 'name') ?? `Level ${index + 1}`}
							</button>
						</React.Fragment>
					))}
				</div>
			</div>
		</section>
	)
}

function LevelInspector(props: {
	i18n: DimensionStudioI18n
	level: JsonObject
	onChange(level: JsonObject): void
	onDelete(): void
}) {
	const setValue = (key: string, value: JsonValue) => props.onChange(setObjectValue(props.level, key, value))
	return (
		<div className="space-y-4 p-3">
			<InspectorTextField
				label={props.i18n.t('levelName')}
				value={readString(props.level, 'name') ?? ''}
				onChange={(value) => setValue('name', value)}
			/>
			<InspectorTextField
				label={props.i18n.t('businessTitle')}
				value={readString(props.level, 'caption') ?? ''}
				onChange={(value) => setValue('caption', value)}
			/>
			<InspectorTextField
				label={props.i18n.t('keyColumn')}
				value={readString(props.level, 'column') ?? ''}
				onChange={(value) => setValue('column', value)}
			/>
			<InspectorTextField
				label={props.i18n.t('captionColumn')}
				value={readString(props.level, 'captionColumn') ?? ''}
				onChange={(value) => setValue('captionColumn', value)}
			/>
			<div className="grid grid-cols-2 gap-2">
				<div className="grid gap-1.5">
					<Label className="text-xs">{props.i18n.t('dataType')}</Label>
					<Select
						value={readString(props.level, 'type') ?? 'String'}
						onValueChange={(value) => setValue('type', value)}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{['String', 'Integer', 'Numeric', 'Boolean', 'Date', 'Time', 'Timestamp'].map((value) => (
								<SelectItem key={value} value={value}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-1.5">
					<Label className="text-xs">{props.i18n.t('levelType')}</Label>
					<Select
						value={readString(props.level, 'levelType') ?? 'Regular'}
						onValueChange={(value) => setValue('levelType', value)}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{levelTypeOptions(props.i18n).map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<InspectorTextField
				label={props.i18n.t('ordinalColumn')}
				value={readString(props.level, 'ordinalColumn') ?? ''}
				onChange={(value) => setValue('ordinalColumn', value)}
			/>
			<InspectorTextField
				label={props.i18n.t('parentColumn')}
				value={readString(props.level, 'parentColumn') ?? ''}
				onChange={(value) => setValue('parentColumn', value)}
			/>
			<div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
				<Label className="text-xs">{props.i18n.t('uniqueMembers')}</Label>
				<Switch
					checked={props.level['uniqueMembers'] === true}
					onCheckedChange={(checked) => setValue('uniqueMembers', checked)}
				/>
			</div>
			<Separator />
			<ConfirmDelete
				i18n={props.i18n}
				name={readString(props.level, 'name') ?? 'Level'}
				title={props.i18n.t('deleteLevelTitle')}
				description={props.i18n.t('deleteLevelDescription', {
					name: readString(props.level, 'name') ?? 'Level'
				})}
				onDelete={props.onDelete}
			/>
		</div>
	)
}

function CompactTextField(props: { label: string; value: string; onChange(value: string): void }) {
	const id = React.useId()
	return (
		<div className="grid min-w-0 gap-1">
			<Label htmlFor={id} className="text-[10px] font-medium text-muted-foreground">
				{props.label}
			</Label>
			<Input
				id={id}
				className="h-7 min-w-0 bg-background px-2 text-xs"
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

function InspectorTextField(props: { label: string; value: string; onChange(value: string): void }) {
	const id = React.useId()
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id} className="text-xs">
				{props.label}
			</Label>
			<Input
				id={id}
				className="h-8 text-xs"
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

function DimensionReadiness(props: { dimension: JsonObject; i18n: DimensionStudioI18n; readiness: number }) {
	const hierarchies = objectCollection(props.dimension, 'hierarchies')
	const checks = [
		{
			passed: Boolean(readString(props.dimension, 'name') && readString(props.dimension, 'caption')),
			label: props.i18n.t('basicInfo')
		},
		{ passed: hierarchies.length > 0, label: props.i18n.t('hierarchies') },
		{ passed: hierarchies.every((item) => Boolean(readFirstTableName(item))), label: props.i18n.t('sourceTables') },
		{
			passed: hierarchies.every((item) => Boolean(readString(item, 'primaryKey'))),
			label: props.i18n.t('primaryKey')
		},
		{
			passed: hierarchies.every((item) => objectCollection(item, 'levels').length > 0),
			label: props.i18n.t('levels')
		}
	]
	const ready = props.readiness === 100
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="group flex min-w-[112px] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`${props.i18n.t('dimensionReadiness')}: ${props.readiness}/100`}
				>
					<div className="min-w-0 flex-1">
						<div className="text-[10px] text-muted-foreground">{props.i18n.t('readiness')}</div>
						<div className="mt-1 flex items-center gap-2">
							<Progress className="h-1.5 w-12" value={props.readiness} />
							<span className={cn('text-xs font-medium', ready ? 'text-success' : 'text-warning')}>
								{props.readiness}
							</span>
						</div>
					</div>
					<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[300px] p-0">
				<div className="bg-muted/25 p-4">
					<div className="flex items-end justify-between">
						<div>
							<div className="text-xs text-muted-foreground">{props.i18n.t('dimensionReadiness')}</div>
							<div className="mt-1 text-sm font-semibold">
								{ready ? props.i18n.t('ready') : props.i18n.t('needsAttention')}
							</div>
						</div>
						<div>
							<span className="text-2xl font-semibold">{props.readiness}</span>
							<span className="text-xs text-muted-foreground"> / 100</span>
						</div>
					</div>
					<Progress className="mt-3 h-1.5" value={props.readiness} />
				</div>
				<Separator />
				<div className="space-y-2 p-4">
					{checks.map((check) => (
						<div key={check.label} className="flex gap-2 text-xs">
							{check.passed ? (
								<CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
							) : (
								<TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
							)}
							<span className={check.passed ? 'text-muted-foreground' : undefined}>{check.label}</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

function ConfirmDelete(props: {
	i18n: DimensionStudioI18n
	name: string
	title: string
	description: string
	iconOnly?: boolean
	onDelete(): void
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size={props.iconOnly ? 'icon-sm' : 'sm'}
					className="text-destructive hover:text-destructive"
					aria-label={`${props.i18n.t('delete')} ${props.name}`}
				>
					<Trash2 aria-hidden="true" />
					{props.iconOnly ? null : props.i18n.t('delete')}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.title}</AlertDialogTitle>
					<AlertDialogDescription>{props.description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{props.i18n.t('cancel')}</AlertDialogCancel>
					<AlertDialogAction onClick={props.onDelete}>{props.i18n.t('delete')}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function newHierarchy(index: number): JsonObject {
	return { name: `Hierarchy ${index}`, caption: `Hierarchy ${index}`, hasAll: true, tables: [], levels: [] }
}

function duplicateHierarchy(hierarchy: JsonObject): JsonObject {
	const name = readString(hierarchy, 'name') ?? 'Hierarchy'
	const caption = readString(hierarchy, 'caption') ?? name
	return {
		...hierarchy,
		name: `${name}_copy`,
		caption: `${caption} Copy`,
		tables: objectCollection(hierarchy, 'tables').map((item) => ({ ...item })),
		levels: objectCollection(hierarchy, 'levels').map((item) => ({ ...item }))
	}
}

function dimensionReadiness(dimension: JsonObject) {
	const hierarchies = objectCollection(dimension, 'hierarchies')
	let score = readString(dimension, 'name') && readString(dimension, 'caption') ? 20 : 0
	if (hierarchies.length) score += 20
	if (hierarchies.length && hierarchies.every((item) => Boolean(readFirstTableName(item)))) score += 20
	if (hierarchies.length && hierarchies.every((item) => Boolean(readString(item, 'primaryKey')))) score += 20
	if (hierarchies.length && hierarchies.every((item) => objectCollection(item, 'levels').length > 0)) score += 20
	return score
}

function levelTypeOptions(i18n: DimensionStudioI18n) {
	return [
		{ value: 'Regular', label: i18n.t('regular') },
		{ value: 'TimeYears', label: i18n.t('year') },
		{ value: 'TimeQuarters', label: i18n.t('quarter') },
		{ value: 'TimeMonths', label: i18n.t('month') },
		{ value: 'TimeWeeks', label: i18n.t('week') },
		{ value: 'TimeDays', label: i18n.t('day') }
	]
}

function levelTypeLabel(i18n: DimensionStudioI18n, value?: string) {
	return levelTypeOptions(i18n).find((option) => option.value === value)?.label ?? i18n.t('regular')
}
