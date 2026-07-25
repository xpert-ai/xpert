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
import { Box, Braces, Plus, Search, Sigma, SlidersHorizontal } from 'lucide-react'
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { createCalculationStudioI18n } from './calculation-studio-i18n'
import {
	appendDerivedItem,
	derivedItemExpression,
	DerivedItemEntry,
	DerivedItemKind,
	DerivedItemSelection,
	findDerivedItem,
	listDerivedItems,
	moveDerivedItem,
	updateDerivedItem
} from './calculation-studio-model'
import { objectCollection } from './schema-utils'

export function CalculationStudio(props: {
	schema: JsonObject
	locale?: string
	onChange(schema: JsonObject): void
	onOpenCubes(): void
	onTestAll(): void
}) {
	const i18n = React.useMemo(() => createCalculationStudioI18n(props.locale), [props.locale])
	const cubes = objectCollection(props.schema, 'cubes')
	const entries = React.useMemo(() => listDerivedItems(props.schema), [props.schema])
	const [search, setSearch] = React.useState('')
	const [selection, setSelection] = React.useState<DerivedItemSelection | null>(() => entries[0] ?? null)
	const selected = findDerivedItem(props.schema, selection)
	const normalizedSearch = search.trim().toLowerCase()
	const filteredEntries = entries.filter((entry) => {
		const type = itemTypeLabel(entry.kind, i18n.t)
		return (
			!normalizedSearch ||
			`${entry.name} ${entry.scope} ${type} ${derivedItemExpression(entry)}`
				.toLowerCase()
				.includes(normalizedSearch)
		)
	})

	React.useEffect(() => {
		if (selection && selected) {
			return
		}
		setSelection(entries[0] ?? null)
	}, [entries, selected, selection])

	function createItem(kind: 'calculation' | 'parameter') {
		const targetCubeIndex = selection?.cubeIndex ?? 0
		const result = appendDerivedItem(props.schema, kind, targetCubeIndex)
		if (!result) {
			return
		}
		props.onChange(result.schema)
		setSelection(result.selection)
	}

	function updateItem(key: string, value: JsonValue | undefined) {
		if (!selection) {
			return
		}
		props.onChange(updateDerivedItem(props.schema, selection, key, value))
	}

	function moveItem(targetCubeIndex: number) {
		if (!selection) {
			return
		}
		const result = moveDerivedItem(props.schema, selection, targetCubeIndex)
		if (!result) {
			return
		}
		props.onChange(result.schema)
		setSelection(result.selection)
	}

	return (
		<div className="flex h-full min-h-0 flex-col bg-background" data-testid="calculation-studio">
			<header className="shrink-0 border-b bg-card/40 px-5 py-4">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
							{i18n.t('derivedSemantics')}
						</div>
						<h1 className="mt-1 text-xl font-semibold tracking-tight">{i18n.t('title')}</h1>
						<p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
							{i18n.t('scopeExplanation')}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button disabled={!cubes.length} size="sm" onClick={() => createItem('calculation')}>
							<Plus aria-hidden="true" />
							{i18n.t('addCalculation')}
						</Button>
						<Button
							disabled={!cubes.length}
							variant="outline"
							size="sm"
							onClick={() => createItem('parameter')}
						>
							<SlidersHorizontal aria-hidden="true" />
							{i18n.t('addParameter')}
						</Button>
						<Button variant="outline" size="sm" onClick={props.onTestAll}>
							{i18n.t('testAll')}
						</Button>
					</div>
				</div>
				{!cubes.length ? (
					<div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
						<span>{i18n.t('createCubeFirst')}</span>
						<Button variant="outline" size="xs" onClick={props.onOpenCubes}>
							<Box aria-hidden="true" />
							{i18n.t('selectCube')}
						</Button>
					</div>
				) : null}
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,1fr)_minmax(300px,420px)] max-[900px]:grid-cols-1">
				<section className="flex min-h-0 min-w-0 flex-col border-r max-[900px]:border-r-0">
					<div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
						<div className="relative min-w-0 flex-1">
							<Search
								aria-hidden="true"
								className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								className="h-8 pl-8 text-xs"
								value={search}
								aria-label={i18n.t('filterPlaceholder')}
								placeholder={i18n.t('filterPlaceholder')}
								onChange={(event) => setSearch(event.currentTarget.value)}
							/>
						</div>
						<span className="text-xs text-muted-foreground">
							{i18n.t('recordCount', { count: filteredEntries.length })}
						</span>
					</div>
					<div className="grid grid-cols-[minmax(120px,1.1fr)_100px_minmax(130px,1fr)_120px_90px] border-b bg-muted/25 px-4 py-2 text-[10px] font-medium text-muted-foreground max-[720px]:grid-cols-[minmax(120px,1fr)_90px_100px]">
						<span>{i18n.t('name')}</span>
						<span>{i18n.t('type')}</span>
						<span className="max-[720px]:hidden">{i18n.t('expression')}</span>
						<span>{i18n.t('cube')}</span>
						<span className="max-[720px]:hidden">{i18n.t('status')}</span>
					</div>
					<ScrollArea className="min-h-0 flex-1">
						<div>
							{filteredEntries.map((entry) => {
								const active = selected?.id === entry.id
								const expression = derivedItemExpression(entry)
								const ready = Boolean(
									readString(entry.value, 'name') && (entry.kind === 'parameter' || expression)
								)
								return (
									<button
										key={entry.id}
										type="button"
										data-testid={`derived-item-${entry.id}`}
										className={cn(
											'grid w-full grid-cols-[minmax(120px,1.1fr)_100px_minmax(130px,1fr)_120px_90px] items-center border-b px-4 py-3 text-left text-xs hover:bg-muted/35 max-[720px]:grid-cols-[minmax(120px,1fr)_90px_100px]',
											active && 'bg-primary/7 shadow-[inset_2px_0_0_var(--primary)]'
										)}
										onClick={() => setSelection(entry)}
									>
										<span className="truncate font-medium">{entry.name}</span>
										<span className="truncate text-muted-foreground">
											{itemTypeLabel(entry.kind, i18n.t)}
										</span>
										<span className="truncate font-mono text-[11px] text-muted-foreground max-[720px]:hidden">
											{expression || '—'}
										</span>
										<span className="truncate text-muted-foreground">{entry.scope}</span>
										<span className="max-[720px]:hidden">
											<Badge variant={ready ? 'secondary' : 'outline'} className="text-[10px]">
												{ready ? i18n.t('ready') : i18n.t('needsExpression')}
											</Badge>
										</span>
									</button>
								)
							})}
							{!filteredEntries.length ? (
								<div className="grid min-h-56 place-items-center px-6 text-center">
									<div>
										<Braces className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
										<div className="mt-3 text-sm font-medium">{i18n.t('empty')}</div>
										<p className="mt-1 text-xs text-muted-foreground">{i18n.t('noSelection')}</p>
									</div>
								</div>
							) : null}
						</div>
					</ScrollArea>
				</section>

				<DerivedItemInspector
					entry={selected}
					cubes={cubes}
					i18n={i18n}
					onMove={moveItem}
					onUpdate={updateItem}
				/>
			</div>
		</div>
	)
}

