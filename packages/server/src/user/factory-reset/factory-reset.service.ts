import { ConfigService } from '@xpert-ai/server-config';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { filter, map, some } from 'underscore';
import {
    Organization,
    User,
    UserOrganization
} from '../../core/entities/internal';

@Injectable()
export class FactoryResetService {

    repositories: Repository<any>[];

    constructor(
        
        // @InjectRepository(Organization)
        // private readonly organizationRepository: Repository<Organization>,

        
        // @InjectRepository(User)
        // private readonly userRepository: Repository<User>,

        // @InjectRepository(UserOrganization)
        // private readonly userOrganizationRepository: Repository<UserOrganization>,

        private readonly configService: ConfigService
    ) { }

    async onModuleInit() {
        this.registerCoreRepositories();
    }

    async reset(id: any) {
        // if (this.configService.get('demo') === true) {
        //     throw new ForbiddenException();
        // }

        // const user = await this.userRepository.findOne(id);
        // user.thirdPartyId = null;
        // user.preferredLanguage = null;
        // user.preferredComponentLayout = null;
        // user.employeeId = null;
        // await this.userRepository.save(user);

        // const oldOrganization: any = await this.userOrganizationRepository.findOne({
        //     order: {
        //         createdAt: "ASC"
        //     },
        //     select: ["organizationId"],
        //     where: {
        //         userId: id
        //     }
        // });
        // const organizations: any = await this.userOrganizationRepository.find({
        //     select: ["organizationId"],
        //     where: {
        //         userId: id
        //     }
        // });

        // const allOrganizationsIds = map(organizations, (org) => {
        //     return org.organizationId
        // });
        // const deleteOrganizationIds = filter(allOrganizationsIds, (organizationsId) => {
        //     return organizationsId != oldOrganization.organizationId
        // });

        // const findInput = {
        //     organizationIds: allOrganizationsIds,
        //     tenantId: user.tenantId
        // }

        // await this.deleteSpecificTables(findInput)
        // if (deleteOrganizationIds?.length > 0) {
        //     await this.userOrganizationRepository.delete({
        //         userId: id,
        //         organizationId: In(deleteOrganizationIds),
        //         tenantId: user.tenantId
        //     });
        //     await this.organizationRepository.delete({
        //         id: In(deleteOrganizationIds),
        //         tenantId: user.tenantId
        //     });
        // }

        // const firstOrganization = await this.organizationRepository.findOne({
        //     id: oldOrganization.organizationId,
        // });

        // return firstOrganization;
        
    }

    async deleteSpecificTables(
        findInput: {
            organizationIds: string[];
            tenantId: string;
        }
    ) {
        for (let i = 0; i < this.repositories.length; i++) {
            await this.deleteRepository(this.repositories[i], findInput)
        }
        return
    }

    async deleteRepository(
        repository: Repository<any>,
        findInput: {
            organizationIds: string[];
            tenantId: string;
        }
    ): Promise<any> {
        let conditions: any = {};
        const columns = repository.metadata.ownColumns.map(column => column.propertyName);
        const tenantId = some(columns, (column) => {
            return column === 'tenantId';
        })
        const organizationId = some(columns, (column) => {
            return column === 'organizationId';
        })

        if (tenantId && organizationId) {
            conditions = {
                tenantId: findInput['tenantId'],
                organizationId: In(findInput['organizationIds'])
            };
        }
        if (tenantId && !organizationId) {
            conditions = {
                tenantId: findInput['tenantId']
            };
        }
        return repository.delete(conditions);
    }

    private registerCoreRepositories() {
        this.repositories = [
            // this.tagRepository,
            // this.activityRepository,
            // this.approvalPolicyRepository,
            // this.appointmentEmployeesRepository,
            // this.availabilitySlotsRepository,
            // this.candidateCriterionsRatingRepository,
            // this.candidateDocumentRepository,
            // this.candidateEducationRepository,
            // this.candidateExperienceRepository,
            // this.candidateFeedbackRepository,
            // this.candidateInterviewersRepository,
            // this.candidateInterviewRepository,
            // this.candidateRepository,
            // this.candidateSkillRepository,
            // this.candidateSourceRepository,
            // this.candidateTechnologiesRepository,
            // this.dealRepository,
            // this.keyResultRepository,
            // this.keyResultTemplateRepository,
            // this.keyResultUpdateRepository,
            // this.goalKpiRepository,
            // this.goalKpiTemplateRepository,
            // this.goalRepository,
            // this.goalTemplateRepository,
            // this.goalTimeFrameRepository,
            // this.emailRepository,
            // this.timeLogRepository,
            // this.timeOffPolicyRepository,
            // this.timeOffRequestRepository,
            // this.timeSheetRepository,
            // this.timeSlotRepository,
            // this.invoiceItemRepository,
            // this.invoiceEstimateHistoryRepository,
            // this.invoiceRepository,
            // this.featureOrganizationRepository,
            // this.jobPresetRepository,
            // this.jobSearchCategoryRepository,
            // this.jobSearchOccupationRepository,
            // this.employeeAppointmentRepository,
            // this.employeeAwardRepository,
            // this.employeeLevelRepository,
            // this.employeeProposalTemplateRepository,
            // this.employeeRecurringExpenseRepository,
            // this.employeeRepository,
            // this.employeeSettingRepository,
            // this.equipmentSharingRepository,
            // this.equipmentRepository,
            // this.estimateEmailRepository,
            // this.eventTypeRepository,
            // this.expenseCategoryRepository,
            // this.expenseRepository,
            // this.incomeRepository,
            // this.integrationEntitySettingRepository,
            // this.integrationEntitySettingTiedRepository,
            // this.integrationMapRepository,
            // this.integrationSettingRepository,
            // this.integrationTenantRepository,
            // this.inviteRepository,
            // this.organizationAwardRepository,
            // this.organizationDepartmentRepository,
            // this.organizationDocumentRepository,
            // this.organizationEmploymentTypeRepository,
            // this.organizationLanguageRepository,
            // this.organizationPositionRepository,
            // this.organizationSprintRepository,
            // this.organizationTeamEmployeeRepository,
            // this.organizationTeamRepository,
            // this.organizationVendorsRepository,
            // this.organizationRecurringExpenseRepository,
            // this.organizationProjectsRepository,
            // this.organizationContactRepository,
            // this.productCategoryRepository,
            // this.productOptionRepository,
            // this.productRepository,
            // this.productVariantPriceRepository,
            // this.productVariantRepository,
            // this.productVariantSettingRepository,
            // this.paymentRepository,
            // this.pipelineRepository,
            // this.proposalRepository,
            // this.requestApprovalRepository,
            // this.screenShotRepository,
            // this.skillRepository,
            // this.stageRepository,
            // this.contactRepository,
            // this.taskRepository,
            // this.tenantSettingRepository,
        ];
    }
}
