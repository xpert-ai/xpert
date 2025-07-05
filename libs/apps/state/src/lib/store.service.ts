import {
	DefaultValueDateTypeEnum,
	IOrganization,
	IRolePermission,
	IUser,
	LanguagesEnum,
	ILanguage,
	IFeatureToggle,
	IFeatureOrganization,
	ISelectedEmployee,
	PermissionsEnum,
	IProject,
	FeatureEnum,
	OrganizationPermissionsEnum,
	AnalyticsFeatures,
	ITenantSetting,
	IXpertWorkspace
} from '@metad/contracts';
import { Injectable, inject } from '@angular/core';
import { StoreConfig, Store as AkitaStore, Query } from '@datorama/akita';
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { combineLatest } from 'rxjs';
import { uniqBy } from 'lodash-es';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemesEnum, linkedModel, prefersColorScheme } from '@metad/ocap-angular/core';


export interface AppState {
	user: IUser;
	userRolePermissions: IRolePermission[];
	selectedOrganization: IOrganization;
	selectedEmployee: ISelectedEmployee;
	selectedProject: IProject;
	selectedDate: Date;
	selectedWorkspace: IXpertWorkspace;
	systemLanguages: ILanguage[];
	featureToggles: IFeatureToggle[];
	featureOrganizations: IFeatureOrganization[];
	featureTenant: IFeatureOrganization[];
	tenantSettings?: ITenantSetting
}

export interface PersistState {
	organizationId?: string;
	workspaceId?: string;
	/**
	 * @deprecated unused
	 */
	clientId?: string;
	token: string;
	refreshToken: string;
	userId: string;
	/**
	 * @deprecated unused
	 */
	serverConnection: number;
	preferredLanguage: LanguagesEnum;
	preferredTheme: ThemesEnum;
	/**
	 * The cache level for the ocap framework
	 */
	cacheLevel: number
	/**
	 * Pin the story toolbar on the left side of designer
	 */
	pinStoryToolbar?: boolean
	/**
	 * Business Role of the copilot
	 */
	copilotRole?: string
	/**
	 * @deprecated use xpert in preferences
	 */
	xpert: {
		/**
		 * Order of xperts in chat page
		 */
		sortOrder: string[]
	}
	preferences?: {
		chatSidebar: 'closed' | 'expanded'
		fixedLayoutSider?: boolean
	}
}

export function createInitialAppState(): AppState {
	return {
		selectedDate: new Date(),
		userRolePermissions: [],
		featureToggles: [],
		featureOrganizations: [],
		featureTenant: []
	} as AppState;
}

export function createInitialPersistState(): PersistState {
	const token = localStorage.getItem('token') || null;
	const userId = localStorage.getItem('_userId') || null;
	const organizationId = localStorage.getItem('_organizationId') || null;
	const serverConnection =
		parseInt(localStorage.getItem('serverConnection')) || null;
	const preferredLanguage = localStorage.getItem('preferredLanguage') || null;
	const componentLayout = localStorage.getItem('componentLayout') || [];
	const cacheLevel = localStorage.getItem('cacheLevel') || null;
	const xpert = localStorage.getItem('xpert') || null;
	const preferences = localStorage.getItem('preferences') || {fixedLayoutSider: true};

	return {
		token,
		userId,
		organizationId,
		serverConnection,
		preferredLanguage,
		componentLayout,
		cacheLevel,
		xpert,
		preferences
	} as unknown as PersistState;
}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'app' })
export class AppStore extends AkitaStore<AppState> {
	constructor() {
		super(createInitialAppState());
	}
}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'persist' })
export class PersistStore extends AkitaStore<PersistState> {
	constructor() {
		super(createInitialPersistState());
	}
}

@Injectable({ providedIn: 'root' })
export class AppQuery extends Query<AppState> {
	constructor(protected store: AppStore) {
		super(store);
	}
}

@Injectable({ providedIn: 'root' })
export class PersistQuery extends Query<PersistState> {
	constructor(protected store: PersistStore) {
		super(store);
	}
}

