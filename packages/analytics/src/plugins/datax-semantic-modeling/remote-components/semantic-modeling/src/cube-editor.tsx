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
	Separator,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { DimensionForm } from './dimension-editor'
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
	readFactTableName,
	removeAt,
	replaceAt,
	replaceCollection,
	setFactTableName
} from './schema-utils'

type FieldSpec = {
	field: string
	label: string
	type?: 'text' | 'textarea' | 'select' | 'switch'
	options?: Array<{ value: string; label: string }>
	defaultValue?: boolean
}

export function CubeEditor(props: {
	schema: JsonObject
	tables: string[]
	locale?: string
	onChange(schema: JsonObject): void
}) {
	const cubes = objectCollection(props.schema, 'cubes')
	const dimensions = objectCollection(props.schema, 'dimensions')
	const dimensionOptions = dimensions
		.map((dimension) => readString(dimension, 'name'))
		.filter((name): name is string => Boolean(name))
		.map((name) => ({ value: name, label: name }))
	const updateCubes = (items: JsonObject[]) => props.onChange(replaceCollection(props.schema, 'cubes', items))
	const addCube = () =>
		updateCubes(
			appendItem(cubes, {
				name: `Cube ${cubes.length + 1}`,
				caption: '',
				fact: { type: 'table' },
				dimensionUsages: [],
				dimensions: [],
				measures: [],
				calculatedMembers: [],
				calculations: [],
				parameters: []
			})
		)

	return (
		<div className="space-y-5">
			<SectionHeading
				title={localized(props.locale, 'Cubes and measures', 'Cube 与度量')}
				description={localized(
					props.locale,
					'Map fact tables, reusable and local dimensions, measures, calculated members, calculations, and parameters.',
					'映射事实表、共享和局部维度、度量、计算成员、增强计算与参数。'
				)}
				action={<Button onClick={addCube}>{localized(props.locale, 'Add cube', '添加 Cube')}</Button>}
			/>

			{cubes.length ? (
				<Accordion type="multiple" className="space-y-3">
					{cubes.map((cube, cubeIndex) => {
						const name = readString(cube, 'name') ?? `Cube ${cubeIndex + 1}`
						return (
							<AccordionItem
								key={`${cubeIndex}:${name}`}
								value={`${cubeIndex}:${name}`}
								className="rounded-lg border bg-card px-4"
							>
								<div className="flex items-center gap-2">
									<AccordionTrigger className="min-w-0 flex-1 hover:no-underline">
										<div className="flex min-w-0 items-center gap-2 text-left">
											<span className="truncate">{name}</span>
											<Badge variant="outline">
												{readFactTableName(cube) || 'No fact table'}
											</Badge>
											<Badge variant="secondary">
												{objectCollection(cube, 'measures').length}{' '}
												{localized(props.locale, 'measures', '个度量')}
											</Badge>
										</div>
									</AccordionTrigger>
									<DeleteButton
										locale={props.locale}
										itemName={name}
										onDelete={() => updateCubes(removeAt(cubes, cubeIndex))}
									/>
								</div>
								<AccordionContent>
									<CubeForm
										cube={cube}
										tables={props.tables}
										dimensionOptions={dimensionOptions}
										locale={props.locale}
										onChange={(nextCube) => updateCubes(replaceAt(cubes, cubeIndex, nextCube))}
									/>
								</AccordionContent>
							</AccordionItem>
						)
					})}
				</Accordion>
			) : (
				<EmptyCollection
					title={localized(props.locale, 'No cubes', '暂无 Cube')}
					description={localized(
						props.locale,
						'Create a cube, select its fact table, then define dimensions and measures.',
						'创建 Cube，选择事实表，然后配置维度和度量。'
					)}
					action={<Button onClick={addCube}>{localized(props.locale, 'Add cube', '添加 Cube')}</Button>}
				/>
			)}
		</div>
	)
}

