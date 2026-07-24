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
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger
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
import { appendItem, localized, objectCollection, removeAt, replaceAt, replaceCollection } from './schema-utils'

type VirtualField = {
	field: string
	label: string
	type?: 'text' | 'textarea' | 'select' | 'switch'
	options?: Array<{ value: string; label: string }>
	defaultValue?: boolean
}

export function VirtualCubeEditor(props: { schema: JsonObject; locale?: string; onChange(schema: JsonObject): void }) {
	const virtualCubes = objectCollection(props.schema, 'virtualCubes')
	const cubeNames = objectCollection(props.schema, 'cubes')
		.map((cube) => readString(cube, 'name'))
		.filter((name): name is string => Boolean(name))
	const cubeOptions = cubeNames.map((name) => ({ value: name, label: name }))
	const updateVirtualCubes = (items: JsonObject[]) =>
		props.onChange(replaceCollection(props.schema, 'virtualCubes', items))
	const addVirtualCube = () =>
		updateVirtualCubes(
			appendItem(virtualCubes, {
				name: `Virtual Cube ${virtualCubes.length + 1}`,
				cubeUsages: [],
				virtualCubeDimensions: [],
				virtualCubeMeasures: [],
				calculatedMembers: []
			})
		)

	return (
		<div className="space-y-5">
			<SectionHeading
				title={localized(props.locale, 'Virtual cubes', '虚拟 Cube')}
				description={localized(
					props.locale,
					'Compose measures and dimensions from multiple physical cubes into a governed analytical surface.',
					'将多个物理 Cube 的度量和维度组合为受治理的统一分析界面。'
				)}
				action={
					<Button onClick={addVirtualCube}>
						{localized(props.locale, 'Add virtual cube', '添加虚拟 Cube')}
					</Button>
				}
			/>

			{virtualCubes.length ? (
				<Accordion type="multiple" className="space-y-3">
					{virtualCubes.map((virtualCube, index) => {
						const name = readString(virtualCube, 'name') ?? `Virtual Cube ${index + 1}`
						return (
							<AccordionItem
								key={`${index}:${name}`}
								value={`${index}:${name}`}
								className="rounded-lg border bg-card px-4"
							>
								<div className="flex items-center gap-2">
									<AccordionTrigger className="min-w-0 flex-1 hover:no-underline">
										<div className="flex min-w-0 items-center gap-2 text-left">
											<span className="truncate">{name}</span>
											<Badge variant="secondary">
												{objectCollection(virtualCube, 'cubeUsages').length}{' '}
												{localized(props.locale, 'source cubes', '个来源 Cube')}
											</Badge>
										</div>
									</AccordionTrigger>
									<DeleteButton
										locale={props.locale}
										itemName={name}
										onDelete={() => updateVirtualCubes(removeAt(virtualCubes, index))}
									/>
								</div>
								<AccordionContent>
									<VirtualCubeForm
										virtualCube={virtualCube}
										cubeOptions={cubeOptions}
										locale={props.locale}
										onChange={(next) => updateVirtualCubes(replaceAt(virtualCubes, index, next))}
									/>
								</AccordionContent>
							</AccordionItem>
						)
					})}
				</Accordion>
			) : (
				<EmptyCollection
					title={localized(props.locale, 'No virtual cubes', '暂无虚拟 Cube')}
					description={localized(
						props.locale,
						'Create one after defining at least one physical cube.',
						'定义至少一个物理 Cube 后即可创建。'
					)}
					action={
						<Button onClick={addVirtualCube}>
							{localized(props.locale, 'Add virtual cube', '添加虚拟 Cube')}
						</Button>
					}
				/>
			)}
		</div>
	)
}

