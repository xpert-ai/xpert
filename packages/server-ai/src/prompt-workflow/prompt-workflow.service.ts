import {
	IPromptWorkflow,
	PromptWorkflowSourceType,
	PromptWorkflowVisibility,
	TPromptWorkflow,
	TPromptWorkflowCommandSnapshot,
	TXpertCommandProfile,
	TXpertCommandProfileEntry,
	IXpert
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { XpertWorkspaceAccessService, XpertWorkspaceBaseService } from '../xpert-workspace'
import { Xpert } from '../xpert/xpert.entity'
import { PromptWorkflow } from './prompt-workflow.entity'

const PROMPT_WORKFLOW_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const PROMPT_WORKFLOW_VISIBILITIES = new Set<PromptWorkflowVisibility>(['private', 'team', 'tenant'])
const COMMAND_PROFILE_SOURCES = new Set<PromptWorkflowSourceType>(['xpert', 'workspace_prompt_workflow', 'skill'])

export type RuntimePromptWorkflowCommandSource = TPromptWorkflowCommandSnapshot & {
	sourceType: 'xpert' | 'workspace_prompt_workflow'
	order?: number
	xpertId?: string
}

export type RuntimeCommandProfileResolution = {
	hasProfile: boolean
	xpertCommands: RuntimePromptWorkflowCommandSource[]
	workspaceCommands: RuntimePromptWorkflowCommandSource[]
	preferredSkillEntries: TXpertCommandProfileEntry[]
	skillEntries: TXpertCommandProfileEntry[]
}

type NormalizedPromptWorkflowInput = Omit<TPromptWorkflow, 'icon' | 'archivedAt'> & {
	icon?: PromptWorkflow['icon']
	archivedAt?: Date | null
}

export type PromptWorkflowKeyMutationResult = {
	operation: 'created' | 'updated' | 'deleted'
	workflow: PromptWorkflow
}

export type PromptWorkflowDefaultsInitializationResult = {
	created: PromptWorkflow[]
	skipped: string[]
}

@Injectable()
export class PromptWorkflowService extends XpertWorkspaceBaseService<PromptWorkflow> {
	constructor(
		@InjectRepository(PromptWorkflow)
		repository: Repository<PromptWorkflow>,
		workspaceAccessService: XpertWorkspaceAccessService,
		@InjectRepository(Xpert)
		private readonly xpertRepository: Repository<Xpert>
	) {
		super(repository, workspaceAccessService)
	}

	async createInWorkspace(workspaceId: string, input: Partial<TPromptWorkflow>) {
		const workflow = this.normalizePromptWorkflowInput(input)
		return this.create({
			...workflow,
			workspaceId
		})
	}

	async initializeDefaultsInWorkspace(
		workspaceId: string,
		inputs: TPromptWorkflow[]
	): Promise<PromptWorkflowDefaultsInitializationResult> {
		if (!inputs.length) {
			return { created: [], skipped: [] }
		}

		const { workspace } = await this.assertWorkspaceWriteAccess(workspaceId)
		const workflows = inputs.map((input) => this.normalizePromptWorkflowInput(input))
		const names = workflows.map(({ name }) => name)
		if (new Set(names).size !== names.length) {
			throw new BadRequestException('Template prompt workflow names must be unique')
		}
		const userId = RequestContext.currentUserId()

		return this.repository.manager.transaction(async (manager) => {
			const repository = manager.getRepository(PromptWorkflow)
			const existing = await repository.find({
				where: {
					workspaceId: workspace.id,
					name: In(names)
				} as FindOptionsWhere<PromptWorkflow>
			})
			const existingNames = new Set(existing.map(({ name }) => name))
			const missing = workflows.filter(({ name }) => !existingNames.has(name))
			const entities = missing.map((workflow) =>
				repository.create({
					...workflow,
					workspaceId: workspace.id,
					tenantId: workspace.tenantId,
					organizationId: workspace.organizationId ?? null,
					...(userId ? { createdById: userId, updatedById: userId } : {})
				})
			)
			const created = entities.length ? await repository.save(entities) : []

			return {
				created,
				skipped: names.filter((name) => existingNames.has(name))
			}
		})
	}

	async upsertInWorkspaceByKey(
		workspaceId: string,
		key: string,
		input: Partial<Omit<TPromptWorkflow, 'name'>>
	): Promise<PromptWorkflowKeyMutationResult> {
		await this.assertWorkspaceWriteAccess(workspaceId)
		const name = this.normalizeWorkflowKey(key)
		const current = await this.findWorkspaceWorkflowByKey(workspaceId, name)

		if (!current) {
			return {
				operation: 'created',
				workflow: await this.createInWorkspace(workspaceId, {
					...input,
					name,
					archivedAt: null
				})
			}
		}

		return {
			operation: 'updated',
			workflow: await this.updateInWorkspace(workspaceId, current.id, {
				...input,
				name,
				archivedAt: null
			})
		}
	}

	async updateInWorkspace(workspaceId: string, id: string, input: Partial<TPromptWorkflow>) {
		const current = await this.findOne(id)
		if (current.workspaceId !== workspaceId) {
			throw new NotFoundException(`The requested prompt workflow was not found`)
		}

		const workflow = this.normalizePromptWorkflowInput(
			{
				...current,
				...input
			},
		)
		Object.assign(current, workflow)
		return this.save(current)
	}

	async archiveInWorkspace(workspaceId: string, id: string) {
		const current = await this.findOne(id)
		if (current.workspaceId !== workspaceId) {
			throw new NotFoundException(`The requested prompt workflow was not found`)
		}

		current.archivedAt = new Date()
		return this.save(current)
	}

	async archiveInWorkspaceByKey(workspaceId: string, key: string): Promise<PromptWorkflowKeyMutationResult> {
		await this.assertWorkspaceWriteAccess(workspaceId)
		const name = this.normalizeWorkflowKey(key)
		const current = await this.findWorkspaceWorkflowByKey(workspaceId, name)
		if (!current) {
			throw new NotFoundException(`The requested prompt workflow was not found`)
		}

		return {
			operation: 'deleted',
			workflow: await this.archiveInWorkspace(workspaceId, current.id)
		}
	}

	async duplicateInWorkspace(workspaceId: string, id: string) {
		const current = await this.findOne(id)
		if (current.workspaceId !== workspaceId) {
			throw new NotFoundException(`The requested prompt workflow was not found`)
		}

		const name = await this.createCopyName(workspaceId, current.name)
		return this.createInWorkspace(workspaceId, {
			...this.toSnapshot(current),
			name,
			label: current.label ? `${current.label} Copy` : `${current.name} Copy`,
			archivedAt: null
		})
	}

	async getUsage(workspaceId: string, id: string) {
		await this.assertWorkspaceReadAccess(workspaceId)
		const { items } = await this.findAll({
			where: {
				id,
				workspaceId
			} as FindOptionsWhere<PromptWorkflow>
		})
		if (!items.length) {
			throw new NotFoundException(`The requested prompt workflow was not found`)
		}

		const xperts = await this.xpertRepository.find({
			where: {
				workspaceId,
				deletedAt: IsNull()
			}
		})
		return xperts
			.filter((xpert) => {
				const profiles = [xpert.commandProfile, xpert.draft?.team?.commandProfile]
				return profiles.some((profile) =>
					normalizeCommandProfile(profile).commands.some(
						(entry) => entry.source === 'workspace_prompt_workflow' && entry.workflowId === id
					)
				)
			})
			.map((xpert) => ({
				id: xpert.id,
				name: xpert.name,
				title: xpert.title,
				version: xpert.version,
				latest: xpert.latest,
				publishAt: xpert.publishAt
			}))
	}

	async validateCommandProfile(workspaceId: string | null | undefined, profile: TXpertCommandProfile | null | undefined) {
		const normalized = normalizeCommandProfile(profile)
		if (!normalized.enabled || !normalized.commands.length) {
			return normalized
		}

		const workflowIds = normalized.commands
			.filter((entry) => entry.enabled !== false && entry.source === 'workspace_prompt_workflow' && !entry.snapshot)
			.map((entry) => normalizeOptionalString(entry.workflowId))
			.filter((id): id is string => !!id)

		if (workflowIds.length && !workspaceId) {
			throw new BadRequestException('workspaceId is required for workspace prompt workflow commands')
		}

		if (workflowIds.length && workspaceId) {
			await this.findActiveWorkflowMap(workspaceId, workflowIds)
		}

		for (const entry of normalized.commands) {
			if (entry.enabled === false) {
				continue
			}
			if (entry.source === 'xpert') {
				this.normalizeLocalCommandEntry(entry)
			}
			if (entry.source === 'skill' && !normalizeOptionalString(entry.skillCommandName ?? entry.name)) {
				throw new BadRequestException('skill command profile entries require skillCommandName or name')
			}
		}

		return normalized
	}

	async snapshotCommandProfile(
		workspaceId: string | null | undefined,
		profile: TXpertCommandProfile | null | undefined
	): Promise<TXpertCommandProfile> {
		const normalized = await this.validateCommandProfile(workspaceId, profile)
		if (!normalized.enabled || !normalized.commands.length || !workspaceId) {
			return normalized
		}

		const workflowIds = normalized.commands
			.filter((entry) => entry.enabled !== false && entry.source === 'workspace_prompt_workflow' && !entry.snapshot)
			.map((entry) => normalizeOptionalString(entry.workflowId))
			.filter((id): id is string => !!id)
		const workflowMap = await this.findActiveWorkflowMap(workspaceId, workflowIds)

		return {
			version: 1,
			commands: normalized.commands.map((entry) => {
				if (entry.enabled === false || entry.source !== 'workspace_prompt_workflow') {
					return entry
				}
				const workflowId = normalizeOptionalString(entry.workflowId)
				const workflow = workflowId ? workflowMap.get(workflowId) : null
				if (!workflow) {
					return entry
				}
				return {
					...entry,
					snapshot: this.mergeWorkflowWithEntry(workflow, entry)
				}
			})
		}
	}

	async resolveRuntimeCommandProfile(xpert: Pick<IXpert, 'id' | 'workspaceId' | 'commandProfile'>) {
		const profile = normalizeCommandProfile(xpert.commandProfile)
		const hasProfile = profile.enabled === true
		const result: RuntimeCommandProfileResolution = {
			hasProfile,
			xpertCommands: [],
			workspaceCommands: [],
			preferredSkillEntries: [],
			skillEntries: []
		}
		if (!hasProfile) {
			result.workspaceCommands = xpert.workspaceId ? await this.findDefaultWorkspaceCommandSources(xpert.workspaceId) : []
			return result
		}
		if (!profile.commands.length) {
			return result
		}

		const workspaceEntries = profile.commands.filter(
			(entry) => entry.enabled !== false && entry.source === 'workspace_prompt_workflow'
		)
		const workflowIds = workspaceEntries
			.filter((entry) => !entry.snapshot)
			.map((entry) => normalizeOptionalString(entry.workflowId))
			.filter((id): id is string => !!id)
		const workflowMap = xpert.workspaceId ? await this.findActiveWorkflowMap(xpert.workspaceId, workflowIds) : new Map()

		for (const entry of sortCommandProfileEntries(profile.commands)) {
			if (entry.enabled === false) {
				continue
			}
			if (entry.source === 'xpert') {
				result.xpertCommands.push({
					...this.normalizeLocalCommandEntry(entry),
					sourceType: 'xpert',
					xpertId: xpert.id,
					order: entry.order
				})
				continue
			}
			if (entry.source === 'workspace_prompt_workflow') {
				const workflowId = normalizeOptionalString(entry.workflowId)
				const source = entry.snapshot ?? (workflowId ? workflowMap.get(workflowId) : null)
				if (!source) {
					continue
				}
				result.workspaceCommands.push({
					...this.mergeWorkflowWithEntry(source, entry),
					sourceType: 'workspace_prompt_workflow',
					order: entry.order
				})
				continue
			}
			if (entry.source === 'skill') {
				if (entry.priority === 'preferred') {
					result.preferredSkillEntries.push(entry)
					continue
				}
				result.skillEntries.push(entry)
			}
		}

		return result
	}

	private normalizePromptWorkflowInput(input: Partial<TPromptWorkflow>): NormalizedPromptWorkflowInput {
		const name = normalizeCommandName(input.name)
		const template = normalizeOptionalString(input.template)
		if (!name) {
			throw new BadRequestException('Prompt workflow command name is invalid')
		}
		if (!template) {
			throw new BadRequestException('Prompt workflow template is required')
		}

		const visibility = normalizeVisibility(input.visibility)
		return {
			name,
			template,
			label: normalizeOptionalString(input.label),
			description: normalizeOptionalString(input.description),
			icon: normalizeIcon(input.icon),
			category: normalizeOptionalString(input.category),
			aliases: normalizeStringArray(input.aliases),
			argsHint: normalizeOptionalString(input.argsHint),
			tags: normalizeStringArray(input.tags),
			visibility,
			runtimeCapabilities: input.runtimeCapabilities,
			archivedAt: normalizeArchivedAt(input.archivedAt)
		}
	}

	private normalizeWorkflowKey(key: string) {
		const name = normalizeCommandName(typeof key === 'string' ? key.replace(/^\/+/, '') : key)
		if (!name) {
			throw new BadRequestException('Prompt workflow key is invalid')
		}
		return name
	}

	private findWorkspaceWorkflowByKey(workspaceId: string, name: string) {
		return this.repository.findOne({
			where: {
				workspaceId,
				name,
				deletedAt: IsNull()
			} as FindOptionsWhere<PromptWorkflow>
		})
	}

	private normalizeLocalCommandEntry(entry: TXpertCommandProfileEntry): TPromptWorkflowCommandSnapshot {
		const name = normalizeCommandName(entry.name)
		const template = normalizeOptionalString(entry.template)
		if (!name) {
			throw new BadRequestException('Xpert-local command entries require a valid name')
		}
		if (!template) {
			throw new BadRequestException('Xpert-local command entries require a template')
		}

		return {
			name,
			template,
			label: normalizeOptionalString(entry.label),
			description: normalizeOptionalString(entry.description),
			icon: normalizeIcon(entry.icon),
			category: normalizeOptionalString(entry.category),
			aliases: normalizeStringArray(entry.aliases),
			argsHint: normalizeOptionalString(entry.argsHint),
			tags: [],
			visibility: 'private',
			runtimeCapabilities: entry.runtimeCapabilities,
			archivedAt: null
		}
	}

	private mergeWorkflowWithEntry(
		workflow: Pick<IPromptWorkflow, keyof TPromptWorkflow | 'id' | 'workspaceId'> | TPromptWorkflowCommandSnapshot,
		entry: TXpertCommandProfileEntry
	): TPromptWorkflowCommandSnapshot {
		return {
			workflowId: hasWorkflowEntityId(workflow) ? workflow.id : workflow.workflowId,
			workspaceId: workflow.workspaceId,
			name: normalizeCommandName(entry.name) ?? workflow.name,
			template: normalizeOptionalString(entry.template) ?? workflow.template,
			label: normalizeOptionalString(entry.label) ?? workflow.label,
			description: normalizeOptionalString(entry.description) ?? workflow.description,
			icon: normalizeIcon(entry.icon) ?? workflow.icon,
			category: normalizeOptionalString(entry.category) ?? workflow.category,
			aliases: mergeStringArrayOverride(entry.aliases, workflow.aliases),
			argsHint: normalizeOptionalString(entry.argsHint) ?? workflow.argsHint,
			tags: workflow.tags,
			visibility: workflow.visibility,
			runtimeCapabilities: entry.runtimeCapabilities ?? workflow.runtimeCapabilities,
			archivedAt: workflow.archivedAt ?? null
		}
	}

	private toSnapshot(workflow: IPromptWorkflow): TPromptWorkflowCommandSnapshot {
		return {
			workflowId: workflow.id,
			workspaceId: workflow.workspaceId,
			name: workflow.name,
			label: workflow.label,
			description: workflow.description,
			icon: workflow.icon,
			category: workflow.category,
			aliases: workflow.aliases,
			argsHint: workflow.argsHint,
			template: workflow.template,
			tags: workflow.tags,
			visibility: workflow.visibility,
			runtimeCapabilities: workflow.runtimeCapabilities,
			archivedAt: workflow.archivedAt ?? null
		}
	}

	private async findDefaultWorkspaceCommandSources(workspaceId: string): Promise<RuntimePromptWorkflowCommandSource[]> {
		const workflows = await this.repository.find({
			where: {
				workspaceId,
				archivedAt: IsNull(),
				deletedAt: IsNull()
			} as FindOptionsWhere<PromptWorkflow>,
			order: {
				name: 'ASC'
			}
		})

		return workflows.map((workflow, order) => ({
			...this.toSnapshot(workflow),
			sourceType: 'workspace_prompt_workflow',
			order
		}))
	}

	private async findActiveWorkflowMap(workspaceId: string, ids: string[]) {
		if (!ids.length) {
			return new Map<string, PromptWorkflow>()
		}

		await this.assertWorkspaceReadAccess(workspaceId)
		const workflows = await this.repository.find({
			where: ids.map((id) => ({
				id,
				workspaceId,
				archivedAt: IsNull(),
				deletedAt: IsNull()
			}))
		})
		const map = new Map(workflows.map((workflow) => [workflow.id, workflow]))
		const missing = ids.filter((id) => !map.has(id))
		if (missing.length) {
			throw new BadRequestException(`Prompt workflow commands are not available: ${missing.join(', ')}`)
		}
		return map
	}

	private async createCopyName(workspaceId: string, baseName: string) {
		for (let index = 1; index <= 100; index++) {
			const name = `${baseName}-copy${index === 1 ? '' : `-${index}`}`.slice(0, 64)
			const existing = await this.repository.findOne({
				where: {
					workspaceId,
					name,
					deletedAt: IsNull()
				}
			})
			if (!existing) {
				return name
			}
		}
		throw new BadRequestException('Unable to create a unique prompt workflow copy name')
	}
}

export function normalizeCommandProfile(profile: TXpertCommandProfile | null | undefined): TXpertCommandProfile {
	const record = asRecord(profile)
	if (!record) {
		return { version: 1, commands: [] }
	}
	const commands = Array.isArray(record.commands) ? record.commands : []
	const normalizedCommands = commands
		.map((entry) => normalizeCommandProfileEntry(entry))
		.filter((entry): entry is TXpertCommandProfileEntry => !!entry)
	const hasEnabledFlag = Object.prototype.hasOwnProperty.call(record, 'enabled')
	return {
		version: 1,
		enabled: hasEnabledFlag ? record.enabled === true : normalizedCommands.length > 0 ? true : undefined,
		commands: normalizedCommands
	}
}

export function sortCommandProfileEntries(entries: TXpertCommandProfileEntry[]) {
	return [...entries].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
}

function normalizeCommandProfileEntry(value: unknown): TXpertCommandProfileEntry | null {
	const record = asRecord(value)
	const source = typeof record?.source === 'string' ? record.source : ''
	if (!record || !COMMAND_PROFILE_SOURCES.has(source as PromptWorkflowSourceType)) {
		return null
	}

	return {
		id: normalizeOptionalString(record.id),
		source: source as PromptWorkflowSourceType,
		enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
		order: typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : undefined,
		priority: record.priority === 'preferred' ? 'preferred' : undefined,
		workflowId: normalizeOptionalString(record.workflowId),
		skillCommandName: normalizeOptionalString(record.skillCommandName),
		snapshot: asRecord(record.snapshot) as TPromptWorkflowCommandSnapshot | undefined,
		name: normalizeOptionalString(record.name),
		label: normalizeOptionalString(record.label),
		description: normalizeOptionalString(record.description),
		icon: normalizeIcon(record.icon),
		category: normalizeOptionalString(record.category),
		aliases: normalizeStringArray(record.aliases),
		argsHint: normalizeOptionalString(record.argsHint),
		template: normalizeOptionalString(record.template),
		runtimeCapabilities: record.runtimeCapabilities,
		availability: asRecord(record.availability) as TXpertCommandProfileEntry['availability']
	}
}

function normalizeCommandName(value: unknown) {
	const name = normalizeOptionalString(value)
	return name && PROMPT_WORKFLOW_NAME_PATTERN.test(name) ? name : null
}

function normalizeVisibility(value: unknown): PromptWorkflowVisibility {
	return typeof value === 'string' && PROMPT_WORKFLOW_VISIBILITIES.has(value as PromptWorkflowVisibility)
		? (value as PromptWorkflowVisibility)
		: 'private'
}

function normalizeOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return []
	}

	return Array.from(
		new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0))
	)
}

function mergeStringArrayOverride(value: unknown, fallback: string[] | undefined): string[] | undefined {
	const normalized = normalizeStringArray(value)
	return normalized.length ? normalized : fallback
}

function normalizeIcon(value: unknown) {
	if (typeof value === 'string' && value.trim()) {
		return value.trim()
	}

	return asRecord(value) ?? undefined
}

function normalizeArchivedAt(value: unknown): Date | null {
	if (value instanceof Date) {
		return value
	}
	if (typeof value === 'string' && value.trim()) {
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? null : date
	}

	return null
}

function hasWorkflowEntityId(
	workflow: Pick<IPromptWorkflow, keyof TPromptWorkflow | 'id' | 'workspaceId'> | TPromptWorkflowCommandSnapshot
): workflow is Pick<IPromptWorkflow, keyof TPromptWorkflow | 'id' | 'workspaceId'> {
	return 'id' in workflow && typeof workflow.id === 'string'
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
