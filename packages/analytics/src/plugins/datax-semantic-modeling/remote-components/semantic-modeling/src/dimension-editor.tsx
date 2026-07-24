import * as React from 'react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator
} from '@xpert-ai/shadcn-ui'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import {
	DeleteButton,
	EmptyCollection,
	ObjectSelectField,
	ObjectSwitchField,
	ObjectTextField,
	SectionHeading
} from './editor-shared'
import {
	appendItem,
	localized,
	objectCollection,
	readFirstTableName,
	removeAt,
	replaceAt,
	replaceCollection,
	setFirstTableName
} from './schema-utils'

export function DimensionEditor(props: {
	schema: JsonObject
	tables: string[]
	locale?: string
	onChange(schema: JsonObject): void
}) {
	const dimensions = objectCollection(props.schema, 'dimensions')
	const updateDimensions = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.schema, 'dimensions', items))
	const addDimension = () =>
		updateDimensions(
			appendItem(dimensions, {
				name: `Dimension ${dimensions.length + 1}`,
				caption: '',
				type: 'StandardDimension',
				hierarchies: []
			})
		)

	return (
		<div className="space-y-5">
			<SectionHeading
				title={localized(props.locale, 'Shared dimensions', '共享维度')}
				description={localized(
					props.locale,
					'Define reusable business dimensions, hierarchy tables, levels, keys, captions, and time semantics.',
					'定义可复用的业务维度、层级表、Level、键值、标题和时间语义。'
				)}
				action={<Button onClick={addDimension}>{localized(props.locale, 'Add dimension', '添加维度')}</Button>}
			/>

			{dimensions.length ? (
				<Accordion type="multiple" className="space-y-3">
					{dimensions.map((dimension, dimensionIndex) => {
						const name = readString(dimension, 'name') ?? `Dimension ${dimensionIndex + 1}`
						return (
							<AccordionItem
								key={`${dimensionIndex}:${name}`}
								value={`${dimensionIndex}:${name}`}
								className="rounded-lg border bg-card px-4"
							>
								<div className="flex items-center gap-2">
									<AccordionTrigger className="min-w-0 flex-1 hover:no-underline">
										<div className="flex min-w-0 items-center gap-2 text-left">
											<span className="truncate">{name}</span>
											<Badge variant="secondary">
												{objectCollection(dimension, 'hierarchies').length}{' '}
												{localized(props.locale, 'hierarchies', '个层级')}
											</Badge>
										</div>
									</AccordionTrigger>
									<DeleteButton
										locale={props.locale}
										itemName={name}
										onDelete={() => updateDimensions(removeAt(dimensions, dimensionIndex))}
									/>
								</div>
								<AccordionContent>
									<DimensionForm
										dimension={dimension}
										tables={props.tables}
										locale={props.locale}
										onChange={(nextDimension) =>
											updateDimensions(replaceAt(dimensions, dimensionIndex, nextDimension))
										}
									/>
								</AccordionContent>
							</AccordionItem>
						)
					})}
				</Accordion>
			) : (
				<EmptyCollection
					title={localized(props.locale, 'No shared dimensions', '暂无共享维度')}
					description={localized(
						props.locale,
						'Start with a reusable dimension such as Date, Customer, Product, or Organization.',
						'可先创建日期、客户、产品或组织等可复用维度。'
					)}
					action={
						<Button onClick={addDimension}>{localized(props.locale, 'Add dimension', '添加维度')}</Button>
					}
				/>
			)}
		</div>
	)
}

