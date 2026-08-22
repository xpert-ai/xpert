import {
    IXpertProjectMilestone,
    IXpertProjectPlan,
    IXpertProjectSprint,
    IXpertProjectSwimlane
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectMilestone } from '../entities/project-milestone.entity'
import { XpertProjectPlan } from '../entities/project-plan.entity'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectSprint } from '../entities/project-sprint.entity'
import { XpertProjectSwimlane } from '../entities/project-swimlane.entity'

@Injectable()
export class XpertProjectPlanService extends TenantOrganizationAwareCrudService<XpertProjectPlan> {
    constructor(
        @InjectRepository(XpertProjectPlan)
        repository: Repository<XpertProjectPlan>,
        @InjectRepository(XpertProjectMilestone)
        private readonly milestoneRepository: Repository<XpertProjectMilestone>,
        @InjectRepository(XpertProject)
        private readonly projectRepository: Repository<XpertProject>,
        @InjectRepository(XpertProjectSprint)
        private readonly sprintRepository: Repository<XpertProjectSprint>,
        @InjectRepository(XpertProjectSwimlane)
        private readonly swimlaneRepository: Repository<XpertProjectSwimlane>
    ) {
        super(repository)
    }

    list(projectId: string) {
        return this.findAll({
            where: { projectId },
            relations: ['milestones', 'sprints', 'sprints.swimlanes'],
            order: { order: 'ASC' }
        })
    }

    async ensureDefaults(projectId: string) {
        // CrudService.findOne throws for a missing row; provisioning a new
        // project must treat the default plan as optional and create it.
        let plan = await this.repository.findOne({
            where: { projectId, name: 'Default plan' },
            relations: ['milestones']
        })
        if (!plan) {
            plan = await this.createPlan(projectId, {
                name: 'Default plan',
                description: 'Project delivery plan',
                status: 'active',
                view: 'board',
                order: 0
            })
        }
        const hasUncategorized = plan.milestones?.some((milestone) => milestone.name === 'Uncategorized')
        if (!hasUncategorized) {
            await this.createMilestone(projectId, plan.id, {
                name: 'Uncategorized',
                status: 'planned',
                order: 0
            })
        }
        return plan
    }

    async createPlan(projectId: string, input: Partial<IXpertProjectPlan>) {
        const project = await this.projectRepository.findOne({ where: { id: projectId } })
        if (!project) throw new NotFoundException('Xpert project not found')
        if (project.settings?.managementMode !== 'advanced' && input.name?.trim() !== 'Default plan') {
            throw new BadRequestException('Simple projects use the default plan only')
        }
        return this.create({
            projectId,
            name: input.name?.trim() || 'Untitled plan',
            description: input.description,
            status: input.status ?? 'active',
            view: input.view ?? 'board',
            startDate: input.startDate,
            dueDate: input.dueDate,
            order: input.order ?? 0
        })
    }

    async updatePlan(projectId: string, planId: string, input: Partial<IXpertProjectPlan>) {
        const plan = await this.findOne({ where: { id: planId, projectId } })
        if (!plan) throw new NotFoundException('Project plan not found')
        Object.assign(plan, input, { projectId })
        return this.save(plan)
    }

    async removePlan(projectId: string, planId: string) {
        const plan = await this.findOne({ where: { id: planId, projectId } })
        if (!plan) throw new NotFoundException('Project plan not found')
        await this.repository.remove(plan)
    }

    listMilestones(projectId: string, planId: string) {
        return this.milestoneRepository.find({
            where: { projectId, planId },
            order: { order: 'ASC' }
        })
    }

    async createMilestone(projectId: string, planId: string, input: Partial<IXpertProjectMilestone>) {
        const plan = await this.findOne({ where: { id: planId, projectId } })
        if (!plan) throw new NotFoundException('Project plan not found')
        const project = await this.projectRepository.findOne({ where: { id: projectId } })
        if (project?.settings?.managementMode !== 'advanced' && input.name?.trim() !== 'Uncategorized') {
            throw new BadRequestException('Simple projects use the uncategorized milestone only')
        }
        return this.milestoneRepository.save(
            this.milestoneRepository.create({
                projectId,
                planId,
                name: input.name?.trim() || 'Untitled milestone',
                description: input.description,
                status: input.status ?? 'planned',
                dueDate: input.dueDate,
                order: input.order ?? 0,
                tenantId: plan.tenantId,
                organizationId: plan.organizationId,
                createdById: plan.createdById
            })
        )
    }

