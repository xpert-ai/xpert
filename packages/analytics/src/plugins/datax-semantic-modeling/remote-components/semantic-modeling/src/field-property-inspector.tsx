import * as React from 'react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Input,
	Label,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	Textarea
} from '@xpert-ai/shadcn-ui'
import { JsonObject, JsonValue, readString } from '../../../../remote-components/shared/runtime'
import { StudioField } from './er-diagram-model'
import { RelationshipI18n } from './relationship-i18n'

export function FieldPropertyInspector(props: {
	field: StudioField
	value: JsonObject
	sourceTables: string[]
	i18n: RelationshipI18n
	onUpdate(key: string, value: JsonValue | undefined): void
}) {
	const isLevel = props.field.kind === 'level'
	const sourceTable = readString(props.value, 'table') ?? ''
	return (
		<ScrollArea className="h-full" data-testid="field-schema-inspector">
			<div className="border-b p-4">
				<div className="flex items-center gap-3">
					<span className="grid size-9 place-items-center rounded-lg border bg-primary/10 font-mono text-sm font-semibold text-primary">
						{isLevel ? 'L' : '∑'}
					</span>
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold">{props.field.name}</div>
						<div className="text-xs text-muted-foreground">
							{isLevel ? props.i18n.t('level') : props.i18n.t('measure')}
						</div>
					</div>
				</div>
			</div>
			<Accordion type="multiple" defaultValue={['basic', 'source', 'semantic']} className="px-4">
				<AccordionItem value="basic">
					<AccordionTrigger className="text-xs">{props.i18n.t('fieldProperties')}</AccordionTrigger>
					<AccordionContent className="space-y-3">
						<InspectorField label={props.i18n.t('name')}>
							<Input
								data-testid="field-schema-name"
								aria-label={props.i18n.t('name')}
								value={readString(props.value, 'name') ?? ''}
								onChange={(event) => props.onUpdate('name', event.currentTarget.value)}
							/>
						</InspectorField>
						<InspectorField label={props.i18n.t('caption')}>
							<Input
								data-testid="field-schema-caption"
								aria-label={props.i18n.t('caption')}
								value={readString(props.value, 'caption') ?? ''}
								onChange={(event) => props.onUpdate('caption', event.currentTarget.value)}
							/>
						</InspectorField>
						<InspectorField label={props.i18n.t('description')}>
							<Textarea
								data-testid="field-schema-description"
								aria-label={props.i18n.t('description')}
								className="min-h-20 text-xs"
								value={readString(props.value, 'description') ?? ''}
								onChange={(event) => props.onUpdate('description', event.currentTarget.value)}
							/>
						</InspectorField>
						<div className="grid grid-cols-2 gap-2">
							<InspectorSwitch
								label={props.i18n.t('visible')}
								checked={props.value['visible'] !== false}
								onCheckedChange={(checked) => props.onUpdate('visible', checked)}
							/>
							<InspectorSwitch
								label={props.i18n.t('hiddenForAgent')}
								checked={props.value['hidden'] === true}
								onCheckedChange={(checked) => props.onUpdate('hidden', checked)}
							/>
						</div>
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="source">
					<AccordionTrigger className="text-xs">{props.i18n.t('sourceMapping')}</AccordionTrigger>
					<AccordionContent className="space-y-3">
						{isLevel ? (
							<InspectorField label={props.i18n.t('table')}>
								<Select
									value={sourceTable || undefined}
									onValueChange={(value) => props.onUpdate('table', value)}
								>
									<SelectTrigger aria-label={props.i18n.t('table')}>
										<SelectValue placeholder={props.i18n.t('table')} />
									</SelectTrigger>
									<SelectContent>
										{uniqueValues([sourceTable, ...props.sourceTables]).map((table) => (
											<SelectItem key={table} value={table}>
												{table}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</InspectorField>
						) : null}
						<InspectorField label={isLevel ? props.i18n.t('keyColumn') : props.i18n.t('column')}>
							<Input
								data-testid="field-schema-column"
								aria-label={isLevel ? props.i18n.t('keyColumn') : props.i18n.t('column')}
								value={readString(props.value, 'column') ?? ''}
								onChange={(event) => props.onUpdate('column', event.currentTarget.value)}
							/>
						</InspectorField>
						{isLevel ? (
							<>
								<InspectorField label={props.i18n.t('nameColumn')}>
									<Input
										aria-label={props.i18n.t('nameColumn')}
										value={readString(props.value, 'nameColumn') ?? ''}
										onChange={(event) => props.onUpdate('nameColumn', event.currentTarget.value)}
									/>
								</InspectorField>
								<InspectorField label={props.i18n.t('captionColumn')}>
									<Input
										aria-label={props.i18n.t('captionColumn')}
										value={readString(props.value, 'captionColumn') ?? ''}
										onChange={(event) => props.onUpdate('captionColumn', event.currentTarget.value)}
									/>
								</InspectorField>
								<InspectorField label={props.i18n.t('ordinalColumn')}>
									<Input
										aria-label={props.i18n.t('ordinalColumn')}
										value={readString(props.value, 'ordinalColumn') ?? ''}
										onChange={(event) => props.onUpdate('ordinalColumn', event.currentTarget.value)}
									/>
								</InspectorField>
								<InspectorField label={props.i18n.t('parentColumn')}>
									<Input
										aria-label={props.i18n.t('parentColumn')}
										value={readString(props.value, 'parentColumn') ?? ''}
										onChange={(event) => props.onUpdate('parentColumn', event.currentTarget.value)}
									/>
								</InspectorField>
								{readString(props.value, 'parentColumn') ? (
									<InspectorField label={props.i18n.t('nullParentValue')}>
										<Input
											aria-label={props.i18n.t('nullParentValue')}
											value={readString(props.value, 'nullParentValue') ?? ''}
											onChange={(event) =>
												props.onUpdate('nullParentValue', event.currentTarget.value)
											}
										/>
									</InspectorField>
								) : null}
							</>
						) : null}
						<InspectorField label={props.i18n.t('dataType')}>
							<Select
								value={readString(props.value, isLevel ? 'type' : 'datatype') || undefined}
								onValueChange={(value) => props.onUpdate(isLevel ? 'type' : 'datatype', value)}
							>
								<SelectTrigger aria-label={props.i18n.t('dataType')}>
									<SelectValue placeholder={props.i18n.t('dataType')} />
								</SelectTrigger>
								<SelectContent>
									{(isLevel
										? ['String', 'Integer', 'Numeric', 'Boolean', 'Date', 'Time', 'Timestamp']
										: ['String', 'Integer', 'Numeric']
									).map((type) => (
										<SelectItem key={type} value={type}>
											{type}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</InspectorField>
						{isLevel ? (
							<>
								<InspectorField label={props.i18n.t('levelType')}>
									<Select
										value={readString(props.value, 'levelType') || 'Regular'}
										onValueChange={(value) =>
											props.onUpdate('levelType', value === 'Regular' ? undefined : value)
										}
									>
										<SelectTrigger aria-label={props.i18n.t('levelType')}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{[
												['Regular', props.i18n.t('regular')],
												['TimeYears', props.i18n.t('timeYear')],
												['TimeQuarters', props.i18n.t('timeQuarter')],
												['TimeMonths', props.i18n.t('timeMonth')],
												['TimeWeeks', props.i18n.t('timeWeek')],
												['TimeDays', props.i18n.t('timeDay')]
											].map(([value, label]) => (
												<SelectItem key={value} value={value}>
													{label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</InspectorField>
								<InspectorSwitch
									label={props.i18n.t('uniqueMembers')}
									checked={props.value['uniqueMembers'] === true}
									onCheckedChange={(checked) => props.onUpdate('uniqueMembers', checked)}
								/>
							</>
						) : (
							<>
								<InspectorField label={props.i18n.t('aggregator')}>
									<Select
										value={readString(props.value, 'aggregator') || 'sum'}
										onValueChange={(value) => props.onUpdate('aggregator', value)}
									>
										<SelectTrigger aria-label={props.i18n.t('aggregator')}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{['sum', 'count', 'min', 'max', 'avg', 'distinct-count'].map(
												(aggregator) => (
													<SelectItem key={aggregator} value={aggregator}>
														{aggregator}
													</SelectItem>
												)
											)}
										</SelectContent>
									</Select>
								</InspectorField>
								<InspectorField label={props.i18n.t('formatString')}>
									<Input
										data-testid="field-schema-format"
										aria-label={props.i18n.t('formatString')}
										value={readString(props.value, 'formatString') ?? ''}
										onChange={(event) => props.onUpdate('formatString', event.currentTarget.value)}
									/>
								</InspectorField>
							</>
						)}
					</AccordionContent>
				</AccordionItem>
				{isLevel ? (
					<AccordionItem value="semantic">
						<AccordionTrigger className="text-xs">{props.i18n.t('semantic')}</AccordionTrigger>
						<AccordionContent className="space-y-3">
							<InspectorField label={props.i18n.t('semantic')}>
								<Select
									value={readString(props.value, 'semantic') || 'none'}
									onValueChange={(value) =>
										props.onUpdate('semantic', value === 'none' ? undefined : value)
									}
								>
									<SelectTrigger aria-label={props.i18n.t('semantic')}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{[
											'none',
											'Calendar',
											'Calendar.Year',
											'Calendar.Quarter',
											'Calendar.Month',
											'Calendar.Week',
											'Calendar.Day'
										].map((semantic) => (
											<SelectItem key={semantic} value={semantic}>
												{semantic}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</InspectorField>
							<InspectorField label={props.i18n.t('formatter')}>
								<Input
									aria-label={props.i18n.t('formatter')}
									value={readString(props.value, 'formatter') ?? ''}
									onChange={(event) => props.onUpdate('formatter', event.currentTarget.value)}
								/>
							</InspectorField>
						</AccordionContent>
					</AccordionItem>
				) : null}
			</Accordion>
		</ScrollArea>
	)
}

function InspectorSwitch(props: { label: string; checked: boolean; onCheckedChange(checked: boolean): void }) {
	return (
		<label className="flex min-h-9 items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
			<span>{props.label}</span>
			<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
		</label>
	)
}

function InspectorField(props: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-1.5">
			<Label className="text-xs text-muted-foreground">{props.label}</Label>
			{props.children}
		</div>
	)
}

function uniqueValues(values: string[]) {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