export function DimensionForm(props: {
	dimension: JsonObject
	tables: string[]
	locale?: string
	onChange(dimension: JsonObject): void
}) {
	const hierarchies = objectCollection(props.dimension, 'hierarchies')
	const updateHierarchies = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.dimension, 'hierarchies', items))
	const addHierarchy = () =>
		updateHierarchies(
			appendItem(hierarchies, {
				name: `Hierarchy ${hierarchies.length + 1}`,
				hasAll: true,
				levels: []
			})
		)

	return (
		<div className="space-y-5 pb-2">
			<div className="grid gap-3 lg:grid-cols-4">
				<ObjectTextField
					item={props.dimension}
					field="name"
					label={localized(props.locale, 'Technical name', '技术名称')}
					onChange={props.onChange}
				/>
				<ObjectTextField
					item={props.dimension}
					field="caption"
					label={localized(props.locale, 'Business caption', '业务标题')}
					onChange={props.onChange}
				/>
				<ObjectSelectField
					item={props.dimension}
					field="type"
					label={localized(props.locale, 'Dimension type', '维度类型')}
					options={[
						{ value: 'StandardDimension', label: localized(props.locale, 'Standard', '标准维度') },
						{ value: 'TimeDimension', label: localized(props.locale, 'Time', '时间维度') }
					]}
					onChange={props.onChange}
				/>
				<ObjectSwitchField
					item={props.dimension}
					field="visible"
					label={localized(props.locale, 'Visible', '可见')}
					defaultValue
					onChange={props.onChange}
				/>
				<div className="lg:col-span-4">
					<ObjectTextField
						item={props.dimension}
						field="description"
						label={localized(props.locale, 'Description', '描述')}
						multiline
						onChange={props.onChange}
					/>
				</div>
			</div>

			<Separator />
			<div className="flex items-center justify-between">
				<div>
					<div className="text-sm font-semibold">{localized(props.locale, 'Hierarchies', '层级结构')}</div>
					<div className="text-xs text-muted-foreground">
						{localized(props.locale, 'Map physical tables and level keys.', '映射物理表和各 Level 键值。')}
					</div>
				</div>
				<Button variant="outline" size="sm" onClick={addHierarchy}>
					{localized(props.locale, 'Add hierarchy', '添加层级结构')}
				</Button>
			</div>

			{hierarchies.map((hierarchy, hierarchyIndex) => (
				<HierarchyCard
					key={`${hierarchyIndex}:${readString(hierarchy, 'name') ?? ''}`}
					hierarchy={hierarchy}
					tables={props.tables}
					locale={props.locale}
					onChange={(nextHierarchy) =>
						updateHierarchies(replaceAt(hierarchies, hierarchyIndex, nextHierarchy))
					}
					onDelete={() => updateHierarchies(removeAt(hierarchies, hierarchyIndex))}
				/>
			))}
		</div>
	)
}

