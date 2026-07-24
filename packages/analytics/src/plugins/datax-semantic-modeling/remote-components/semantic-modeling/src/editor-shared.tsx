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
	SelectValue,
	Switch,
	Textarea
} from '@xpert-ai/shadcn-ui'
import { JsonObject } from '../../../../remote-components/shared/runtime'
import { localized, setObjectValue } from './schema-utils'

export function SectionHeading(props: { title: string; description: string; action?: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
				<p className="mt-1 max-w-3xl text-sm text-muted-foreground">{props.description}</p>
			</div>
			{props.action}
		</div>
	)
}

export function EmptyCollection(props: { title: string; description: string; action: React.ReactNode }) {
	return (
		<div className="grid min-h-44 place-items-center rounded-lg border border-dashed bg-muted/20 p-8 text-center">
			<div>
				<div className="font-medium">{props.title}</div>
				<div className="mt-1 text-sm text-muted-foreground">{props.description}</div>
				<div className="mt-4">{props.action}</div>
			</div>
		</div>
	)
}

export function ObjectTextField(props: {
	item: JsonObject
	field: string
	label: string
	placeholder?: string
	multiline?: boolean
	onChange(item: JsonObject): void
}) {
	const rawValue = props.item[props.field]
	const value = typeof rawValue === 'string' ? rawValue : ''
	const id = React.useId()
	const handleChange = (nextValue: string) => props.onChange(setObjectValue(props.item, props.field, nextValue))
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{props.label}</Label>
			{props.multiline ? (
				<Textarea
					className="min-h-20"
					id={id}
					placeholder={props.placeholder}
					value={value}
					onChange={(event) => handleChange(event.currentTarget.value)}
				/>
			) : (
				<Input
					id={id}
					placeholder={props.placeholder}
					value={value}
					onChange={(event) => handleChange(event.currentTarget.value)}
				/>
			)}
		</div>
	)
}

export function ObjectSelectField(props: {
	item: JsonObject
	field: string
	label: string
	options: Array<{ value: string; label: string }>
	placeholder?: string
	onChange(item: JsonObject): void
}) {
	const rawValue = props.item[props.field]
	const value = typeof rawValue === 'string' ? rawValue : ''
	return (
		<div className="grid gap-1.5">
			<Label>{props.label}</Label>
			<Select
				value={value}
				onValueChange={(nextValue) => props.onChange(setObjectValue(props.item, props.field, nextValue))}
			>
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

export function ObjectSwitchField(props: {
	item: JsonObject
	field: string
	label: string
	defaultValue?: boolean
	onChange(item: JsonObject): void
}) {
	const rawValue = props.item[props.field]
	const value = typeof rawValue === 'boolean' ? rawValue : (props.defaultValue ?? false)
	return (
		<div className="flex min-h-9 items-center justify-between gap-3 rounded-md border px-3">
			<Label>{props.label}</Label>
			<Switch
				checked={value}
				onCheckedChange={(checked) => props.onChange(setObjectValue(props.item, props.field, checked))}
			/>
		</div>
	)
}

export function DeleteButton(props: { locale?: string; itemName: string; onDelete(): void; size?: 'default' | 'sm' }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size={props.size ?? 'sm'} className="text-destructive hover:text-destructive">
					{localized(props.locale, 'Delete', '删除')}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{localized(props.locale, 'Delete this artifact?', '删除此对象？')}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{localized(
							props.locale,
							`This removes '${props.itemName}' from the local draft. Save the draft to persist the change.`,
							`这会从本地草稿中移除“${props.itemName}”。保存草稿后变更才会持久化。`
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{localized(props.locale, 'Cancel', '取消')}</AlertDialogCancel>
					<AlertDialogAction onClick={props.onDelete}>
						{localized(props.locale, 'Delete', '删除')}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