@Injectable({ providedIn: 'root' })
export class Store {
	protected appStore = inject(AppStore)
	protected appQuery = inject(AppQuery)
	protected persistStore = inject(PersistStore)
	protected permissionsService = inject(NgxPermissionsService)
	protected ngxRolesService = inject(NgxRolesService)
	protected persistQuery = inject(PersistQuery)

	user$ = this.appQuery.select((state) => state.user);
	selectedOrganization$ = this.appQuery.select(
		(state) => state.selectedOrganization
	);
	selectedProject$ = this.appQuery.select((state) => state.selectedProject);
	selectedEmployee$ = this.appQuery.select((state) => state.selectedEmployee);
	selectedWorkspace$ = this.appQuery.select((state) => state.selectedWorkspace);
	workspaceId$ = this.persistQuery.select((state) => state.workspaceId);
	
	selectedDate$ = this.appQuery.select((state) => state.selectedDate);
	userRolePermissions$ = this.appQuery.select(
		(state) => state.userRolePermissions
	);
	featureToggles$ = this.appQuery.select((state) => state.featureToggles);
	featureOrganizations$ = this.appQuery.select(
		(state) => state.featureOrganizations
	);
	featureTenant$ = this.appQuery.select((state) => state.featureTenant);
	preferredLanguage$ = this.persistQuery.select(
		(state) => state.preferredLanguage
	);
	preferredTheme$ = this.persistQuery.select(
		(state) => state.preferredTheme
	);
	readonly primaryTheme$ = combineLatest([this.preferredTheme$.pipe(map((theme) => theme?.split('-')[0])), prefersColorScheme()])
		.pipe(
			map(([primary, systemColorScheme]) => (primary === ThemesEnum.system || !primary) ? systemColorScheme : primary)
		)

	systemLanguages$ = this.appQuery.select((state) => state.systemLanguages);
	tenantSettings$ = this.appQuery.select((state) => state.tenantSettings);

	token$ = this.persistQuery.select((state) => state.token);

	// Signals
	readonly pinStoryToolbar = toSignal(this.persistQuery.select((state) => state.pinStoryToolbar))
	readonly copilotRole = toSignal(this.persistQuery.select((state) => state.copilotRole))
	/**
	 * @deprecated use xpert in preferences
	 */
	readonly xpert = toSignal(this.persistQuery.select((state) => state.xpert))
	readonly preferences = toSignal(this.persistQuery.select((state) => state.preferences))

	set selectedOrganization(organization: IOrganization) {
		this.appStore.update({
			selectedOrganization: organization
		});
		this.loadPermissions();
	}

	get selectedOrganization(): IOrganization {
		const { selectedOrganization } = this.appQuery.getValue();
		return selectedOrganization;
	}

	set selectedProject(project: IProject) {
		this.appStore.update({
			selectedProject: project
		})
	}

	get selectedProject() {
		const { selectedProject } = this.appQuery.getValue();
		return selectedProject
	}

	set selectedEmployee(employee: ISelectedEmployee) {
		this.appStore.update({
			selectedEmployee: employee
		});
	}

	get selectedEmployee(): ISelectedEmployee {
		const { selectedEmployee } = this.appQuery.getValue();
		return selectedEmployee;
	}

	set systemLanguages(languages: ILanguage[]) {
		this.appStore.update({
			systemLanguages: languages
		});
	}

	get systemLanguages(): ILanguage[] {
		const { systemLanguages } = this.appQuery.getValue();
		return systemLanguages;
	}

	get token(): string | null {
		const { token } = this.persistQuery.getValue();
		return token;
	}

	set token(token: string) {
		this.persistStore.update({
			token: token
		});
	}

	get refreshToken() {
		const { refreshToken } = this.persistQuery.getValue()
		return refreshToken
	}
	set refreshToken(refreshToken: string) {
		this.persistStore.update({
			refreshToken: refreshToken
		});
	}

	get userId(): IUser['id'] | null {
		const { userId } = this.persistQuery.getValue();
		return userId;
	}

	set userId(id: IUser['id'] | null) {
		this.persistStore.update({
			userId: id
		});
	}

