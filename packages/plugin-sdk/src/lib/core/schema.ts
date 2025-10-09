/**
 * Common UI Schema field definitions
 */
export interface ISchemaUIBase {
  component: string;       // UI component type
  label?: string;          // Field label
  description?: string;    // Field description
  placeholder?: string;    // Input placeholder
  order?: number;          // UI display order
  required?: boolean;      // Whether the field is required
  visibleWhen?: Record<string, any>; // Conditional rendering
  enabledWhen?: Record<string, any>; // Conditional enabling
}

/**
 * Secret field extensions
 */
export interface ISchemaSecretField extends ISchemaUIBase {
  component: 'secretInput';   // Fixed component type
  revealable?: boolean;       // Whether plaintext display is allowed (👁 button)
  maskSymbol?: string;        // Mask symbol (default *)
  persist?: boolean;          // Whether to persist, false means only used at runtime
}
