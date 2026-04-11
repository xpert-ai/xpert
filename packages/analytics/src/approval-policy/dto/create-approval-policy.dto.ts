import { IApprovalPolicyCreateInput } from "@xpert-ai/contracts";
import { ApprovalPolicyDTO } from "./approval-policy.dto";

/**
 * Create approval policy request DTO validation
 */
export class CreateApprovalPolicyDTO extends ApprovalPolicyDTO
    implements IApprovalPolicyCreateInput {}