	/**
	 * @deprecated use injectOrganizationId
	 */
	get organizationId(): IOrganization['id'] | null {
		const { organizationId } = this.persistQuery.getValue();
		return organizationId;
	}

	set organizationId(id: IOrganization['id'] | null) {
		this.persistStore.update({
			organizationId: id
		});
	}

	get user(): IUser {
		const { user } = this.appQuery.getValue();
		return user;
	}

	set user(user: IUser) {
		this.appStore.update({
			user: user
		});
	}

	get selectedDate() {
		const { selectedDate } = this.appQuery.getValue();
		if (selectedDate instanceof Date) {
			return selectedDate;
		}

		const date = new Date(selectedDate);
		this.appStore.update({
			selectedDate: date
		});

		return date;
	}

	set selectedDate(date: Date) {
		this.appStore.update({
			selectedDate: date
		});
	}

	get featureToggles(): IFeatureToggle[] {
		const { featureToggles } = this.appQuery.getValue();
		return featureToggles;
	}

	set featureToggles(featureToggles: IFeatureToggle[]) {
		this.appStore.update({
			featureToggles: featureToggles
		});
	}

	get featureTenant(): IFeatureOrganization[] {
		const { featureTenant } = this.appQuery.getValue();
		return featureTenant;
	}

	set featureTenant(featureOrganizations: IFeatureOrganization[]) {
		this.appStore.update({
			featureTenant: featureOrganizations
		});
	}

	get featureOrganizations(): IFeatureOrganization[] {
		const { featureOrganizations } = this.appQuery.getValue();
		return featureOrganizations;
	}

	set featureOrganizations(featureOrganizations: IFeatureOrganization[]) {
		this.appStore.update({
			featureOrganizations: featureOrganizations
		});
	}

	/*
	 * Check features are enabled/disabled for tenant organization
	 */
	hasFeatureEnabled(feature: FeatureEnum | AnalyticsFeatures) {
		const {
			featureTenant = [],
			featureOrganizations = [],
			featureToggles = []
		} = this.appQuery.getValue();
		const filtered = uniqBy(
			[...featureOrganizations, ...featureTenant],
			(x) => x.featureId
		);

		const unleashToggle = featureToggles.find(
			(toggle) => toggle.name === feature && toggle.enabled === false
		);
		if (unleashToggle) {
			return unleashToggle.enabled;
		}

		return !!filtered.find(
			(item) => item.feature.code === feature && item.isEnabled
		);
	}

	get userRolePermissions(): IRolePermission[] {
		const { userRolePermissions } = this.appQuery.getValue();
		return userRolePermissions;
	}

	set userRolePermissions(rolePermissions: IRolePermission[]) {
		this.appStore.update({
			userRolePermissions: rolePermissions
		});
		this.loadPermissions();
	}

	hasPermission(permission: PermissionsEnum) {
		const { userRolePermissions } = this.appQuery.getValue();
		return !!(userRolePermissions || []).find(
			(p) => p.permission === permission && p.enabled
		);
	}

	getDateFromOrganizationSettings() {
		const dateObj = this.selectedDate;
		switch (
			this.selectedOrganization &&
			this.selectedOrganization.defaultValueDateType
		) {
			case DefaultValueDateTypeEnum.TODAY: {
				return new Date(Date.now());
			}
			case DefaultValueDateTypeEnum.END_OF_MONTH: {
				return new Date(dateObj.getFullYear(), dateObj.getMonth(), 0);
			}
			case DefaultValueDateTypeEnum.START_OF_MONTH: {
				return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
			}
			default: {
				return new Date(Date.now());
			}
		}
	}

	get serverConnection() {
		const { serverConnection } = this.persistQuery.getValue();
		return serverConnection;
	}

	set serverConnection(val: number) {
		this.persistStore.update({
			serverConnection: val
		});
	}

	get preferredLanguage(): any | null {
		const { preferredLanguage } = this.persistQuery.getValue();
		return preferredLanguage;
	}

