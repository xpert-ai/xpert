import * as React from 'react'
import {
	Button,
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
	Switch,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Textarea
} from '@xpert-ai/shadcn-ui'
import { MetricForm, Option, tr } from './types'

export function MetricEditorDialog(props: {
	open: boolean
	mode: 'create' | 'edit'
	form: MetricForm
	models: Option[]
	cubes: Option[]
	measures: Option[]
	businessAreas: Option[]
	certifications: Option[]
	busy: boolean
	locale?: string
	onOpenChange(open: boolean): void
	onChange(form: MetricForm): void
	onSubmit(): void
}) {
	function update<K extends keyof MetricForm>(key: K, value: MetricForm[K]) {
		props.onChange({ ...props.form, [key]: value })
	}

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>
						{props.mode === 'create'
							? tr(props.locale, 'Create governed metric', '创建受治理指标')
							: tr(props.locale, 'Edit governed metric', '编辑受治理指标')}
					</DialogTitle>
					<DialogDescription>
						{tr(
							props.locale,
							'Define business identity, semantic logic, and governance metadata in one draft.',
							'在同一个草稿中定义业务标识、语义逻辑和治理元数据。'
						)}
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="definition" className="min-h-0">
					<TabsList className="w-full justify-start">
						<TabsTrigger value="definition">{tr(props.locale, 'Definition', '定义')}</TabsTrigger>
						<TabsTrigger value="logic">{tr(props.locale, 'Semantic logic', '语义逻辑')}</TabsTrigger>
						<TabsTrigger value="governance">{tr(props.locale, 'Governance', '治理')}</TabsTrigger>
					</TabsList>

					<div className="max-h-[62vh] overflow-y-auto py-4">
						<TabsContent value="definition" className="mt-0 grid gap-4 lg:grid-cols-2">
							<FormInput
								label={tr(props.locale, 'Metric code', '指标编码')}
								required
								value={props.form.code}
								onChange={(value) => update('code', value)}
							/>
							<FormInput
								label={tr(props.locale, 'Metric name', '指标名称')}
								required
								value={props.form.name}
								onChange={(value) => update('name', value)}
							/>
							<FormSelect
								label={tr(props.locale, 'Metric type', '指标类型')}
								value={props.form.type}
								options={[
									{ value: 'BASIC', label: tr(props.locale, 'Basic metric', '基础指标') },
									{ value: 'DERIVE', label: tr(props.locale, 'Derived metric', '派生指标') }
								]}
								onChange={(value) => update('type', value === 'DERIVE' ? 'DERIVE' : 'BASIC')}
							/>
							<FormSelect
								label={tr(props.locale, 'Semantic model', '语义模型')}
								value={props.form.modelId}
								options={props.models}
								placeholder={tr(props.locale, 'Choose model', '选择模型')}
								onChange={(value) => update('modelId', value)}
							/>
							<FormSelect
								label={tr(props.locale, 'Cube / entity', 'Cube / 实体')}
								value={props.form.cube}
								options={props.cubes}
								placeholder={tr(props.locale, 'Choose Cube', '选择立方体')}
								onChange={(value) => update('cube', value)}
							/>
							<FormSelect
								label={tr(props.locale, 'Business area', '业务域')}
								value={props.form.businessAreaId}
								options={props.businessAreas}
								placeholder={tr(props.locale, 'Choose business area', '选择业务域')}
								onChange={(value) => update('businessAreaId', value)}
							/>
							<div className="lg:col-span-2">
								<FormTextarea
									label={tr(props.locale, 'Description', '描述')}
									value={props.form.description}
									onChange={(value) => update('description', value)}
								/>
							</div>
							<div className="lg:col-span-2">
								<FormTextarea
									label={tr(props.locale, 'Business definition', '业务口径')}
									value={props.form.business}
									onChange={(value) => update('business', value)}
								/>
							</div>
						</TabsContent>

						<TabsContent value="logic" className="mt-0 grid gap-4 lg:grid-cols-2">
							<FormSelect
								label={tr(props.locale, 'Base measure', '基础度量')}
								value={props.form.measure}
								options={props.measures}
								placeholder={tr(props.locale, 'Choose measure', '选择基础度量')}
								onChange={(value) => update('measure', value)}
							/>
							<FormSelect
								label={tr(props.locale, 'SQL aggregator', 'SQL 聚合器')}
								value={props.form.aggregator}
								options={['sum', 'count', 'min', 'max', 'avg', 'distinct-count'].map((value) => ({
									value,
									label: value
								}))}
								onChange={(value) => update('aggregator', value)}
							/>
							<FormInput
								label={tr(props.locale, 'Calendar', '日历')}
								value={props.form.calendar}
								onChange={(value) => update('calendar', value)}
							/>
							<FormInput
								label={tr(props.locale, 'Unit', '单位')}
								value={props.form.unit}
								onChange={(value) => update('unit', value)}
							/>
							<div className="lg:col-span-2">
								<FormTextarea
									label={tr(props.locale, 'Formula / MDX expression', '公式 / MDX 表达式')}
									value={props.form.formula}
									className="min-h-28 font-mono"
									onChange={(value) => update('formula', value)}
								/>
							</div>
							<div className="lg:col-span-2">
								<FormInput
									label={tr(
										props.locale,
										'Free dimensions (comma separated)',
										'自由维度（逗号分隔）'
									)}
									value={props.form.dimensionsText}
									onChange={(value) => update('dimensionsText', value)}
								/>
							</div>
							<div className="lg:col-span-2">
								<FormTextarea
									label={tr(props.locale, 'Filters JSON', '过滤条件 JSON')}
									value={props.form.filtersText}
									className="min-h-32 font-mono text-xs"
									onChange={(value) => update('filtersText', value)}
								/>
							</div>
						</TabsContent>

						<TabsContent value="governance" className="mt-0 grid gap-4 lg:grid-cols-2">
							<FormSelect
								label={tr(props.locale, 'Certification', '认证')}
								value={props.form.certificationId}
								options={props.certifications}
								placeholder={tr(props.locale, 'Choose certification', '选择认证')}
								onChange={(value) => update('certificationId', value)}
							/>
							<FormInput
								label={tr(props.locale, 'Principal', '负责人')}
								value={props.form.principal}
								onChange={(value) => update('principal', value)}
							/>
							<FormInput
								label={tr(props.locale, 'Validity', '有效期')}
								value={props.form.validity}
								onChange={(value) => update('validity', value)}
							/>
							<div className="grid gap-2">
								<SwitchField
									label={tr(props.locale, 'Visible in catalog', '在目录中可见')}
									checked={props.form.visible}
									onChange={(value) => update('visible', value)}
								/>
								<SwitchField
									label={tr(props.locale, 'Available to Agentic Apps', '可用于 Agentic Apps')}
									checked={props.form.isApplication}
									onChange={(value) => update('isApplication', value)}
								/>
							</div>
						</TabsContent>
					</div>
				</Tabs>

				<DialogFooter>
					<Button variant="outline" onClick={() => props.onOpenChange(false)}>
						{tr(props.locale, 'Cancel', '取消')}
					</Button>
					<Button
						disabled={
							props.busy ||
							!props.form.code.trim() ||
							!props.form.name.trim() ||
							!props.form.modelId ||
							!props.form.cube ||
							(props.form.type === 'BASIC' && !props.form.measure)
						}
						onClick={props.onSubmit}
					>
						{props.busy
							? tr(props.locale, 'Saving…', '保存中…')
							: props.mode === 'create'
								? tr(props.locale, 'Create draft', '创建草稿')
								: tr(props.locale, 'Save changes', '保存变更')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function FormInput(props: { label: string; value: string; required?: boolean; onChange(value: string): void }) {
	const id = React.useId()
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{props.label}</Label>
			<Input
				id={id}
				required={props.required}
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

function FormTextarea(props: { label: string; value: string; className?: string; onChange(value: string): void }) {
	const id = React.useId()
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{props.label}</Label>
			<Textarea
				id={id}
				className={props.className}
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value)}
			/>
		</div>
	)
}

function FormSelect(props: {
	label: string
	value: string
	options: Option[]
	placeholder?: string
	onChange(value: string): void
}) {
	return (
		<div className="grid gap-1.5">
			<Label>{props.label}</Label>
			<Select value={props.value} onValueChange={props.onChange}>
				<SelectTrigger>
					<SelectValue placeholder={props.placeholder} />
				</SelectTrigger>
				<SelectContent>
					{props.options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

function SwitchField(props: { label: string; checked: boolean; onChange(value: boolean): void }) {
	return (
		<div className="flex min-h-10 items-center justify-between rounded-md border px-3">
			<Label>{props.label}</Label>
			<Switch checked={props.checked} onCheckedChange={props.onChange} />
		</div>
	)
}
