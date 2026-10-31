export type StorageBudgetOwner = { tenantId: string; organizationId?: string | null; userId?: string }

/** Trusted resource identity supplied by an existing authorization boundary. */
export type StorageBudgetResource = StorageBudgetOwner &
	(
		| { kind: 'project'; id: string }
		| { kind: 'assistant'; id: string }
		| { kind: 'knowledge'; id: string }
		| { kind: 'workspace'; id: string }
		| { kind: 'user' }
	)
export type StorageQuotaScope = StorageBudgetOwner | StorageBudgetResource
export type SandboxStorageAllowance = { maxWorkspaceBytes: number; maxTemporaryBytes: number }
export type StorageQuotaRequest =
	| { kind: 'write' | 'run'; scope: StorageQuotaScope; growthBytes?: number }
	| { kind: 'sandbox'; scope: StorageBudgetResource; root: string }
	| { kind: 'temporary'; scope: StorageBudgetOwner; bytes: number }

/** Infrastructure admission against a recent usage snapshot; never reserves bytes or executes business callbacks. */
export class CheckStorageQuotaCommand {
	constructor(readonly request: StorageQuotaRequest) {}
}

/** Request background reconciliation after deletion; callers retain ownership and authorization checks. */
export class RequestStorageUsageRefreshCommand {
	constructor(readonly scope: StorageQuotaScope) {}
}