function VirtualCubeForm(props: {
	virtualCube: JsonObject
	cubeOptions: Array<{ value: string; label: string }>
	locale?: string
	onChange(virtualCube: JsonObject): void
}) {
	return (
		<div className="space-y-5 pb-2">
			<div className="grid gap-3 lg:grid-cols-3">
				<ObjectTextField
					item={props.virtualCube}
					field="name"
					label={localized(props.locale, 'Technical name', '技术名称')}
					onChange={props.onChange}
				/>
				<ObjectTextField
					item={props.virtualCube}
					field="caption"
					label={localized(props.locale, 'Business caption', '业务标题')}
					onChange={props.onChange}
				/>
				<ObjectTextField
					item={props.virtualCube}
					field="description"
					label={localized(props.locale, 'Description', '描述')}
					onChange={props.onChange}
				/>
			</div>

			<Tabs defaultValue="usages">
				<TabsList className="h-auto flex-wrap justify-start">
					<TabsTrigger value="usages">{localized(props.locale, 'Cube usages', 'Cube 引用')}</TabsTrigger>
					<TabsTrigger value="dimensions">{localized(props.locale, 'Dimensions', '维度')}</TabsTrigger>
					<TabsTrigger value="measures">{localized(props.locale, 'Measures', '度量')}</TabsTrigger>
					<TabsTrigger value="members">
						{localized(props.locale, 'Calculated members', '计算成员')}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="usages">
					<VirtualCollection
						parent={props.virtualCube}
						collection="cubeUsages"
						title={localized(props.locale, 'Source cube', '来源 Cube')}
						fields={[
							{
								field: 'cubeName',
								label: localized(props.locale, 'Cube', 'Cube'),
								type: 'select',
								options: props.cubeOptions
							},
							{
								field: 'ignoreUnrelatedDimensions',
								label: localized(props.locale, 'Ignore unrelated dimensions', '忽略无关维度'),
								type: 'switch'
							}
						]}
						newItem={() => ({
							cubeName: props.cubeOptions[0]?.value ?? '',
							ignoreUnrelatedDimensions: false
						})}
						locale={props.locale}
						onChange={props.onChange}
					/>
				</TabsContent>
				<TabsContent value="dimensions">
					<VirtualCollection
						parent={props.virtualCube}
						collection="virtualCubeDimensions"
						title={localized(props.locale, 'Virtual dimension', '虚拟维度')}
						fields={[
							{
								field: 'cubeName',
								label: localized(props.locale, 'Source cube', '来源 Cube'),
								type: 'select',
								options: props.cubeOptions
							},
							{ field: 'name', label: localized(props.locale, 'Dimension name', '维度名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{ field: '__shared__', label: localized(props.locale, 'Shared', '共享'), type: 'switch' }
						]}
						newItem={() => ({ cubeName: props.cubeOptions[0]?.value ?? '', name: '' })}
						locale={props.locale}
						onChange={props.onChange}
					/>
				</TabsContent>
				<TabsContent value="measures">
					<VirtualCollection
						parent={props.virtualCube}
						collection="virtualCubeMeasures"
						title={localized(props.locale, 'Virtual measure', '虚拟度量')}
						fields={[
							{
								field: 'cubeName',
								label: localized(props.locale, 'Source cube', '来源 Cube'),
								type: 'select',
								options: props.cubeOptions
							},
							{ field: 'name', label: localized(props.locale, 'Measure name', '度量名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{
								field: 'visible',
								label: localized(props.locale, 'Visible', '可见'),
								type: 'switch',
								defaultValue: true
							}
						]}
						newItem={() => ({ cubeName: props.cubeOptions[0]?.value ?? '', name: '', visible: true })}
						locale={props.locale}
						onChange={props.onChange}
					/>
				</TabsContent>
				<TabsContent value="members">
					<VirtualCollection
						parent={props.virtualCube}
						collection="calculatedMembers"
						title={localized(props.locale, 'Virtual calculated member', '虚拟计算成员')}
						fields={[
							{ field: 'name', label: localized(props.locale, 'Name', '名称') },
							{ field: 'caption', label: localized(props.locale, 'Caption', '标题') },
							{ field: 'dimension', label: localized(props.locale, 'Dimension', '维度') },
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
						newItem={() => ({ name: '', formula: '', visible: true })}
						locale={props.locale}
						onChange={props.onChange}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
}

function VirtualCollection(props: {
	parent: JsonObject
	collection: string
	title: string
	fields: VirtualField[]
	newItem(): JsonObject
	locale?: string
	onChange(parent: JsonObject): void
}) {
	const items = objectCollection(props.parent, props.collection)
	const updateItems = (next: JsonObject[]) => props.onChange(replaceCollection(props.parent, props.collection, next))
	return (
		<div className="space-y-3 pt-3">
			<div className="flex items-center justify-between">
				<div className="text-sm font-semibold">{props.title}</div>
				<Button variant="outline" size="sm" onClick={() => updateItems(appendItem(items, props.newItem()))}>
					{localized(props.locale, 'Add', '添加')}
				</Button>
			</div>
			{items.map((item, index) => (
				<Card key={`${index}:${readString(item, 'name') ?? readString(item, 'cubeName') ?? ''}`}>
					<CardHeader className="flex-row items-center justify-between space-y-0 py-3">
						<CardTitle className="text-sm">
							{readString(item, 'name') ?? readString(item, 'cubeName') ?? `${props.title} ${index + 1}`}
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