function DerivedItemInspector(props: {
	entry: DerivedItemEntry | null
	cubes: JsonObject[]
	i18n: ReturnType<typeof createCalculationStudioI18n>
	onMove(cubeIndex: number): void
	onUpdate(key: string, value: JsonValue | undefined): void
}) {
	if (!props.entry) {
		return (
			<aside className="grid min-h-0 place-items-center bg-card/30 p-6 text-center max-[900px]:hidden">
				<div>
					<Sigma className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
					<p className="mt-2 max-w-56 text-xs text-muted-foreground">{props.i18n.t('noSelection')}</p>
				</div>
			</aside>
		)
	}
	const expressionKey =
		props.entry.kind === 'calculation'
			? 'expression'
			: props.entry.kind === 'calculatedMember'
				? 'formula'
				: 'defaultValue'
	const expressionLabel =
		props.entry.kind === 'calculatedMember'
			? props.i18n.t('formula')
			: props.entry.kind === 'parameter'
				? props.i18n.t('defaultValue')
				: props.i18n.t('expression')
	return (
		<aside className="flex min-h-0 flex-col bg-card/35" data-testid="derived-item-properties">
			<div className="shrink-0 border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<Sigma className="size-4 text-primary" aria-hidden="true" />
					<span className="text-sm font-semibold">{itemTypeLabel(props.entry.kind, props.i18n.t)}</span>
				</div>
				<p className="mt-1 text-[11px] text-muted-foreground">{props.i18n.t('editorDescription')}</p>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 p-4">
					<EditorField label={props.i18n.t('cube')}>
						<Select
							value={String(props.entry.cubeIndex)}
							onValueChange={(value) => props.onMove(Number(value))}
						>
							<SelectTrigger aria-label={props.i18n.t('cube')}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{props.cubes.map((cube, index) => (
									<SelectItem
										key={`${index}:${readString(cube, 'name') ?? ''}`}
										value={String(index)}
									>
										{readString(cube, 'caption') ?? readString(cube, 'name') ?? `Cube ${index + 1}`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</EditorField>
					<Separator />
					<EditorField label={props.i18n.t('name')}>
						<Input
							value={readString(props.entry.value, 'name') ?? ''}
							aria-label={props.i18n.t('name')}
							onChange={(event) => props.onUpdate('name', event.currentTarget.value)}
						/>
					</EditorField>
					<EditorField label={props.i18n.t('caption')}>
						<Input
							value={readString(props.entry.value, 'caption') ?? ''}
							aria-label={props.i18n.t('caption')}
							onChange={(event) => props.onUpdate('caption', event.currentTarget.value)}
						/>
					</EditorField>
					{props.entry.kind === 'parameter' ? (
						<EditorField label={props.i18n.t('type')}>
							<Select
								value={readString(props.entry.value, 'type') ?? 'String'}
								onValueChange={(value) => props.onUpdate('type', value)}
							>
								<SelectTrigger aria-label={props.i18n.t('type')}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{['String', 'Numeric', 'Integer', 'Boolean', 'Date'].map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</EditorField>
					) : null}
					<EditorField label={expressionLabel}>
						<Textarea
							className="min-h-32 font-mono text-xs"
							value={readString(props.entry.value, expressionKey) ?? ''}
							aria-label={expressionLabel}
							onChange={(event) => props.onUpdate(expressionKey, event.currentTarget.value)}
						/>
					</EditorField>
					{props.entry.kind !== 'parameter' ? (
						<EditorField label={props.i18n.t('formatString')}>
							<Input
								value={readString(props.entry.value, 'formatString') ?? ''}
								placeholder="#,##0.00"
								onChange={(event) => props.onUpdate('formatString', event.currentTarget.value)}
							/>
						</EditorField>
					) : null}
					<EditorField label={props.i18n.t('description')}>
						<Textarea
							className="min-h-20 text-xs"
							value={readString(props.entry.value, 'description') ?? ''}
							onChange={(event) => props.onUpdate('description', event.currentTarget.value)}
						/>
					</EditorField>
					{props.entry.kind !== 'parameter' ? (
						<>
							<Separator />
							<div className="flex items-center justify-between gap-3">
								<Label>{props.i18n.t('visible')}</Label>
								<Switch
									checked={props.entry.value['visible'] !== false}
									onCheckedChange={(checked) => props.onUpdate('visible', checked)}
								/>
							</div>
						</>
					) : null}
				</div>
			</ScrollArea>
		</aside>
	)
}

function EditorField(props: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-1.5">
			<Label>{props.label}</Label>
			{props.children}
		</div>
	)
}

function itemTypeLabel(kind: DerivedItemKind, t: ReturnType<typeof createCalculationStudioI18n>['t']) {
	return kind === 'calculation'
		? t('calculation')
		: kind === 'calculatedMember'
			? t('calculatedMember')
			: t('parameter')
}
