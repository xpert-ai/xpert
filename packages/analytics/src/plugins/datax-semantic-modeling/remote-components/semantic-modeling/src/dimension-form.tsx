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
	Button,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@xpert-ai/shadcn-ui'
import { Plus, Trash2 } from 'lucide-react'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
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

export function DimensionForm(props: {
	dimension: JsonObject
	tables: string[]
	locale?: string
	onChange(dimension: JsonObject): void
}) {
	const i18n = React.useMemo(() => createDimensionStudioI18n(props.locale), [props.locale])
	const hierarchies = objectCollection(props.dimension, 'hierarchies')
	const updateHierarchies = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.dimension, 'hierarchies', items))

	return (
		<div className="space-y-4">
			<div className="grid gap-2 lg:grid-cols-3">
				<CompactTextField
					label={i18n.t('technicalName')}
					value={readString(props.dimension, 'name') ?? ''}
					onChange={(value) => props.onChange(setObjectValue(props.dimension, 'name', value))}
				/>
				<CompactTextField
					label={i18n.t('businessTitle')}
					value={readString(props.dimension, 'caption') ?? ''}
					onChange={(value) => props.onChange(setObjectValue(props.dimension, 'caption', value))}
				/>
				<div className="grid gap-1">
					<Label className="text-[10px] font-medium text-muted-foreground">{i18n.t('dimensionType')}</Label>
					<Select
						value={readString(props.dimension, 'type') ?? 'StandardDimension'}
						onValueChange={(value) => props.onChange(setObjectValue(props.dimension, 'type', value))}
					>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="StandardDimension">{i18n.t('standard')}</SelectItem>
							<SelectItem value="TimeDimension">{i18n.t('time')}</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex items-center justify-between">
				<div className="text-xs font-semibold">{i18n.t('hierarchies')}</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => updateHierarchies(appendItem(hierarchies, newHierarchy(hierarchies.length + 1)))}
				>
					<Plus aria-hidden="true" />
					{i18n.t('addHierarchy')}
				</Button>
			</div>
			{hierarchies.map((hierarchy, hierarchyIndex) => {
				const levels = objectCollection(hierarchy, 'levels')
				const updateHierarchy = (next: JsonObject) =>
					updateHierarchies(replaceAt(hierarchies, hierarchyIndex, next))
				const updateLevels = (items: JsonObject[]) =>
					updateHierarchy(replaceCollection(hierarchy, 'levels', items))
				const hierarchyName = readString(hierarchy, 'name') ?? i18n.t('hierarchy')
				return (
					<div key={`${hierarchyIndex}:${hierarchyName}`} className="rounded-md border">
						<div className="grid grid-cols-[minmax(140px,1fr)_minmax(160px,1fr)_minmax(140px,1fr)_auto] gap-2 border-b bg-muted/15 p-3">
							<CompactTextField
								label={i18n.t('hierarchyName')}
								value={hierarchyName}
								onChange={(value) => updateHierarchy(setObjectValue(hierarchy, 'name', value))}
							/>
							<div className="grid gap-1">
								<Label className="text-[10px] font-medium text-muted-foreground">
									{i18n.t('sourceTables')}
								</Label>
								<Select
									value={readFirstTableName(hierarchy)}
									onValueChange={(value) => updateHierarchy(setFirstTableName(hierarchy, value))}
								>
									<SelectTrigger className="h-7 text-xs">
										<SelectValue placeholder={i18n.t('chooseTable')} />
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
								label={i18n.t('primaryKey')}
								value={readString(hierarchy, 'primaryKey') ?? ''}
								onChange={(value) => updateHierarchy(setObjectValue(hierarchy, 'primaryKey', value))}
							/>
							<HierarchyDelete
								i18n={i18n}
								name={hierarchyName}
								onDelete={() => updateHierarchies(removeAt(hierarchies, hierarchyIndex))}
							/>
						</div>
						<div className="space-y-2 p-3">
							{levels.map((level, levelIndex) => (
								<div
									key={`${levelIndex}:${readString(level, 'name') ?? ''}`}
									className="grid grid-cols-[minmax(130px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_auto] gap-2"
								>
									<CompactTextField
										label={i18n.t('levelName')}
										value={readString(level, 'name') ?? ''}
										onChange={(value) =>
											updateLevels(
												replaceAt(levels, levelIndex, setObjectValue(level, 'name', value))
											)
										}
									/>
									<CompactTextField
										label={i18n.t('keyColumn')}
										value={readString(level, 'column') ?? ''}
										onChange={(value) =>
											updateLevels(
												replaceAt(levels, levelIndex, setObjectValue(level, 'column', value))
											)
										}
									/>
									<CompactTextField
										label={i18n.t('captionColumn')}
										value={readString(level, 'captionColumn') ?? ''}
										onChange={(value) =>
											updateLevels(
												replaceAt(
													levels,
													levelIndex,
													setObjectValue(level, 'captionColumn', value)
												)
											)
										}
									/>
									<LevelDelete
										i18n={i18n}
										name={readString(level, 'name') ?? `Level ${levelIndex + 1}`}
										onDelete={() => updateLevels(removeAt(levels, levelIndex))}
									/>
								</div>
							))}
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									updateLevels(
										appendItem(levels, {
											name: `Level ${levels.length + 1}`,
											column: '',
											type: 'String',
											levelType: 'Regular',
											uniqueMembers: false
										})
									)
								}
							>
								<Plus aria-hidden="true" />
								{i18n.t('addLevel')}
							</Button>
						</div>
					</div>
				)
			})}
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
				className="h-7 min-w-0 px-2 text-xs"
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

function HierarchyDelete(props: { i18n: DimensionStudioI18n; name: string; onDelete(): void }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="mt-5 text-destructive hover:text-destructive"
					aria-label={`${props.i18n.t('delete')} ${props.name}`}
				>
					<Trash2 aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.i18n.t('deleteHierarchyTitle')}</AlertDialogTitle>
					<AlertDialogDescription>
						{props.i18n.t('deleteHierarchyDescription', { name: props.name })}
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

function LevelDelete(props: { i18n: DimensionStudioI18n; name: string; onDelete(): void }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="mt-5 text-destructive hover:text-destructive"
					aria-label={`${props.i18n.t('delete')} ${props.name}`}
				>
					<Trash2 aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.i18n.t('deleteLevelTitle')}</AlertDialogTitle>
					<AlertDialogDescription>
						{props.i18n.t('deleteLevelDescription', { name: props.name })}
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

function newHierarchy(index: number): JsonObject {
	return { name: `Hierarchy ${index}`, caption: `Hierarchy ${index}`, hasAll: true, tables: [], levels: [] }
}
