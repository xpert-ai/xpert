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
	Switch,
	Textarea
} from '@xpert-ai/shadcn-ui'
import {
	Boxes,
	Calculator,
	Check,
	CheckCircle2,
	ChevronDown,
	Database,
	Plus,
	Search,
	Sigma,
	Trash2,
	TriangleAlert
} from 'lucide-react'
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import {
	appendItem,
	objectCollection,
	readFactTableName,
	removeAt,
	replaceAt,
	replaceCollection,
	setObjectValue
} from './schema-utils'
import { createVirtualCubeI18n, VirtualCubeI18n } from './virtual-cube-i18n'

type StudioTab = 'sources' | 'dimensions' | 'measures' | 'members'
type CollectionTab = Exclude<StudioTab, 'sources'>
type CollectionKey = 'virtualCubeDimensions' | 'virtualCubeMeasures' | 'calculatedMembers'

const COLLECTION_BY_TAB: Record<CollectionTab, CollectionKey> = {
	dimensions: 'virtualCubeDimensions',
	measures: 'virtualCubeMeasures',
	members: 'calculatedMembers'
}

export function VirtualCubeEditor(props: { schema: JsonObject; locale?: string; onChange(schema: JsonObject): void }) {
	const i18n = React.useMemo(() => createVirtualCubeI18n(props.locale), [props.locale])
	const virtualCubes = objectCollection(props.schema, 'virtualCubes')
	const sourceCubes = objectCollection(props.schema, 'cubes')
	const [selectedCubeIndex, setSelectedCubeIndex] = React.useState(0)
	const [activeTab, setActiveTab] = React.useState<StudioTab>('sources')
	const [selectedRowIndex, setSelectedRowIndex] = React.useState(0)
	const [search, setSearch] = React.useState('')

	React.useEffect(() => {
		setSelectedCubeIndex((index) => Math.max(0, Math.min(index, Math.max(0, virtualCubes.length - 1))))
	}, [virtualCubes.length])

	React.useEffect(() => {
		setSelectedRowIndex(0)
		setSearch('')
	}, [activeTab, selectedCubeIndex])

	const virtualCube = virtualCubes[selectedCubeIndex]
	const updateVirtualCubes = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.schema, 'virtualCubes', items))
	const updateVirtualCube = (next: JsonObject) => updateVirtualCubes(replaceAt(virtualCubes, selectedCubeIndex, next))
	const addVirtualCube = () => {
		const nextIndex = virtualCubes.length
		updateVirtualCubes(
			appendItem(virtualCubes, {
				name: `Virtual Cube ${nextIndex + 1}`,
				caption: `Virtual Cube ${nextIndex + 1}`,
				description: '',
				cubeUsages: [],
				virtualCubeDimensions: [],
				virtualCubeMeasures: [],
				calculatedMembers: []
			})
		)
		setSelectedCubeIndex(nextIndex)
		setActiveTab('sources')
	}

	if (!virtualCube) {
		return (
			<div className="grid h-full min-h-[420px] place-items-center bg-background p-8">
				<div className="max-w-sm text-center">
					<div className="mx-auto grid size-10 place-items-center rounded-lg border bg-card">
						<Boxes className="size-5 text-muted-foreground" aria-hidden="true" />
					</div>
					<h1 className="mt-4 text-base font-semibold">{i18n.t('virtualCube')}</h1>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">{i18n.t('emptyDescription')}</p>
					<Button className="mt-4" size="sm" onClick={addVirtualCube}>
						<Plus aria-hidden="true" />
						{i18n.t('addVirtualCube')}
					</Button>
				</div>
			</div>
		)
	}

	const usages = objectCollection(virtualCube, 'cubeUsages')
	const dimensions = objectCollection(virtualCube, 'virtualCubeDimensions')
	const measures = objectCollection(virtualCube, 'virtualCubeMeasures')
	const members = objectCollection(virtualCube, 'calculatedMembers')
	const readiness = virtualCubeReadiness(virtualCube)
	const displayName =
		readString(virtualCube, 'caption') ??
		readString(virtualCube, 'name') ??
		`${i18n.t('virtualCube')} ${selectedCubeIndex + 1}`
	const tabs: Array<{ key: StudioTab; label: string; count: number }> = [
		{ key: 'sources', label: i18n.t('composition'), count: usages.length },
		{ key: 'dimensions', label: i18n.t('dimensions'), count: dimensions.length },
		{ key: 'measures', label: i18n.t('measures'), count: measures.length },
		{ key: 'members', label: i18n.t('calculatedMembers'), count: members.length }
	]
	const selectedCollection =
		activeTab === 'sources' ? sourceCubes : objectCollection(virtualCube, COLLECTION_BY_TAB[activeTab])
	const selectedItem = selectedCollection[selectedRowIndex]

	const addCollectionItem = () => {
		if (activeTab === 'sources') {
			return
		}
		const collection = COLLECTION_BY_TAB[activeTab]
		const values = objectCollection(virtualCube, collection)
		const defaultSource = readString(sourceCubes[0] ?? {}, 'name') ?? ''
		const nextItem: JsonObject =
			activeTab === 'dimensions'
				? { cubeName: defaultSource, name: '', caption: '', __shared__: false }
				: activeTab === 'measures'
					? { cubeName: defaultSource, name: '', caption: '', visible: true }
					: { name: '', caption: '', dimension: 'Measures', formula: '', visible: true }
		updateVirtualCube(replaceCollection(virtualCube, collection, appendItem(values, nextItem)))
		setSelectedRowIndex(values.length)
	}

	return (
		<div
			className="grid h-full min-h-0 min-w-0 grid-cols-[172px_minmax(0,1fr)] overflow-hidden bg-background max-[900px]:grid-cols-1"
			data-testid="virtual-cube-studio"
		>
			<aside className="min-h-0 border-r bg-card/45 max-[900px]:hidden">
				<div className="flex h-11 items-center justify-between border-b px-3">
					<div className="flex items-center gap-2 text-xs font-semibold">
						<Boxes className="size-4 text-primary" aria-hidden="true" />
						{i18n.t('virtualCube')}
					</div>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={i18n.t('addVirtualCube')}
						onClick={addVirtualCube}
					>
						<Plus aria-hidden="true" />
					</Button>
				</div>
				<ScrollArea className="h-[calc(100%-44px)]">
					<div className="space-y-1 p-2">
						{virtualCubes.map((item, index) => {
							const selected = index === selectedCubeIndex
							const itemName =
								readString(item, 'caption') ??
								readString(item, 'name') ??
								`${i18n.t('virtualCube')} ${index + 1}`
							return (
								<button
									key={`${index}:${readString(item, 'name') ?? ''}`}
									type="button"
									className={cn(
										'w-full rounded-md px-2.5 py-2 text-left transition-colors',
										selected
											? 'bg-primary/8 text-primary ring-1 ring-inset ring-primary/10'
											: 'hover:bg-muted/60'
									)}
									onClick={() => setSelectedCubeIndex(index)}
								>
									<div className="truncate text-sm font-medium">{itemName}</div>
									<div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
										<span>{objectCollection(item, 'cubeUsages').length} Cube</span>
										<span>·</span>
										<span>{objectCollection(item, 'virtualCubeMeasures').length} M</span>
									</div>
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
								{i18n.t('virtualCube')} / {displayName}
							</h1>
							<Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
								{i18n.t('selectedSources', {
									selected: usages.length,
									total: sourceCubes.length
								})}
							</Badge>
						</div>
						<p className="mt-1 truncate text-[11px] text-muted-foreground">{i18n.t('studioSubtitle')}</p>
					</div>
					<VirtualCubeReadiness i18n={i18n} virtualCube={virtualCube} readiness={readiness} />
					<DeleteVirtualCube
						i18n={i18n}
						name={displayName}
						onDelete={() => {
							updateVirtualCubes(removeAt(virtualCubes, selectedCubeIndex))
							setSelectedCubeIndex(Math.max(0, selectedCubeIndex - 1))
						}}
					/>
				</header>

				<div className="grid shrink-0 grid-cols-3 gap-2 border-b bg-muted/10 px-3 py-2 max-[760px]:grid-cols-2">
					<CompactTextField
						label={i18n.t('technicalName')}
						value={readString(virtualCube, 'name') ?? ''}
						onChange={(value) => updateVirtualCube(setObjectValue(virtualCube, 'name', value))}
					/>
					<CompactTextField
						label={i18n.t('businessTitle')}
						value={readString(virtualCube, 'caption') ?? ''}
						onChange={(value) => updateVirtualCube(setObjectValue(virtualCube, 'caption', value))}
					/>
					<CompactTextField
						label={i18n.t('description')}
						value={readString(virtualCube, 'description') ?? ''}
						onChange={(value) => updateVirtualCube(setObjectValue(virtualCube, 'description', value))}
					/>
				</div>

				<nav className="flex h-10 shrink-0 items-center gap-1 border-b px-3" aria-label={i18n.t('virtualCube')}>
					{tabs.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
								activeTab === tab.key
									? 'bg-muted text-foreground shadow-sm'
									: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
							<span className="text-[10px] tabular-nums text-muted-foreground">{tab.count}</span>
						</button>
					))}
				</nav>

				<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_292px] overflow-hidden max-[1080px]:grid-cols-1">
					<section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
						<div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
							<div className="relative max-w-[280px] flex-1">
								<Search
									className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
									aria-hidden="true"
								/>
								<Input
									className="h-7 pl-8 text-xs"
									value={search}
									placeholder={i18n.t('search')}
									onChange={(event) => setSearch(event.currentTarget.value)}
								/>
							</div>
							<div className="ml-auto text-[11px] text-muted-foreground">
								{activeTab === 'sources'
									? i18n.t('selectedSources', {
											selected: usages.length,
											total: sourceCubes.length
										})
									: `${selectedCollection.length}`}
							</div>
							{activeTab !== 'sources' ? (
								<Button size="sm" className="h-7 text-xs" onClick={addCollectionItem}>
									<Plus aria-hidden="true" />
									{activeTab === 'dimensions'
										? i18n.t('addDimension')
										: activeTab === 'measures'
											? i18n.t('addMeasure')
											: i18n.t('addCalculatedMember')}
								</Button>
							) : null}
						</div>

						<ScrollArea className="min-h-0 flex-1">
							{activeTab === 'sources' ? (
								<SourceCubeList
									i18n={i18n}
									search={search}
									sourceCubes={sourceCubes}
									virtualCube={virtualCube}
									selectedIndex={selectedRowIndex}
									onSelect={setSelectedRowIndex}
									onChange={updateVirtualCube}
								/>
							) : (
								<VirtualItemList
									i18n={i18n}
									tab={activeTab}
									items={selectedCollection}
									search={search}
									selectedIndex={selectedRowIndex}
									onSelect={setSelectedRowIndex}
								/>
							)}
						</ScrollArea>
					</section>

					<aside className="min-h-0 overflow-hidden border-l bg-card/35 max-[1080px]:hidden">
						<div className="flex h-11 items-center border-b px-3 text-xs font-semibold">
							{i18n.t('inspector')}
						</div>
						<ScrollArea className="h-[calc(100%-44px)]">
							{selectedItem ? (
								activeTab === 'sources' ? (
									<SourceCubeInspector
										i18n={i18n}
										sourceCube={selectedItem}
										virtualCube={virtualCube}
										onChange={updateVirtualCube}
									/>
								) : (
									<VirtualItemInspector
										i18n={i18n}
										tab={activeTab}
										item={selectedItem}
										sourceCubes={sourceCubes}
										onChange={(next) => {
											const collection = COLLECTION_BY_TAB[activeTab]
											const items = objectCollection(virtualCube, collection)
											updateVirtualCube(
												replaceCollection(
													virtualCube,
													collection,
													replaceAt(items, selectedRowIndex, next)
												)
											)
										}}
										onDelete={() => {
											const collection = COLLECTION_BY_TAB[activeTab]
											const items = objectCollection(virtualCube, collection)
											updateVirtualCube(
												replaceCollection(
													virtualCube,
													collection,
													removeAt(items, selectedRowIndex)
												)
											)
											setSelectedRowIndex(Math.max(0, selectedRowIndex - 1))
										}}
									/>
								)
							) : (
								<div className="p-6 text-center text-xs leading-5 text-muted-foreground">
									{i18n.t('noSelection')}
								</div>
							)}
						</ScrollArea>
					</aside>
				</div>
			</main>
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

function SourceCubeList(props: {
	i18n: VirtualCubeI18n
	search: string
	sourceCubes: JsonObject[]
	virtualCube: JsonObject
	selectedIndex: number
	onSelect(index: number): void
	onChange(virtualCube: JsonObject): void
}) {
	const normalizedSearch = props.search.trim().toLowerCase()
	const usages = objectCollection(props.virtualCube, 'cubeUsages')
	const filtered = props.sourceCubes
		.map((cube, index) => ({ cube, index }))
		.filter(({ cube }) => {
			const name = readString(cube, 'caption') ?? readString(cube, 'name') ?? ''
			return !normalizedSearch || `${name} ${readFactTableName(cube)}`.toLowerCase().includes(normalizedSearch)
		})

	return (
		<div className="min-w-[620px]">
			<div className="grid h-8 grid-cols-[minmax(180px,1fr)_minmax(120px,0.8fr)_96px_96px_92px] items-center border-b bg-muted/20 px-3 text-[10px] font-medium text-muted-foreground">
				<span>{props.i18n.t('sourceCube')}</span>
				<span>{props.i18n.t('factTable')}</span>
				<span>{props.i18n.t('dimensions')}</span>
				<span>{props.i18n.t('measures')}</span>
				<span />
			</div>
			{filtered.map(({ cube, index }) => {
				const name = readString(cube, 'name') ?? ''
				const displayName = readString(cube, 'caption') ?? (name || `${props.i18n.t('cube')} ${index + 1}`)
				const usageIndex = usages.findIndex((usage) => readString(usage, 'cubeName') === name)
				const included = usageIndex >= 0
				return (
					<div
						key={`${index}:${name}`}
						className={cn(
							'grid h-12 grid-cols-[minmax(180px,1fr)_minmax(120px,0.8fr)_96px_96px_92px] items-center border-b px-3 text-xs',
							index === props.selectedIndex ? 'bg-primary/5' : 'hover:bg-muted/25'
						)}
					>
						<button
							type="button"
							className="flex min-w-0 items-center gap-2 text-left"
							onClick={() => props.onSelect(index)}
						>
							<span
								className={cn(
									'grid size-7 shrink-0 place-items-center rounded-md border',
									included ? 'border-primary/20 bg-primary/8 text-primary' : 'bg-background'
								)}
							>
								<Database className="size-3.5" aria-hidden="true" />
							</span>
							<span className="min-w-0">
								<span className="block truncate font-medium">{displayName}</span>
								<span className="block truncate text-[10px] text-muted-foreground">{name}</span>
							</span>
						</button>
						<span className="truncate text-muted-foreground">
							{readFactTableName(cube) || props.i18n.t('noFactTable')}
						</span>
						<span className="tabular-nums text-muted-foreground">
							{objectCollection(cube, 'dimensionUsages').length +
								objectCollection(cube, 'dimensions').length}
						</span>
						<span className="tabular-nums text-muted-foreground">
							{objectCollection(cube, 'measures').length +
								objectCollection(cube, 'calculatedMembers').length}
						</span>
						<Button
							variant={included ? 'secondary' : 'outline'}
							size="sm"
							className="h-7 justify-center px-2 text-[11px]"
							onClick={() => {
								if (included) {
									props.onChange(
										replaceCollection(props.virtualCube, 'cubeUsages', removeAt(usages, usageIndex))
									)
								} else {
									props.onChange(
										replaceCollection(
											props.virtualCube,
											'cubeUsages',
											appendItem(usages, {
												cubeName: name,
												ignoreUnrelatedDimensions: false
											})
										)
									)
								}
							}}
						>
							{included ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
							{included ? props.i18n.t('included') : props.i18n.t('includeCube')}
						</Button>
					</div>
				)
			})}
		</div>
	)
}

function VirtualItemList(props: {
	i18n: VirtualCubeI18n
	tab: CollectionTab
	items: JsonObject[]
	search: string
	selectedIndex: number
	onSelect(index: number): void
}) {
	const normalizedSearch = props.search.trim().toLowerCase()
	const filtered = props.items
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => {
			const text = `${readString(item, 'name') ?? ''} ${readString(item, 'caption') ?? ''} ${
				readString(item, 'cubeName') ?? ''
			}`.toLowerCase()
			return !normalizedSearch || text.includes(normalizedSearch)
		})
	const emptyKey =
		props.tab === 'dimensions'
			? 'emptyDimensions'
			: props.tab === 'measures'
				? 'emptyMeasures'
				: 'emptyCalculatedMembers'
	const Icon = props.tab === 'dimensions' ? Database : props.tab === 'measures' ? Sigma : Calculator

	if (!filtered.length) {
		return (
			<div className="grid min-h-52 place-items-center p-8 text-center">
				<div>
					<Icon className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
					<p className="mt-2 text-xs text-muted-foreground">{props.i18n.t(emptyKey)}</p>
				</div>
			</div>
		)
	}

	return (
		<div className="min-w-[560px]">
			<div className="grid h-8 grid-cols-[minmax(180px,1fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)_96px] items-center border-b bg-muted/20 px-3 text-[10px] font-medium text-muted-foreground">
				<span>{props.i18n.t('technicalName')}</span>
				<span>{props.i18n.t('caption')}</span>
				<span>{props.tab === 'members' ? props.i18n.t('formula') : props.i18n.t('source')}</span>
				<span>{props.i18n.t('visible')}</span>
			</div>
			{filtered.map(({ item, index }) => (
				<button
					key={`${index}:${readString(item, 'name') ?? ''}`}
					type="button"
					className={cn(
						'grid h-11 w-full grid-cols-[minmax(180px,1fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)_96px] items-center border-b px-3 text-left text-xs transition-colors',
						index === props.selectedIndex ? 'bg-primary/5' : 'hover:bg-muted/25'
					)}
					onClick={() => props.onSelect(index)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span className="truncate font-medium">{readString(item, 'name') || '—'}</span>
					</span>
					<span className="truncate text-muted-foreground">{readString(item, 'caption') || '—'}</span>
					<span className="truncate font-mono text-[10px] text-muted-foreground">
						{props.tab === 'members'
							? readString(item, 'formula') || '—'
							: readString(item, 'cubeName') || '—'}
					</span>
					<span>
						<Badge variant="outline" className="h-5 text-[10px] font-normal">
							{item['visible'] === false ? '—' : props.i18n.t('visible')}
						</Badge>
					</span>
				</button>
			))}
		</div>
	)
}

function SourceCubeInspector(props: {
	i18n: VirtualCubeI18n
	sourceCube: JsonObject
	virtualCube: JsonObject
	onChange(virtualCube: JsonObject): void
}) {
	const sourceName = readString(props.sourceCube, 'name') ?? ''
	const usages = objectCollection(props.virtualCube, 'cubeUsages')
	const usageIndex = usages.findIndex((usage) => readString(usage, 'cubeName') === sourceName)
	const usage = usages[usageIndex]
	const included = Boolean(usage)
	const updateUsage = (key: string, value: JsonValue) => {
		if (!usage) {
			return
		}
		props.onChange(
			replaceCollection(
				props.virtualCube,
				'cubeUsages',
				replaceAt(usages, usageIndex, setObjectValue(usage, key, value))
			)
		)
	}

	return (
		<div className="space-y-4 p-3">
			<div>
				<div className="text-sm font-semibold">{readString(props.sourceCube, 'caption') ?? sourceName}</div>
				<div className="mt-1 font-mono text-[10px] text-muted-foreground">{sourceName}</div>
			</div>
			<Separator />
			<InspectorRow label={props.i18n.t('factTable')}>
				<span className="truncate text-xs font-medium">
					{readFactTableName(props.sourceCube) || props.i18n.t('noFactTable')}
				</span>
			</InspectorRow>
			<InspectorRow label={props.i18n.t('dimensions')}>
				<span className="text-xs font-medium">
					{objectCollection(props.sourceCube, 'dimensionUsages').length +
						objectCollection(props.sourceCube, 'dimensions').length}
				</span>
			</InspectorRow>
			<InspectorRow label={props.i18n.t('measures')}>
				<span className="text-xs font-medium">
					{objectCollection(props.sourceCube, 'measures').length +
						objectCollection(props.sourceCube, 'calculatedMembers').length}
				</span>
			</InspectorRow>
			<Separator />
			<div className="flex items-center justify-between gap-3">
				<Label className="text-xs">{included ? props.i18n.t('included') : props.i18n.t('notIncluded')}</Label>
				<Switch
					checked={included}
					onCheckedChange={(checked) => {
						props.onChange(
							replaceCollection(
								props.virtualCube,
								'cubeUsages',
								checked
									? appendItem(usages, {
											cubeName: sourceName,
											ignoreUnrelatedDimensions: false
										})
									: removeAt(usages, usageIndex)
							)
						)
					}}
				/>
			</div>
			<div className="flex items-center justify-between gap-3">
				<Label className="text-xs leading-5">{props.i18n.t('ignoreUnrelatedDimensions')}</Label>
				<Switch
					disabled={!included}
					checked={usage?.['ignoreUnrelatedDimensions'] === true}
					onCheckedChange={(checked) => updateUsage('ignoreUnrelatedDimensions', checked)}
				/>
			</div>
		</div>
	)
}

function VirtualItemInspector(props: {
	i18n: VirtualCubeI18n
	tab: CollectionTab
	item: JsonObject
	sourceCubes: JsonObject[]
	onChange(item: JsonObject): void
	onDelete(): void
}) {
	const sourceOptions = props.sourceCubes
		.map((cube) => readString(cube, 'name'))
		.filter((name): name is string => Boolean(name))
	const setValue = (key: string, value: JsonValue) => props.onChange(setObjectValue(props.item, key, value))

	return (
		<div className="space-y-4 p-3">
			<InspectorTextField
				label={props.i18n.t('technicalName')}
				value={readString(props.item, 'name') ?? ''}
				onChange={(value) => setValue('name', value)}
			/>
			<InspectorTextField
				label={props.i18n.t('caption')}
				value={readString(props.item, 'caption') ?? ''}
				onChange={(value) => setValue('caption', value)}
			/>
			{props.tab !== 'members' ? (
				<div className="grid gap-1.5">
					<Label className="text-xs">{props.i18n.t('sourceCube')}</Label>
					<Select
						value={readString(props.item, 'cubeName') ?? ''}
						onValueChange={(value) => setValue('cubeName', value)}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{sourceOptions.map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : (
				<>
					<InspectorTextField
						label={props.i18n.t('dimensions')}
						value={readString(props.item, 'dimension') ?? ''}
						onChange={(value) => setValue('dimension', value)}
					/>
					<div className="grid gap-1.5">
						<Label className="text-xs">{props.i18n.t('formula')}</Label>
						<Textarea
							className="min-h-28 resize-y font-mono text-xs"
							value={readString(props.item, 'formula') ?? ''}
							onChange={(event) => setValue('formula', event.currentTarget.value)}
						/>
					</div>
				</>
			)}
			<div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
				<Label className="text-xs">
					{props.tab === 'dimensions' ? props.i18n.t('shared') : props.i18n.t('visible')}
				</Label>
				<Switch
					checked={
						props.tab === 'dimensions' ? props.item['__shared__'] === true : props.item['visible'] !== false
					}
					onCheckedChange={(checked) =>
						setValue(props.tab === 'dimensions' ? '__shared__' : 'visible', checked)
					}
				/>
			</div>
			<Separator />
			<DeleteVirtualItem
				i18n={props.i18n}
				name={readString(props.item, 'caption') ?? readString(props.item, 'name') ?? props.i18n.t('source')}
				onDelete={props.onDelete}
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

function InspectorRow(props: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs text-muted-foreground">{props.label}</span>
			{props.children}
		</div>
	)
}

function VirtualCubeReadiness(props: { i18n: VirtualCubeI18n; virtualCube: JsonObject; readiness: number }) {
	const hasName = Boolean(readString(props.virtualCube, 'name') && readString(props.virtualCube, 'caption'))
	const hasSources = objectCollection(props.virtualCube, 'cubeUsages').length > 0
	const hasDimensions = objectCollection(props.virtualCube, 'virtualCubeDimensions').length > 0
	const hasMeasures = objectCollection(props.virtualCube, 'virtualCubeMeasures').length > 0
	const ready = props.readiness === 100
	const checks = [
		{ passed: hasName, label: props.i18n.t('nameRequired') },
		{ passed: hasSources, label: props.i18n.t('sourceRequired') },
		{ passed: hasDimensions, label: props.i18n.t('emptyDimensions') },
		{ passed: hasMeasures, label: props.i18n.t('emptyMeasures') }
	]

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="group flex min-w-[112px] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`${props.i18n.t('readinessDetails')}: ${props.readiness}/100`}
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
							<div className="text-xs text-muted-foreground">{props.i18n.t('readinessDetails')}</div>
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
							<span className={check.passed ? 'text-muted-foreground line-through' : undefined}>
								{check.label}
							</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

function DeleteVirtualCube(props: { i18n: VirtualCubeI18n; name: string; onDelete(): void }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground"
					aria-label={props.i18n.t('delete')}
				>
					<Trash2 aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.i18n.t('deleteTitle')}</AlertDialogTitle>
					<AlertDialogDescription>
						{props.i18n.t('deleteDescription', { name: props.name })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{props.i18n.t('cancel')}</AlertDialogCancel>
					<AlertDialogAction onClick={props.onDelete}>{props.i18n.t('delete')}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function DeleteVirtualItem(props: { i18n: VirtualCubeI18n; name: string; onDelete(): void }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="w-full justify-start text-destructive hover:text-destructive"
				>
					<Trash2 aria-hidden="true" />
					{props.i18n.t('delete')}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.i18n.t('deleteItemTitle')}</AlertDialogTitle>
					<AlertDialogDescription>
						{props.i18n.t('deleteItemDescription', { name: props.name })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{props.i18n.t('cancel')}</AlertDialogCancel>
					<AlertDialogAction onClick={props.onDelete}>{props.i18n.t('delete')}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function virtualCubeReadiness(virtualCube: JsonObject) {
	let score = 0
	if (readString(virtualCube, 'name') && readString(virtualCube, 'caption')) {
		score += 20
	}
	if (objectCollection(virtualCube, 'cubeUsages').length) {
		score += 30
	}
	if (objectCollection(virtualCube, 'virtualCubeDimensions').length) {
		score += 25
	}
	if (objectCollection(virtualCube, 'virtualCubeMeasures').length) {
		score += 25
	}
	return score
}
