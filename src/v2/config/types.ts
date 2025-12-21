/**
 * Configuration Types for proposal-cli-v2
 *
 * Defines all interfaces for workflow configuration, validation rules,
 * SDK settings, and conventions.
 */

// =============================================================================
// MAIN CONFIG INTERFACE
// =============================================================================

export interface WorkflowConfig {
  version: string;
  workflow: WorkflowDefinition;
  foundry: FoundryConnection;
  sdk: SdkConfig;
  validation: ValidationConfig;
  conventions: ConventionConfig;
  templates?: TemplateConfig[];
}

// =============================================================================
// WORKFLOW DEFINITION
// =============================================================================

export interface WorkflowDefinition {
  name: string;
  workflowRid: string;
  objectType: ObjectTypeConfig;
  output: OutputConfig;
}

export interface ObjectTypeConfig {
  id: string;
  dynamicLookup: boolean;
  properties: PropertyDefinition[];
}

export interface PropertyDefinition {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'timestamp';
  description?: string;
  nullable?: boolean;
}

export interface OutputConfig {
  id: string;
  version: string;
  parameters?: OutputParameterConfig[];
}

export interface OutputParameterConfig {
  id: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
}

// =============================================================================
// FOUNDRY CONNECTION
// =============================================================================

export interface FoundryConnection {
  url: string;           // Supports ${ENV_VAR} syntax
  ontologyRid: string;   // Supports ${ENV_VAR} syntax
  tokenEnvVar: string;   // Name of env var containing token
}

// =============================================================================
// SDK CONFIG
// =============================================================================

export interface SdkConfig {
  packageName: string;
  archetypes: ArchetypeConfig;
  actions: ActionConfig;
}

export interface ArchetypeConfig {
  proposal: string;
  rule: string;
}

export interface ActionConfig {
  createProposal: string;
  approveProposal: string;
  rejectProposal: string;
  editProposal: string;
}

// =============================================================================
// VALIDATION CONFIG
// =============================================================================

export interface ValidationConfig {
  grammarVersion: string;
  supportedStrategyTypes: string[];
  supportedStringFilters: string[];
  unsupportedStringFilters: string[];
  supportedNumericFilters: string[];
  supportedNullFilters: string[];
}

// =============================================================================
// CONVENTION CONFIG
// =============================================================================

export interface ConventionConfig {
  proposalIdPrefix: string;
  ruleIdPrefix: string;
  defaultAuthor: string;
  defaultDescription?: string;
  defaultKeywords?: string;
}

// =============================================================================
// TEMPLATE CONFIG
// =============================================================================

export interface TemplateConfig {
  name: string;
  description?: string;
  file?: string;       // Path to external template file
  inline?: InlineTemplateConfig;
}

export interface InlineTemplateConfig {
  propertyId: string;
  comparison: string;
  value?: string | number | boolean;
  values?: (string | number)[];
}

// =============================================================================
// RESOLVED CONFIG (after env var resolution)
// =============================================================================

export interface ResolvedFoundryConnection {
  url: string;
  ontologyRid: string;
  token: string;
}

export interface ResolvedConfig extends Omit<WorkflowConfig, 'foundry'> {
  foundry: ResolvedFoundryConnection;
}
