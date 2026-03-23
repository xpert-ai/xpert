import { SandboxBackendTargetStrategy } from './sandbox-backend.strategy'
import { SandboxMountedWorkspaceTargetStrategy } from './sandbox-mounted-workspace.strategy'
import { VolumeTargetStrategy } from './volume-target.strategy'

export const FileUploadTargetStrategies = [
	VolumeTargetStrategy,
	SandboxMountedWorkspaceTargetStrategy,
	SandboxBackendTargetStrategy
]
