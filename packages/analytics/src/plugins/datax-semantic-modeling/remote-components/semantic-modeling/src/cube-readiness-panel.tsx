import { Badge, Popover, PopoverContent, PopoverTrigger, Progress, Separator } from '@xpert-ai/shadcn-ui'
import { CheckCircle2, ChevronDown, TriangleAlert } from 'lucide-react'
import { JsonObject } from '../../../../remote-components/shared/runtime'
import { CubeWorkbenchI18n } from './cube-workbench-i18n'
import { measureRows } from './cube-workbench-model'
import { objectCollection, StudioIssue } from './schema-utils'

export function CubeReadinessPopover(props: {
	schema: JsonObject
	issues: StudioIssue[]
	readiness: number
	i18n: CubeWorkbenchI18n
}) {
	const dimensions = objectCollection(props.schema, 'dimensions').length
	const cubes = objectCollection(props.schema, 'cubes')
	const measures = cubes.reduce((count, cube) => count + measureRows(cube).length, 0)
	const virtualCubes = objectCollection(props.schema, 'virtualCubes').length
	const hasErrors = props.issues.some((issue) => issue.level === 'error')
	const ready = props.readiness === 100 && !hasErrors
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="group flex min-w-[118px] items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[560px]:hidden"
					aria-label={`${props.i18n.t('openReadinessDetails')}: ${props.readiness}/100`}
				>
					<div className="min-w-0 flex-1">
						<div className="text-[10px] text-muted-foreground">{props.i18n.t('readiness')}</div>
						<div className="mt-1 flex items-center gap-2">
							<Progress className="h-1.5 w-12" value={props.readiness} />
							<span
								className={
									ready ? 'text-xs font-medium text-success' : 'text-xs font-medium text-warning'
								}
							>
								{props.readiness}
							</span>
							<span className="text-[10px] text-muted-foreground">/ 100</span>
						</div>
					</div>
					<ChevronDown
						className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
						aria-hidden="true"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="w-[300px] overflow-hidden p-0"
				aria-label={props.i18n.t('readinessDetails')}
			>
				<div className="bg-muted/25 p-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="text-xs font-medium text-muted-foreground">
								{props.i18n.t('readinessDetails')}
							</div>
							<div className="mt-1 text-sm font-semibold">{props.i18n.t('cubeSummary')}</div>
						</div>
						<div className="text-right">
							<span className="text-2xl font-semibold">{props.readiness}</span>
							<span className="ml-1 text-xs text-muted-foreground">/ 100</span>
						</div>
					</div>
					<Progress className="mt-3 h-1.5" value={props.readiness} />
				</div>
				<Separator />
				<div className="space-y-4 p-4">
					<div>
						<div className="space-y-2 text-sm">
							<SnapshotRow label={props.i18n.t('dimension')} value={dimensions} />
							<SnapshotRow label={props.i18n.t('cube')} value={cubes.length} />
							<SnapshotRow label={props.i18n.t('virtualCube')} value={virtualCubes} />
							<SnapshotRow label={props.i18n.t('measure')} value={measures} />
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">{props.i18n.t('status')}</span>
								<Badge
									variant="outline"
									className={ready ? 'text-[10px] text-success' : 'text-[10px] text-warning'}
								>
									{ready ? props.i18n.t('ready') : props.i18n.t('needsAttention')}
								</Badge>
							</div>
						</div>
					</div>
					<Separator />
					<div className="flex gap-2.5">
						{ready ? (
							<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
						) : (
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
						)}
						<div>
							<div className="text-xs font-medium">{props.i18n.t('stepValidation')}</div>
							<div className="mt-1 text-xs leading-5 text-muted-foreground">
								{ready ? props.i18n.t('validationPassed') : props.i18n.t('validationDescription')}
							</div>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

function SnapshotRow(props: { label: string; value: number }) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-muted-foreground">{props.label}</span>
			<span className="font-medium">{props.value}</span>
		</div>
	)
}
