import _ from 'underscore';
import moment from 'moment';
import timezone from 'moment-timezone';
import { Connection } from 'typeorm';
import faker from 'faker';
import {
	Organization,
} from '../core/entities/internal';
import {
	BonusTypeEnum,
	WeekDaysEnum,
	AlignmentOptions,
	IOrganizationCreateInput,
	IOrganization,
	ITenant,
	DEFAULT_DATE_FORMATS
} from '@metad/contracts';

export const getDefaultOrganization = async (
	connection: Connection,
	tenant: ITenant
): Promise<IOrganization> => {
	const repo = connection.getRepository(Organization);
	const existedOrganization = await repo.findOne({
		where: { tenantId: tenant.id, isDefault: true }
	});
	return existedOrganization;
};

export const getDefaultOrganizations = async (
	connection: Connection,
	tenant: ITenant
): Promise<IOrganization[]> => {
	const repo = connection.getRepository(Organization);
	const orgnaizations = await repo.find({
		where: { tenantId: tenant.id }
	});
	return orgnaizations;
};

let defaultOrganizationsInserted = [];

export const createDefaultOrganizations = async (
	connection: Connection,
	tenant: ITenant,
	organizations: any
): Promise<Organization[]> => {
	const defaultOrganizations: IOrganization[] = [];
	// const skills = await getSkills(connection);
	// const contacts = await getContacts(connection);

	organizations.forEach((organization: IOrganizationCreateInput) => {
		// const organizationSkills = _.chain(skills)
		// 	.shuffle()
		// 	.take(faker.datatype.number({ min: 1, max: 4 }))
		// 	.values()
		// 	.value();
		const defaultOrganization: IOrganization = new Organization();
		const { name, currency, defaultValueDateType, imageUrl, isDefault } = organization;
		defaultOrganization.name = name;
		defaultOrganization.isDefault = isDefault;
		defaultOrganization.profile_link = generateLink(name);
		defaultOrganization.currency = currency;
		defaultOrganization.defaultValueDateType = defaultValueDateType;
		defaultOrganization.imageUrl = imageUrl;
		defaultOrganization.invitesAllowed = true;
		defaultOrganization.bonusType = BonusTypeEnum.REVENUE_BASED_BONUS;
		defaultOrganization.bonusPercentage = 10;
		defaultOrganization.registrationDate = faker.date.past(5);
		defaultOrganization.overview = faker.name.jobDescriptor();
		defaultOrganization.short_description = faker.name.jobDescriptor();
		defaultOrganization.client_focus = faker.name.jobDescriptor();
		defaultOrganization.show_profits = false;
		defaultOrganization.show_bonuses_paid = false;
		defaultOrganization.show_income = false;
		defaultOrganization.show_total_hours = false;
		defaultOrganization.show_projects_count = true;
		defaultOrganization.show_minimum_project_size = true;
		defaultOrganization.show_clients_count = true;
		defaultOrganization.show_clients = true;
		defaultOrganization.show_employees_count = true;
		defaultOrganization.banner = faker.name.jobDescriptor();
		// defaultOrganization.skills = organizationSkills;
		defaultOrganization.brandColor = faker.random.arrayElement([
			'red',
			'green',
			'blue',
			'orange',
			'yellow'
		]);
		// defaultOrganization.contact = faker.random.arrayElement(contacts);
		defaultOrganization.timeZone = faker.random.arrayElement(
			timezone.tz.names().filter((zone) => zone.includes('/'))
		);
		defaultOrganization.dateFormat = faker.random.arrayElement(DEFAULT_DATE_FORMATS);
		defaultOrganization.defaultAlignmentType = faker.random.arrayElement(
			Object.keys(AlignmentOptions)
		);
		defaultOrganization.fiscalStartDate = moment(new Date())
			.add(faker.datatype.number(10), 'days')
			.toDate();
		defaultOrganization.fiscalEndDate = moment(
			defaultOrganization.fiscalStartDate
		)
			.add(faker.datatype.number(10), 'days')
			.toDate();
		defaultOrganization.futureDateAllowed = faker.datatype.boolean();
		defaultOrganization.inviteExpiryPeriod = faker.datatype.number(50);
		defaultOrganization.numberFormat = faker.random.arrayElement([
			'USD',
			'BGN',
			'ILS'
		]);
		defaultOrganization.officialName = faker.company.companyName();
		defaultOrganization.separateInvoiceItemTaxAndDiscount = faker.datatype.boolean();
		defaultOrganization.startWeekOn = WeekDaysEnum.MONDAY;
		defaultOrganization.totalEmployees = faker.datatype.number(4);
		defaultOrganization.tenant = tenant;
		defaultOrganization.valueDate = moment(new Date())
			.add(faker.datatype.number(10), 'days')
			.toDate();

		defaultOrganizations.push(defaultOrganization);
	});

	await connection.manager.save(defaultOrganizations);
	defaultOrganizationsInserted = [...defaultOrganizations];
	return defaultOrganizationsInserted;
};

const generateLink = (name) => {
	return name.replace(/[^A-Z0-9]+/gi, '-').toLowerCase();
};
