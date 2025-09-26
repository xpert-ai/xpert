/**
 * 通用 UI Schema 字段定义
 */
export interface ISchemaUIBase {
  component: string;       // UI 组件类型
  label?: string;          // 字段标签
  description?: string;    // 字段说明
  placeholder?: string;    // 输入占位符
  order?: number;          // UI 显示顺序
  required?: boolean;      // 是否必填
  visibleWhen?: Record<string, any>; // 条件渲染
  enabledWhen?: Record<string, any>; // 条件启用
}

/**
 * Secret 字段扩展
 */
export interface ISchemaSecretField extends ISchemaUIBase {
  component: 'secretInput';   // 固定组件类型
  revealable?: boolean;       // 是否允许明文显示（👁 按钮）
  maskSymbol?: string;        // 遮罩符号（默认 *）
  persist?: boolean;          // 是否持久保存，false 表示仅运行时使用
}
