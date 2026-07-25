import * as React from 'react'
import { ChevronRight, CircleAlert, CheckCircle2 } from 'lucide-react'
import { JsonObject, readString } from '../../../../remote-components/shared/runtime'
import { CubeWorkbenchI18n } from './cube-workbench-i18n'
import { MeasureRow, rowValidationMessage } from './cube-workbench-model'
import { StudioIssue } from './schema-utils'

export function ValidationStep(props: {
	cube: JsonObject
	rows: MeasureRow[]
	issues: StudioIssue[]
	i18n: CubeWorkbenchI18n
}) {
	const cubeName = readString(props.cube, 'name') ?? ''
	const cubeIssues = props.issues.filter((issue) => issue.location.includes(`cubes.${cubeName}`))
	const rowIssues = props.rows.filter((row) => !row.valid)
	const empty = !cubeIssues.length && !rowIssues.length
	return (
		<ValidationCard title={props.i18n.t('validation')} description={props.i18n.t('validationDescription')}>
			<div className="divide-y">
				{empty ? (
					<div className="flex items-center gap-3 p-5 text-sm text-success">
						<CheckCircle2 className="size-5" aria-hidden="true" />
						{props.i18n.t('validationPassed')}
					</div>
				) : null}
				{rowIssues.map((row) => (
					<ValidationRow key={row.id} name={row.name} detail={rowValidationMessage(row, props.i18n)} />
				))}
				{cubeIssues.map((issue, index) => (
					<ValidationRow key={`${issue.location}:${index}`} name={issue.location} detail={issue.message} />
				))}
			</div>
		</ValidationCard>
	)
}

export function MeasureValidationStrip(props: {
	rows: MeasureRow[]
	validCount: number
	warningCount: number
	i18n: CubeWorkbenchI18n
	onOpen(): void
	onFix(row: MeasureRow): void
}) {
	const firstInvalid = props.rows.find((row) => !row.valid)
	return (
		<div className="mt-3 rounded-lg border bg-card">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
				onClick={props.onOpen}
			>
				<span className="font-semibold">{props.i18n.t('validation')}</span>
				<span className="text-muted-foreground">
					· {props.rows.length} {props.i18n.t('measures')} · {props.validCount} {props.i18n.t('valid')} ·{' '}
					{props.warningCount} {props.i18n.t('warning')}
				</span>
				<span className="flex-1" />
				<span className="text-muted-foreground">{props.i18n.t('all')}</span>
				<ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
			</button>
			{firstInvalid ? (
				<button
					type="button"
					className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-md border px-3 py-2.5 text-left text-xs hover:bg-muted/35"
					onClick={() => props.onFix(firstInvalid)}
				>
					<CircleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
					<span className="font-medium">{firstInvalid.name}</span>
					<span className="truncate text-muted-foreground">
						{rowValidationMessage(firstInvalid, props.i18n)}
					</span>
					<span className="flex-1" />
					<ChevronRight className="size-3.5 text-primary" aria-hidden="true" />
				</button>
			) : (
				<div className="mx-3 mb-3 flex items-center gap-2 rounded-md bg-success/5 px-3 py-2 text-xs text-success">
					<CheckCircle2 className="size-4" aria-hidden="true" />
					{props.i18n.t('validationPassed')}
				</div>
			)}
		</div>
	)
}

function ValidationCard(props: { title: string; description: string; children: React.ReactNode }) {
	return (
		<section className="overflow-hidden rounded-lg border bg-card shadow-xs">
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-semibold">{props.title}</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p>
			</div>
			{props.children}
		</section>
	)
}

function ValidationRow(props: { name: string; detail: string }) {
	return (
		<div className="flex items-start gap-3 p-4">
			<CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
			<div className="min-w-0">
				<div className="text-sm font-medium">{props.name}</div>
				<div className="mt-0.5 text-xs text-muted-foreground">{props.detail}</div>
			</div>
		</div>
	)
}
