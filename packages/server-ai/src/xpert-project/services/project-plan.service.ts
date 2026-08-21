import { IXpertProjectMilestone, IXpertProjectPlan } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectMilestone } from '../entities/project-milestone.entity'
import { XpertProjectPlan } from '../entities/project-plan.entity'

@Injectable()
export class XpertProjectPlanService extends TenantOrganizationAwareCrudService<XpertProjectPlan> {
    constructor(
        @InjectRepository(XpertProjectPlan)
        repository: Repository<XpertProjectPlan>,
        @InjectRepository(XpertProjectMilestone)
        private readonly milestoneRepository: Repository<XpertProjectMilestone>
    ) {
        super(repository)
    }

    list(projectId: string) {
        return this.findAll({ where: { projectId }, relations: ['milestones'], order: { order: 'ASC' } })
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
}
