// import { ICopilotStoreVector } from '@metad/contracts'
// import { TenantOrganizationBaseEntity } from '@metad/server-core'
// import { Column, Entity } from 'typeorm'
// import { ApiPropertyOptional } from '@nestjs/swagger'
// import { IsOptional, IsString } from 'class-validator'

// @Entity('copilot_store_vectors')
// export class CopilotStoreVector extends TenantOrganizationBaseEntity implements ICopilotStoreVector {
//     @ApiPropertyOptional({ type: String })
// 	@IsString()
// 	@IsOptional()
// 	@Column()
// 	prefix: string

// 	@ApiPropertyOptional({ type: String })
// 	@IsString()
// 	@IsOptional()
// 	@Column()
// 	key: string

//     @ApiPropertyOptional({ type: String })
// 	@IsString()
// 	@IsOptional()
// 	@Column()
//     field_name: string

//     @Column(() => 'vector', { 
//         array: true, 
//         transformer: {
//           to: (value: number[]) => value, // Serialize the array as it is
//           from: (value: string) => value.split(',').map((v) => parseFloat(v)), // Deserialize from a string into a number array
//         }
//       })
//     embedding: number[];
// }
