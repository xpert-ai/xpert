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
	IXpertWorkspace,
	AiFeatureEnum,
	RequestScopeLevel
} from '@metad/contracts';
import { Injectable, inject } from '@angular/core';
import { StoreConfig, Store as AkitaStore, Query } from '@datorama/akita';
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions';
import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { uniqBy } from 'lodash-es';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemesEnum, linkedModel, normalizeTheme, prefersColorScheme, resolveTheme } from '@metad/ocap-angular/core';

export type ActiveScope =
	| { level: RequestScopeLevel.TENANT }
	| { level: RequestScopeLevel.ORGANIZATION; organizationId: string }

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
	activeScopeLevel?: RequestScopeLevel;
	lastOrganizationId?: string;
	lastTenantCompatibleRoute?: string;
	lastOrganizationCompatibleRoute?: string;
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
	const activeScopeLevel =
		(localStorage.getItem('_activeScopeLevel') as RequestScopeLevel) ||
		RequestScopeLevel.ORGANIZATION;
	const lastOrganizationId =
		localStorage.getItem('_lastOrganizationId') || organizationId || null;
	const lastTenantCompatibleRoute =
		localStorage.getItem('_lastTenantCompatibleRoute') || null;
	const lastOrganizationCompatibleRoute =
		localStorage.getItem('_lastOrganizationCompatibleRoute') || null;
	const serverConnection =
		parseInt(localStorage.getItem('serverConnection')) || null;
	const preferredLanguage = localStorage.getItem('preferredLanguage') || null;
	const preferredTheme = normalizeTheme(localStorage.getItem('preferredTheme'));
	const componentLayout = localStorage.getItem('componentLayout') || [];
	const cacheLevel = localStorage.getItem('cacheLevel') || null;
	const xpert = localStorage.getItem('xpert') || null;
	const preferences = localStorage.getItem('preferences') || {fixedLayoutSider: true};

	return {
		token,
		userId,
		organizationId,
		activeScopeLevel,
		lastOrganizationId,
		lastTenantCompatibleRoute,
		lastOrganizationCompatibleRoute,
		serverConnection,
		preferredLanguage,
		preferredTheme,
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
	activeScope$ = this.persistQuery
		.select((state) => state)
		.pipe(
			map((state) => resolveActiveScopeFromPersistState(state)),
			distinctUntilChanged(isActiveScopeEqual)
		);
	scopeLevel$ = this.activeScope$.pipe(
		map((scope) => scope.level),
		distinctUntilChanged()
	);
	
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
	readonly primaryTheme$ = combineLatest([this.preferredTheme$, prefersColorScheme()]).pipe(
		map(([theme, systemTheme]) => resolveTheme(theme, systemTheme)),
		distinctUntilChanged()
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
		return this.activeScope.level === RequestScopeLevel.ORGANIZATION
			? this.activeScope.organizationId
			: null;
	}

	set organizationId(id: IOrganization['id'] | null) {
		this.persistStore.update({
			organizationId: id,
			activeScopeLevel: id
				? RequestScopeLevel.ORGANIZATION
				: RequestScopeLevel.TENANT,
			lastOrganizationId: id || this.lastOrganizationId
		});
	}

	get activeScope(): ActiveScope {
		return resolveActiveScopeFromPersistState(this.persistQuery.getValue());
	}

	get scopeLevel(): RequestScopeLevel {
		return this.activeScope.level;
	}

	get isTenantScope(): boolean {
		return this.scopeLevel === RequestScopeLevel.TENANT;
	}

	get isOrganizationScope(): boolean {
		return this.scopeLevel === RequestScopeLevel.ORGANIZATION;
	}

	get lastOrganizationId(): IOrganization['id'] | null {
		const { lastOrganizationId } = this.persistQuery.getValue();
		return lastOrganizationId || null;
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
	hasFeatureEnabled(feature: FeatureEnum | AiFeatureEnum | AnalyticsFeatures) {
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
			preferredTheme: normalizeTheme(preferredTheme)
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
		this.persistStore.update((state) => ({
			...state,
			token: null,
			refreshToken: null,
			userId: null,
			workspaceId: null
		}));
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

		if (this.isOrganizationScope && selectedOrganization) {
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
		return this.activeScope$.pipe(
			map((scope) =>
				scope.level === RequestScopeLevel.ORGANIZATION
					? scope.organizationId
					: null
			),
			distinctUntilChanged()
		)
	}

	selectActiveScope() {
		return this.activeScope$
	}

	setTenantScope() {
		const currentOrganizationId = this.selectedOrganization?.id || this.lastOrganizationId;
		this.persistStore.update((state) => ({
			...state,
			activeScopeLevel: RequestScopeLevel.TENANT,
			organizationId: null,
			lastOrganizationId: currentOrganizationId || state.lastOrganizationId || null
		}));
		this.appStore.update({
			selectedOrganization: null
		});
		this.loadPermissions();
	}

	setOrganizationScope(organization: IOrganization) {
		if (!organization?.id) {
			return;
		}

		this.persistStore.update((state) => ({
			...state,
			activeScopeLevel: RequestScopeLevel.ORGANIZATION,
			organizationId: organization.id,
			lastOrganizationId: organization.id
		}));
		this.appStore.update({
			selectedOrganization: organization
		});
		this.loadPermissions();
	}

	setLastCompatibleRoute(level: RequestScopeLevel, route: string | null) {
		this.persistStore.update((state) => ({
			...state,
			lastTenantCompatibleRoute:
				level === RequestScopeLevel.TENANT
					? route
					: state.lastTenantCompatibleRoute,
			lastOrganizationCompatibleRoute:
				level === RequestScopeLevel.ORGANIZATION
					? route
					: state.lastOrganizationCompatibleRoute
		}));
	}

	getLastCompatibleRoute(level: RequestScopeLevel) {
		const state = this.persistQuery.getValue();
		return level === RequestScopeLevel.TENANT
			? state.lastTenantCompatibleRoute
			: state.lastOrganizationCompatibleRoute;
	}

	clearWorkspace() {
		this.persistStore.update((state) => ({
			...state,
			workspaceId: null
		}));
		this.appStore.update((state) => ({
			...state,
			selectedWorkspace: null
		}));
	}

	clearScopedSelections() {
		this.clearWorkspace();
		this.appStore.update((state) => ({
			...state,
			selectedEmployee: null,
			selectedProject: null
		}));
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

export function injectActiveScope() {
	const store = inject(Store)
	return toSignal(store.selectActiveScope(), {
		initialValue: store.activeScope
	})
}

export function injectScopeLevel() {
	const store = inject(Store)
	return toSignal(store.scopeLevel$, {
		initialValue: store.scopeLevel
	})
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

function resolveActiveScopeFromPersistState(
	state: PersistState
): ActiveScope {
	const level =
		state.activeScopeLevel ?? RequestScopeLevel.ORGANIZATION;
	const organizationId = state.organizationId || state.lastOrganizationId || null;

	if (level === RequestScopeLevel.ORGANIZATION && organizationId) {
		return {
			level: RequestScopeLevel.ORGANIZATION,
			organizationId
		};
	}

	return {
		level: RequestScopeLevel.TENANT
	};
}

function isActiveScopeEqual(a: ActiveScope, b: ActiveScope) {
	return (
		a?.level === b?.level &&
		(a?.level !== RequestScopeLevel.ORGANIZATION ||
			a.organizationId ===
				(b.level === RequestScopeLevel.ORGANIZATION
					? b.organizationId
					: null))
	);
}