function CubeForm(props: {
	cube: JsonObject
	tables: string[]
	dimensionOptions: Array<{ value: string; label: string }>
	locale?: string
	onChange(cube: JsonObject): void
}) {
	const factTableName = readFactTableName(props.cube)

	return (
		<div className="space-y-5 pb-2">
			<div className="grid gap-3 lg:grid-cols-4">
				<ObjectTextField
					item={props.cube}
					field="name"
					label={localized(props.locale, 'Technical name', '技术名称')}
					onChange={props.onChange}
				/>
				<ObjectTextField
					item={props.cube}
					field="caption"
					label={localized(props.locale, 'Business caption', '业务标题')}
					onChange={props.onChange}
				/>
				<div className="grid gap-1.5">
					<label className="text-sm font-medium">{localized(props.locale, 'Fact table', '事实表')}</label>
					<Select
						value={factTableName}
						onValueChange={(value) => props.onChange(setFactTableName(props.cube, value))}
					>
						<SelectTrigger>
							<SelectValue placeholder={localized(props.locale, 'Choose fact table', '选择事实表')} />
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
					item={props.cube}
					field="defaultMeasure"
					label={localized(props.locale, 'Default measure', '默认度量')}
					onChange={props.onChange}
				/>
				<div className="lg:col-span-4">
					<ObjectTextField
						item={props.cube}
						field="description"
						label={localized(props.locale, 'Description', '描述')}
						multiline
						onChange={props.onChange}
					/>
				</div>
			</div>

			<Separator />
			<Tabs defaultValue="usages">
				<TabsList className="h-auto flex-wrap justify-start">
					<TabsTrigger value="usages">
						{localized(props.locale, 'Dimension usages', '共享维度引用')}
					</TabsTrigger>
					<TabsTrigger value="local">{localized(props.locale, 'Local dimensions', '局部维度')}</TabsTrigger>
					<TabsTrigger value="measures">{localized(props.locale, 'Measures', '度量')}</TabsTrigger>
					<TabsTrigger value="members">
						{localized(props.locale, 'Calculated members', '计算成员')}
					</TabsTrigger>
					<TabsTrigger value="calculations">
						{localized(props.locale, 'Calculations', '增强计算')}
					</TabsTrigger>
					<TabsTrigger value="parameters">{localized(props.locale, 'Parameters', '参数')}</TabsTrigger>
				</TabsList>

				<TabsContent value="usages">
					<NestedCollection
						parent={props.cube}
						collection="dimensionUsages"
						title={localized(props.locale, 'Shared dimension usage', '共享维度引用')}
						description={localized(
							props.locale,
							'Connect the fact foreign key to a reusable shared dimension.',
							'将事实表外键连接到可复用的共享维度。'
						)}
						locale={props.locale}
						fields={[
							{ field: 'name', label: localized(props.locale, 'Usage name', '引用名称') },
							{
								field: 'source',
								label: localized(props.locale, 'Shared dimension', '共享维度'),
								type: 'select',
								options: props.dimensionOptions
							},
							{ field: 'foreignKey', label: localized(props.locale, 'Fact foreign key', '事实表外键') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') }
						]}
						newItem={() => ({
							name: `Dimension Usage ${objectCollection(props.cube, 'dimensionUsages').length + 1}`,
							source: props.dimensionOptions[0]?.value ?? '',
							foreignKey: ''
						})}
						onChange={props.onChange}
					/>
				</TabsContent>

				<TabsContent value="local">
					<LocalDimensions
						cube={props.cube}
						tables={props.tables}
						locale={props.locale}
						onChange={props.onChange}
					/>
				</TabsContent>

				<TabsContent value="measures">
					<NestedCollection
						parent={props.cube}
						collection="measures"
						title={localized(props.locale, 'Physical measures', '物理度量')}
						description={localized(
							props.locale,
							'Map numeric fact columns and choose SQL aggregation behavior.',
							'映射事实表数值字段并设置 SQL 聚合方式。'
						)}
						locale={props.locale}
						fields={[
							{ field: 'name', label: localized(props.locale, 'Name', '名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{ field: 'column', label: localized(props.locale, 'Column', '字段') },
							{
								field: 'aggregator',
								label: localized(props.locale, 'Aggregator', '聚合器'),
								type: 'select',
								options: ['sum', 'count', 'min', 'max', 'avg', 'distinct-count'].map((value) => ({
									value,
									label: value
								}))
							},
							{ field: 'formatString', label: localized(props.locale, 'Format', '格式') },
							{
								field: 'visible',
								label: localized(props.locale, 'Visible', '可见'),
								type: 'switch',
								defaultValue: true
							}
						]}
						newItem={() => ({
							name: `Measure ${objectCollection(props.cube, 'measures').length + 1}`,
							column: '',
							aggregator: 'sum',
							visible: true
						})}
						onChange={props.onChange}
					/>
				</TabsContent>

				<TabsContent value="members">
					<NestedCollection
						parent={props.cube}
						collection="calculatedMembers"
						title={localized(props.locale, 'Calculated members', '计算成员')}
						description={localized(
							props.locale,
							'Define MDX formulas, target dimensions, visibility, and display captions.',
							'定义 MDX 公式、目标维度、可见性和展示标题。'
						)}
						locale={props.locale}
						fields={[
							{ field: 'name', label: localized(props.locale, 'Name', '名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{ field: 'dimension', label: localized(props.locale, 'Dimension', '维度') },
							{ field: 'hierarchy', label: localized(props.locale, 'Hierarchy', '层级') },
							{
								field: 'formula',
								label: localized(props.locale, 'MDX formula', 'MDX 公式'),
								type: 'textarea'
							},
							{
								field: 'visible',
								label: localized(props.locale, 'Visible', '可见'),
								type: 'switch',
								defaultValue: true
							}
						]}
						newItem={() => ({
							name: `Calculated Member ${objectCollection(props.cube, 'calculatedMembers').length + 1}`,
							formula: '',
							visible: true
						})}
						onChange={props.onChange}
					/>
				</TabsContent>

				<TabsContent value="calculations">
					<NestedCollection
						parent={props.cube}
						collection="calculations"
						title={localized(props.locale, 'Enhanced calculations', '增强计算')}
						description={localized(
							props.locale,
							'Configure restricted, calculated, aggregation, variance, or indicator calculations.',
							'配置限制度量、公式计算、条件聚合、方差或指标计算。'
						)}
						locale={props.locale}
						fields={[
							{ field: 'name', label: localized(props.locale, 'Name', '名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{
								field: 'calculationType',
								label: localized(props.locale, 'Calculation type', '计算类型'),
								type: 'select',
								options: [
									'Restricted',
									'Calculated',
									'Aggregation',
									'Variance',
									'Indicator',
									'Parameter'
								].map((value) => ({ value, label: value }))
							},
							{
								field: 'formula',
								label: localized(props.locale, 'Formula / expression', '公式 / 表达式'),
								type: 'textarea'
							},
							{ field: 'aggregator', label: localized(props.locale, 'Aggregator', '聚合器') }
						]}
						newItem={() => ({
							name: `Calculation ${objectCollection(props.cube, 'calculations').length + 1}`,
							calculationType: 'Calculated',
							formula: ''
						})}
						onChange={props.onChange}
					/>
				</TabsContent>

				<TabsContent value="parameters">
					<NestedCollection
						parent={props.cube}
						collection="parameters"
						title={localized(props.locale, 'Runtime parameters', '运行时参数')}
						description={localized(
							props.locale,
							'Expose scalar or member-selection parameters to downstream queries and apps.',
							'向下游查询和应用暴露标量或成员选择参数。'
						)}
						locale={props.locale}
						fields={[
							{ field: 'name', label: localized(props.locale, 'Name', '名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{
								field: 'paramType',
								label: localized(props.locale, 'Parameter type', '参数类型'),
								type: 'select',
								options: ['Input', 'Select', 'Dimensions', 'Measures'].map((value) => ({
									value,
									label: value
								}))
							},
							{ field: 'hierarchy', label: localized(props.locale, 'Hierarchy', '层级') },
							{ field: 'value', label: localized(props.locale, 'Default value', '默认值') },
							{ field: 'multiple', label: localized(props.locale, 'Multiple', '多选'), type: 'switch' }
						]}
						newItem={() => ({
							name: `Parameter ${objectCollection(props.cube, 'parameters').length + 1}`,
							paramType: 'Input',
							multiple: false
						})}
						onChange={props.onChange}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
}

function NestedCollection(props: {
	parent: JsonObject
	collection: string
	title: string
	description: string
	fields: FieldSpec[]
	newItem(): JsonObject
	locale?: string
	onChange(parent: JsonObject): void
}) {
	const items = objectCollection(props.parent, props.collection)
	const updateItems = (nextItems: JsonObject[]) =>
		props.onChange(replaceCollection(props.parent, props.collection, nextItems))
	return (
		<div className="space-y-3 pt-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-semibold">{props.title}</div>
					<div className="text-xs text-muted-foreground">{props.description}</div>
				</div>
				<Button variant="outline" size="sm" onClick={() => updateItems(appendItem(items, props.newItem()))}>
					{localized(props.locale, 'Add', '添加')}
				</Button>
			</div>
			{items.map((item, index) => (
				<Card key={`${index}:${readString(item, 'name') ?? ''}`}>
					<CardHeader className="flex-row items-center justify-between space-y-0 py-3">
						<CardTitle className="text-sm">
							{readString(item, 'name') || `${props.title} ${index + 1}`}
						</CardTitle>
						<DeleteButton
							locale={props.locale}
							itemName={readString(item, 'name') ?? props.title}
							onDelete={() => updateItems(removeAt(items, index))}
						/>
					</CardHeader>
					<CardContent className="grid gap-3 lg:grid-cols-3">
						{props.fields.map((field) => (
							<React.Fragment key={field.field}>
								{field.type === 'select' ? (
									<ObjectSelectField
										item={item}
										field={field.field}
										label={field.label}
										options={field.options ?? []}
										onChange={(nextItem) => updateItems(replaceAt(items, index, nextItem))}
									/>
								) : field.type === 'switch' ? (
									<ObjectSwitchField
										item={item}
										field={field.field}
										label={field.label}
										defaultValue={field.defaultValue}
										onChange={(nextItem) => updateItems(replaceAt(items, index, nextItem))}
									/>
								) : (
									<ObjectTextField
										item={item}
										field={field.field}
										label={field.label}
										multiline={field.type === 'textarea'}
										onChange={(nextItem) => updateItems(replaceAt(items, index, nextItem))}
									/>
								)}
							</React.Fragment>
						))}
					</CardContent>
				</Card>
			))}
		</div>
	)
}

function LocalDimensions(props: {
	cube: JsonObject
	tables: string[]
	locale?: string
	onChange(cube: JsonObject): void
}) {
	const dimensions = objectCollection(props.cube, 'dimensions')
	const updateDimensions = (items: JsonObject[]) => props.onChange(replaceCollection(props.cube, 'dimensions', items))
	return (
		<div className="space-y-3 pt-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-semibold">
						{localized(props.locale, 'Local dimensions', '局部维度')}
					</div>
					<div className="text-xs text-muted-foreground">
						{localized(
							props.locale,
							'Dimensions owned only by this cube, with the same hierarchy and level capabilities.',
							'仅归此 Cube 所有的维度，支持相同的层级结构和 Level 配置。'
						)}
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						updateDimensions(
							appendItem(dimensions, {
								name: `Local Dimension ${dimensions.length + 1}`,
								type: 'StandardDimension',
								hierarchies: []
							})
						)
					}
				>
					{localized(props.locale, 'Add local dimension', '添加局部维度')}
				</Button>
			</div>
			{dimensions.map((dimension, index) => (
				<Card key={`${index}:${readString(dimension, 'name') ?? ''}`}>
					<CardHeader className="flex-row items-center justify-between space-y-0 py-3">
						<CardTitle className="text-sm">
							{readString(dimension, 'name') ?? `Local Dimension ${index + 1}`}
						</CardTitle>
						<DeleteButton
							locale={props.locale}
							itemName={readString(dimension, 'name') ?? 'Local dimension'}
							onDelete={() => updateDimensions(removeAt(dimensions, index))}
						/>
					</CardHeader>
					<CardContent>
						<DimensionForm
							dimension={dimension}
							tables={props.tables}
							locale={props.locale}
							onChange={(nextDimension) => updateDimensions(replaceAt(dimensions, index, nextDimension))}
						/>
					</CardContent>
				</Card>
			))}
		</div>
	)
}
