import { UserOrganizationCreateHandler } from "./user-organization.create.handler";
import { UserOrganizationDeleteHandler } from "./user-organization.delete.handler";

export const CommandHandlers = [
    UserOrganizationDeleteHandler,
    UserOrganizationCreateHandler
];