function HierarchyCard(props: {
	hierarchy: JsonObject
	tables: string[]
	locale?: string
	onChange(hierarchy: JsonObject): void
	onDelete(): void
}) {
	const levels = objectCollection(props.hierarchy, 'levels')
	const updateLevels = (items: JsonObject[]) => props.onChange(replaceCollection(props.hierarchy, 'levels', items))
	const tableName = readFirstTableName(props.hierarchy)
	const hierarchyName = readString(props.hierarchy, 'name') ?? 'Hierarchy'

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0 py-3">
				<CardTitle className="text-sm">{hierarchyName}</CardTitle>
				<DeleteButton locale={props.locale} itemName={hierarchyName} onDelete={props.onDelete} />
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-3 lg:grid-cols-4">
					<ObjectTextField
						item={props.hierarchy}
						field="name"
						label={localized(props.locale, 'Name', '名称')}
						onChange={props.onChange}
					/>
					<div className="grid gap-1.5">
						<label className="text-sm font-medium">{localized(props.locale, 'Table', '数据表')}</label>
						<Select
							value={tableName}
							onValueChange={(value) => props.onChange(setFirstTableName(props.hierarchy, value))}
						>
							<SelectTrigger>
								<SelectValue placeholder={localized(props.locale, 'Choose table', '选择数据表')} />
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
					<ObjectTextField
						item={props.hierarchy}
						field="primaryKey"
						label={localized(props.locale, 'Primary key', '主键字段')}
						onChange={props.onChange}
					/>
					<ObjectSwitchField
						item={props.hierarchy}
						field="hasAll"
						label={localized(props.locale, 'All member', '包含 All 成员')}
						defaultValue
						onChange={props.onChange}
					/>
				</div>

				<div className="overflow-x-auto rounded-md border">
					<table className="w-full min-w-[980px] text-sm">
						<thead className="bg-muted/50 text-left text-xs text-muted-foreground">
							<tr>
								<th className="px-3 py-2">{localized(props.locale, 'Level name', 'Level 名称')}</th>
								<th className="px-3 py-2">{localized(props.locale, 'Key column', '键字段')}</th>
								<th className="px-3 py-2">{localized(props.locale, 'Caption column', '标题字段')}</th>
								<th className="px-3 py-2">{localized(props.locale, 'Data type', '数据类型')}</th>
								<th className="px-3 py-2">{localized(props.locale, 'Level type', 'Level 类型')}</th>
								<th className="w-24 px-3 py-2">{localized(props.locale, 'Unique', '唯一')}</th>
								<th className="w-20 px-3 py-2" />
							</tr>
						</thead>
						<tbody>
							{levels.map((level, levelIndex) => (
								<LevelRow
									key={levelIndex}
									level={level}
									locale={props.locale}
									onChange={(nextLevel) => updateLevels(replaceAt(levels, levelIndex, nextLevel))}
									onDelete={() => updateLevels(removeAt(levels, levelIndex))}
								/>
							))}
						</tbody>
					</table>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						updateLevels(
							appendItem(levels, {
								name: `Level ${levels.length + 1}`,
								column: '',
								type: 'String',
								uniqueMembers: false
							})
						)
					}
				>
					{localized(props.locale, 'Add level', '添加 Level')}
				</Button>
			</CardContent>
		</Card>
	)
}

function LevelRow(props: { level: JsonObject; locale?: string; onChange(level: JsonObject): void; onDelete(): void }) {
	return (
		<tr className="border-t">
			<td className="p-2">
				<ObjectTextField item={props.level} field="name" label="" onChange={props.onChange} />
			</td>
			<td className="p-2">
				<ObjectTextField item={props.level} field="column" label="" onChange={props.onChange} />
			</td>
			<td className="p-2">
				<ObjectTextField item={props.level} field="captionColumn" label="" onChange={props.onChange} />
			</td>
			<td className="p-2">
				<ObjectSelectField
					item={props.level}
					field="type"
					label=""
					options={['String', 'Integer', 'Numeric', 'Boolean', 'Date', 'Time', 'Timestamp'].map((value) => ({
						value,
						label: value
					}))}
					onChange={props.onChange}
				/>
			</td>
			<td className="p-2">
				<ObjectSelectField
					item={props.level}
					field="levelType"
					label=""
					placeholder={localized(props.locale, 'Regular', '常规')}
					options={[
						{ value: 'Regular', label: localized(props.locale, 'Regular', '常规') },
						{ value: 'TimeYears', label: localized(props.locale, 'Year', '年') },
						{ value: 'TimeQuarters', label: localized(props.locale, 'Quarter', '季度') },
						{ value: 'TimeMonths', label: localized(props.locale, 'Month', '月') },
						{ value: 'TimeWeeks', label: localized(props.locale, 'Week', '周') },
						{ value: 'TimeDays', label: localized(props.locale, 'Day', '日') }
					]}
					onChange={props.onChange}
				/>
			</td>
			<td className="p-2">
				<ObjectSwitchField item={props.level} field="uniqueMembers" label="" onChange={props.onChange} />
			</td>
			<td className="p-2">
				<DeleteButton
					locale={props.locale}
					itemName={readString(props.level, 'name') ?? 'Level'}
					onDelete={props.onDelete}
				/>
			</td>
		</tr>
	)
}
