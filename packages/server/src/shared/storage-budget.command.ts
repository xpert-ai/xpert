export type StorageBudgetOwner = {
	tenantId: string
	organizationId?: string | null
	userId?: string
}

/** Trusted resource identity, resolved by the caller's existing authorization path. */
export type StorageBudgetResource = StorageBudgetOwner &
	(
		| { kind: 'project'; id: string }
		| { kind: 'assistant'; id: string }
		| { kind: 'knowledge'; id: string }
		| { kind: 'workspace'; id: string }
		| { kind: 'user' }
	)

export type SandboxStorageAllowance = {
	maxWorkspaceBytes: number
	maxTemporaryBytes: number
}

export type StorageBudgetWrite =
	| { kind: 'refresh'; owner: StorageBudgetOwner }
	| { kind: 'remove'; resource: StorageBudgetResource; root: string }
	| { kind: 'file'; resource: StorageBudgetResource; root: string; path: string; bytes: number }
	| { kind: 'sandbox'; resource: StorageBudgetResource; root: string }
	| { kind: 'object'; owner: StorageBudgetOwner; provider: string; key: string; bytes: number }
	| { kind: 'delete-object'; owner: StorageBudgetOwner; provider: string; key: string }
	| { kind: 'temporary'; owner: StorageBudgetOwner; bytes: number }

/** Serializes account storage growth; callers retain resource authorization and safe filesystem containment. */
export class WithStorageBudgetCommand<T> {
	constructor(
		readonly write: StorageBudgetWrite,
		readonly commit: (allowance: SandboxStorageAllowance | null) => Promise<T>
	) {}
}
