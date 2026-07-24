import {
	Activity,
	BadgeCheck,
	Blocks,
	Box,
	Boxes,
	ChartNoAxesCombined,
	Database,
	FileJson,
	LayoutDashboard,
	PanelLeftClose,
	PanelLeftOpen,
	Settings2,
	ShieldCheck,
	Sigma,
	TableProperties,
	UsersRound,
	Workflow,
	type LucideIcon
} from 'lucide-react'
import { Button, cn, ScrollArea, Tooltip, TooltipContent, TooltipTrigger } from '@xpert-ai/shadcn-ui'
import { Section } from './studio-types'

export type StudioNavigationGroup = {
	label: string
	items: Array<{
		key: Section
		label: string
		count?: number
	}>
}

const sectionIcons: Record<Section, LucideIcon> = {
	relationships: Workflow,
	overview: LayoutDashboard,
	sources: Database,
	dimensions: Box,
	cubes: Blocks,
	virtualCubes: Boxes,
	calculations: Sigma,
	queryLab: ChartNoAxesCombined,
	members: UsersRound,
	quality: BadgeCheck,
	security: ShieldCheck,
	operations: Activity,
	settings: Settings2,
	validation: BadgeCheck,
	dimensionEditor: TableProperties,
	cubeEditor: Blocks,
	virtualCubeEditor: Boxes,
	json: FileJson
}

export function StudioSectionIcon(props: { section: Section; className?: string }) {
	const Icon = sectionIcons[props.section]
	return <Icon aria-hidden="true" className={cn('size-4 shrink-0', props.className)} />
}

export function StudioNavigation(props: {
	activeSection: Section
	collapsed: boolean
	collapseLabel: string
	expandLabel: string
	groups: StudioNavigationGroup[]
	modelKey: string
	modelName: string
	onNavigate(section: Section): void
	onToggle(): void
}) {
	const toggleLabel = props.collapsed ? props.expandLabel : props.collapseLabel

	return (
		<aside className="flex h-full min-h-0 min-w-0 flex-col bg-card/70">
			<div
				className={cn(
					'flex h-[58px] shrink-0 items-center border-b',
					props.collapsed ? 'justify-center px-2' : 'gap-2 px-3'
				)}
			>
				{props.collapsed ? null : (
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-semibold">{props.modelName}</div>
						<div className="truncate font-mono text-[10px] text-muted-foreground">{props.modelKey}</div>
					</div>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label={toggleLabel} onClick={props.onToggle}>
							{props.collapsed ? (
								<PanelLeftOpen aria-hidden="true" />
							) : (
								<PanelLeftClose aria-hidden="true" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">{toggleLabel}</TooltipContent>
				</Tooltip>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<nav className={cn('py-2', props.collapsed ? 'px-2' : 'px-2.5')}>
					{props.groups.map((group, groupIndex) => (
						<div
							key={group.label}
							className={cn(groupIndex > 0 && (props.collapsed ? 'mt-2 border-t pt-2' : 'mt-4'))}
						>
							{props.collapsed ? null : (
								<div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
									{group.label}
								</div>
							)}
							<div className="space-y-0.5">
								{group.items.map((item) => (
									<StudioNavigationButton
										key={item.key}
										active={props.activeSection === item.key}
										collapsed={props.collapsed}
										count={item.count}
										item={item}
										onClick={() => props.onNavigate(item.key)}
									/>
								))}
							</div>
						</div>
					))}
				</nav>
			</ScrollArea>
		</aside>
	)
}

function StudioNavigationButton(props: {
	active: boolean
	collapsed: boolean
	count?: number
	item: StudioNavigationGroup['items'][number]
	onClick(): void
}) {
	const button = (
		<Button
			variant="ghost"
			size={props.collapsed ? 'icon-sm' : 'sm'}
			className={cn(
				'transition-colors',
				props.collapsed ? 'mx-auto flex' : 'w-full justify-start px-2',
				props.active &&
					'bg-accent text-accent-foreground shadow-xs hover:bg-accent hover:text-accent-foreground'
			)}
			aria-current={props.active ? 'page' : undefined}
			aria-label={props.item.label}
			onClick={props.onClick}
		>
			<StudioSectionIcon
				section={props.item.key}
				className={props.active ? 'text-accent-foreground' : 'text-muted-foreground'}
			/>
			{props.collapsed ? null : (
				<>
					<span className="min-w-0 flex-1 truncate text-left">{props.item.label}</span>
					{typeof props.count === 'number' ? (
						<span
							className={cn(
								'text-[10px] font-normal tabular-nums text-muted-foreground',
								props.item.key === 'quality' && props.count > 0 && 'text-destructive'
							)}
						>
							{props.count}
						</span>
					) : null}
				</>
			)}
		</Button>
	)

	if (!props.collapsed) {
		return button
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent side="right">
				<div className="flex items-center gap-3">
					<span>{props.item.label}</span>
					{typeof props.count === 'number' ? (
						<span className="text-muted-foreground">{props.count}</span>
					) : null}
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