    async updateMilestone(
        projectId: string,
        planId: string,
        milestoneId: string,
        input: Partial<IXpertProjectMilestone>
    ) {
        const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId, projectId, planId } })
        if (!milestone) throw new NotFoundException('Project milestone not found')
        Object.assign(milestone, input, { projectId, planId })
        return this.milestoneRepository.save(milestone)
    }

    async removeMilestone(projectId: string, planId: string, milestoneId: string) {
        const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId, projectId, planId } })
        if (!milestone) throw new NotFoundException('Project milestone not found')
        await this.milestoneRepository.remove(milestone)
    }

    async listSprints(projectId: string, planId: string) {
        return this.sprintRepository.find({
            where: { projectId, planId },
            relations: ['swimlanes'],
            order: { createdAt: 'DESC' }
        })
    }

    async createSprint(projectId: string, planId: string, input: Partial<IXpertProjectSprint>) {
        const plan = await this.findOne({ where: { id: planId, projectId } })
        if (!plan) throw new NotFoundException('Project plan not found')
        const project = await this.projectRepository.findOne({ where: { id: projectId } })
        if (project?.settings?.managementMode !== 'advanced')
            throw new BadRequestException('Sprints require advanced project mode')
        const strategyType = input.strategyType ?? 'software_delivery'
        const sprint = await this.sprintRepository.save(
            this.sprintRepository.create({
                projectId,
                planId,
                goal: input.goal?.trim() || 'Untitled sprint',
                status: input.status ?? 'planned',
                strategyType,
                startAt: input.startAt,
                endAt: input.endAt,
                retrospective: input.retrospective,
                tenantId: plan.tenantId,
                organizationId: plan.organizationId,
                createdById: plan.createdById
            })
        )
        const lanes = defaultSwimlanes(sprint)
        await this.swimlaneRepository.save(
            lanes.map((lane) =>
                this.swimlaneRepository.create({
                    ...lane,
                    tenantId: plan.tenantId,
                    organizationId: plan.organizationId,
                    createdById: plan.createdById
                })
            )
        )
        return this.sprintRepository.findOne({ where: { id: sprint.id }, relations: ['swimlanes'] })
    }

    async updateSprint(projectId: string, sprintId: string, input: Partial<IXpertProjectSprint>) {
        const sprint = await this.sprintRepository.findOne({ where: { id: sprintId, projectId } })
        if (!sprint) throw new NotFoundException('Project sprint not found')
        if (input.strategyType && input.strategyType !== sprint.strategyType)
            throw new BadRequestException('Changing sprint strategy is not supported')
        Object.assign(sprint, input, { projectId })
        return this.sprintRepository.save(sprint)
    }

    listSwimlanes(projectId: string, sprintId: string) {
        return this.swimlaneRepository.find({ where: { projectId, sprintId }, order: { sortOrder: 'ASC' } })
    }

    async createSwimlane(projectId: string, sprintId: string, input: Partial<IXpertProjectSwimlane>) {
        const sprint = await this.sprintRepository.findOne({ where: { id: sprintId, projectId } })
        if (!sprint) throw new NotFoundException('Project sprint not found')
        if (input.key === 'backlog') throw new BadRequestException('The backlog lane is reserved')
        return this.swimlaneRepository.save(
            this.swimlaneRepository.create({
                projectId,
                sprintId,
                key: input.key?.trim() || `lane-${Date.now()}`,
                name: input.name?.trim() || 'New swimlane',
                kind: input.kind ?? 'execution',
                priority: input.priority ?? 0,
                weight: input.weight ?? 1,
                concurrencyLimit: input.concurrencyLimit ?? 1,
                wipLimit: input.wipLimit ?? 0,
                agentRole: input.agentRole ?? 'operator',
                environmentType: input.environmentType ?? 'browser',
                sortOrder: input.sortOrder ?? 0,
                sourceStrategyType: input.sourceStrategyType ?? sprint.strategyType,
                tenantId: sprint.tenantId,
                organizationId: sprint.organizationId,
                createdById: sprint.createdById
            })
        )
    }

    async updateSwimlane(
        projectId: string,
        sprintId: string,
        swimlaneId: string,
        input: Partial<IXpertProjectSwimlane>
    ) {
        const lane = await this.swimlaneRepository.findOne({ where: { id: swimlaneId, projectId, sprintId } })
        if (!lane) throw new NotFoundException('Project swimlane not found')
        if (lane.key === 'backlog' && (input.key || input.kind === 'execution'))
            throw new BadRequestException('The backlog lane is reserved')
        Object.assign(lane, input, { projectId, sprintId })
        return this.swimlaneRepository.save(lane)
    }
}

function defaultSwimlanes(sprint: XpertProjectSprint): Partial<IXpertProjectSwimlane>[] {
    const names =
        sprint.strategyType === 'data_analysis'
            ? [
                  ['research', 'Research', 'researcher'],
                  ['analysis', 'Analysis', 'analyst'],
                  ['visualization', 'Visualization', 'visualizer']
              ]
            : [
                  ['planning', 'Planning', 'planner'],
                  ['coding', 'Coding', 'coder'],
                  ['review', 'Review', 'reviewer'],
                  ['release', 'Release', 'operator']
              ]
    return [
        {
            projectId: sprint.projectId,
            sprintId: sprint.id,
            key: 'backlog',
            name: 'Backlog',
            kind: 'backlog',
            priority: 0,
            weight: 0,
            concurrencyLimit: 0,
            wipLimit: 0,
            agentRole: 'planner',
            environmentType: 'browser',
            sortOrder: 0,
            sourceStrategyType: sprint.strategyType
        },
        ...names.map(([key, name, agentRole], index) => ({
            projectId: sprint.projectId,
            sprintId: sprint.id,
            key,
            name,
            kind: 'execution' as const,
            priority: index + 1,
            weight: 1,
            concurrencyLimit: 1,
            wipLimit: 0,
            agentRole: agentRole as IXpertProjectSwimlane['agentRole'],
            environmentType: 'browser' as const,
            sortOrder: index + 1,
            sourceStrategyType: sprint.strategyType
        }))
    ]
}
