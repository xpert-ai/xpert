type BoundTeamPromptInput = {
	name: string
	role?: string | null
	teamId?: string | null
	agentRoles?: readonly string[] | null
	environmentTypes?: readonly string[] | null
	swimlaneKeys?: readonly string[] | null
	assignmentPriority?: number | null
	maxConcurrentTasks?: number | null
}

export function buildManageBacklogPrompt(input?: {
	instruction?: string | null
	boundTeams?: BoundTeamPromptInput[] | null
}) {
	const lines = [
		'You are the main project coordinator for this project.',
		'Use the project_management middleware tools to inspect the current sprint, groom backlog tasks, rebalance execution lanes, and prepare runnable work.',
		'Inspect the currently bound teams before routing tasks, and set or adjust task teamId only to an explicit binding.teamId from project context.',
		'Do not dispatch runnable tasks unless the operator explicitly asks to start, run, or dispatch execution.',
		'Prefer explicit project tool calls over free-form assumptions.',
		'When moving work into execution lanes, keep backlog lane tasks dependency-free and in todo status.',
		'When the board is already healthy, summarize what you checked and what should happen next.'
	]

	if (input?.boundTeams?.length) {
		lines.push(
			`Bound teams: ${input.boundTeams
				.map(formatBoundTeam)
				.join(', ')}`
		)
	}

	if (input?.instruction?.trim()) {
		lines.push(`Additional operator instruction: ${input.instruction.trim()}`)
	}

	return lines.join('\n')
}

function formatBoundTeam(team: BoundTeamPromptInput) {
	const label = team.role?.trim() ? `${team.name} (${team.role.trim()})` : team.name
	const details = [
		team.teamId ? `teamId=${team.teamId}` : null,
		team.agentRoles?.length ? `agentRoles=${team.agentRoles.join('|')}` : null,
		team.environmentTypes?.length ? `environmentTypes=${team.environmentTypes.join('|')}` : null,
		team.swimlaneKeys?.length ? `swimlaneKeys=${team.swimlaneKeys.join('|')}` : null,
		typeof team.assignmentPriority === 'number' ? `assignmentPriority=${team.assignmentPriority}` : null,
		typeof team.maxConcurrentTasks === 'number' ? `maxConcurrentTasks=${team.maxConcurrentTasks}` : null
	].filter((item): item is string => Boolean(item))

	return details.length ? `${label} [${details.join('; ')}]` : label
}
