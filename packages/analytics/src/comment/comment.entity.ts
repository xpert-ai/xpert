import { IComment, IIndicator } from "@xpert-ai/contracts";
import { TenantOrganizationBaseEntity } from "@xpert-ai/server-core";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsJSON, IsOptional, IsString } from 'class-validator'
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	RelationId,
} from 'typeorm'
import { Indicator } from "../core/entities/internal";

@Entity('comment')
export class Comment extends TenantOrganizationBaseEntity implements IComment {
    @ApiProperty({ type: () => String })
	@IsOptional()
	@Column({ nullable: true })
	content?: string

    @IsString()
	@IsOptional()
	@Column({ nullable: true })
	parentId?: string

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    options?: any

    /**
     * Indicator
     */
    @ApiProperty({ type: () => String })
    @RelationId((it: Comment) => it.indicator)
    @IsString()
    @Column({ nullable: true })
    indicatorId?: string

    @ApiProperty({ type: () => Indicator })
    @ManyToOne(() => Indicator, {
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    indicator?: IIndicator
}
