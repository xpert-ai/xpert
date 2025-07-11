import { SetMetadata } from '@nestjs/common';

import { MetadataKey } from '../types/metadata.type';

export interface IResource {
    name: string;
    description: string;
    parameters?: any;
}

export const Resource = (props: IResource) => {
    return SetMetadata(MetadataKey.MCP_RESOURCE, props);
};