	set preferredLanguage(preferredLanguage) {
		this.persistStore.update({
			preferredLanguage: preferredLanguage
		});
	}

	get preferredTheme(): any | null {
		const { preferredTheme } = this.persistQuery.getValue();
		return preferredTheme;
	}

	set preferredTheme(preferredTheme) {
		this.persistStore.update({
			preferredTheme: preferredTheme
		});
	}

	get cacheLevel(): any | null {
		const { cacheLevel } = this.persistQuery.getValue();
		return cacheLevel;
	}

	set cacheLevel(cacheLevel) {
		this.persistStore.update({
			cacheLevel: cacheLevel
		});
	}

	get tenantSettings(): ITenantSetting | null {
		const { tenantSettings } = this.appQuery.getValue();
		return tenantSettings;
	}
	set tenantSettings(tenantSettings: ITenantSetting) {
		this.appStore.update({
			tenantSettings: tenantSettings
		});
	}

	setPinStoryToolbar(value: boolean) {
		this.persistStore.update({
			pinStoryToolbar: value
		})
	}

	setCopilotRole(role: string) {
		this.persistStore.update({
			copilotRole: role
		})
	}

	clear() {
		this.appStore.reset();
		this.persistStore.reset();
	}

	loadRoles() {
		const { user } = this.appQuery.getValue();
		this.ngxRolesService.flushRoles();
		this.ngxRolesService.addRole(user.role.name, () => true);
	}

	loadPermissions() {
		this.loadRoles()
		const { selectedOrganization } = this.appQuery.getValue();
		let permissions = [];
		const { userRolePermissions } = this.appQuery.getValue();
		const userPermissions = userRolePermissions.filter((permission) => permission.enabled).map((item) => item.permission)
		// Object.keys(PermissionsEnum)
		// 	.map((key) => PermissionsEnum[key])
		// 	.filter((permission) => this.hasPermission(permission));
		permissions = permissions.concat(userPermissions);

		if (selectedOrganization) {
			const organizationPermissions = Object.keys(
				OrganizationPermissionsEnum
			)
				.map((key) => OrganizationPermissionsEnum[key])
				.filter((permission) => selectedOrganization[permission]);

			permissions = permissions.concat(organizationPermissions);
		}

		this.permissionsService.flushPermissions();
		this.permissionsService.loadPermissions(permissions);
	}

	selectOrganizationId() {
		return this.selectedOrganization$.pipe(map((org) => org?.id), distinctUntilChanged())
	}

	/**
	 * Update preferences of xperts
	 * 
	 * @param xpert preferences
	 */
	updateXpert(xpert: Partial<PersistState['xpert']>) {
		this.persistStore.update((state) => {
			state.xpert = {
				...(state.xpert ?? {}),
				...xpert
			} as PersistState['xpert']
			return {...state}
		})
	}

	updatePreferences(preferences: Partial<PersistState['preferences']>) {
		this.persistStore.update((state) => {
			state.preferences = {
				...(state.preferences ?? {}),
				...preferences
			} as PersistState['preferences']
			return {...state}
		})
	}

	setWorkspace(workspace: IXpertWorkspace) {
		this.persistStore.update((state) => {
			return {
				...state,
				workspaceId: workspace.id,
			}
		})
		this.appStore.update((state) => {
			return {
				...state,
				selectedWorkspace: workspace
			}
		})
	}
}

export function injectOrganizationId() {
	const store = inject(Store)
	return toSignal(store.selectOrganizationId())
}

export function injectOrganization() {
	const store = inject(Store)
	return toSignal(store.selectedOrganization$)
}

export function injectXpertPreferences() {
	const store = inject(Store)
	return store.xpert
}

export function injectUserPreferences() {
	const store = inject(Store)
	return linkedModel({
		initialValue: null,
		compute: () => store.preferences(),
		update: (preferences) => {
			store.updatePreferences(preferences)
		}
	})
}

export function injectWorkspace() {
	const store = inject(Store)
	return toSignal(store.selectedWorkspace$)
}

export function injectWorkspaceId() {
	const store = inject(Store)
	return toSignal(store.workspaceId$)
}
