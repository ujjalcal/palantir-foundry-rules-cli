/**
 * Foundry Rules CLI - Library Exports
 *
 * This module exports core functions for use as a library.
 * Import this in TypeScript Functions or other Node.js code.
 *
 * Usage:
 *   import { createProposal, validateProposal, compress } from '@foundry-tools/foundry-rules-cli';
 */

import { createPlatformClient } from '@osdk/client';
import { Actions } from '@osdk/foundry.ontologies';

// Re-export v2 modules
export * from './v2/index.js';

// Re-export specific functions for convenience
export {
  loadConfig,
  type ResolvedConfig,
  type LoadResult,
} from './v2/config/index.js';

export {
  validateRuleLogic,
  extractObjectTypeId,
  extractWorkflowRid,
} from './v2/validation/schema.js';

export {
  validateProperties,
  getPropertySummary,
} from './v2/validation/properties.js';

export {
  validateFilterTypes,
  getFilterSummary,
} from './v2/validation/filters.js';

export {
  compress,
  decompress,
  getCompressedValue,
  wrapCompressedValue,
  getCompressionStats,
} from './v2/compression.js';

export {
  buildFromTemplate,
  getBuiltInTemplates,
  wrapFilterAsRuleLogic,
} from './v2/templates/index.js';

// =============================================================================
// LIBRARY FUNCTIONS
// =============================================================================

import { loadConfig, ResolvedConfig } from './v2/config/index.js';
import { validateRuleLogic } from './v2/validation/schema.js';
import { validateProperties } from './v2/validation/properties.js';
import { validateFilterTypes } from './v2/validation/filters.js';
import { compress } from './v2/compression.js';
import { buildFromTemplate } from './v2/templates/index.js';

/**
 * Proposal input structure
 */
export interface ProposalInput {
  /** Rule name */
  name?: string;
  /** Rule description */
  description?: string;
  /** Keywords (comma-separated) */
  keywords?: string;
  /** Template name (e.g., 'string-equals') */
  template?: string;
  /** Template parameters */
  params?: Record<string, unknown>;
  /** Raw rule logic (if not using template) */
  logic?: unknown;
}

/**
 * Result of proposal creation
 */
export interface CreateProposalResult {
  success: boolean;
  proposalId: string;
  ruleId: string;
  compressedLogic: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  structureErrors: string[];
  propertyErrors: string[];
  filterErrors: string[];
  filterWarnings: string[];
}

/**
 * Validate a proposal without creating it
 *
 * @param proposal - The proposal input
 * @param config - Resolved config (from loadConfig)
 * @returns Validation result with any errors
 */
export function validateProposal(
  proposal: ProposalInput,
  config: ResolvedConfig
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    structureErrors: [],
    propertyErrors: [],
    filterErrors: [],
    filterWarnings: [],
  };

  // Build logic from template if needed
  let logic: unknown;
  if (proposal.template && proposal.params) {
    const buildResult = buildFromTemplate(
      proposal.template,
      proposal.params,
      config.workflow
    );

    if (!buildResult.success || !buildResult.logic) {
      result.valid = false;
      result.structureErrors = buildResult.errors || ['Template build failed'];
      return result;
    }

    logic = buildResult.logic;
  } else if (proposal.logic) {
    logic = proposal.logic;
  } else {
    result.valid = false;
    result.structureErrors = ['Either template+params or logic must be provided'];
    return result;
  }

  // Structure validation
  const structureResult = validateRuleLogic(logic, config.validation);
  result.structureErrors = structureResult.errors;

  if (!structureResult.valid) {
    result.valid = false;
    return result;
  }

  // Property validation
  const propResult = validateProperties(logic, config.workflow.objectType);
  result.propertyErrors = propResult.errors;

  if (!propResult.valid) {
    result.valid = false;
  }

  // Filter validation
  const filterResult = validateFilterTypes(logic, config.validation);
  result.filterErrors = filterResult.errors;
  result.filterWarnings = filterResult.warnings;

  if (!filterResult.valid) {
    result.valid = false;
  }

  return result;
}

/**
 * Create a proposal in Foundry Rules
 *
 * This is the library version of the CLI create command.
 * It validates, compresses, and creates the proposal via Action API.
 *
 * @param proposal - The proposal input
 * @param config - Resolved config (from loadConfig)
 * @returns Result with proposal ID and rule ID
 * @throws Error if validation fails or API call fails
 */
export async function createProposal(
  proposal: ProposalInput,
  config: ResolvedConfig
): Promise<CreateProposalResult> {
  // Validate first
  const validation = validateProposal(proposal, config);

  if (!validation.valid) {
    const allErrors = [
      ...validation.structureErrors.map(e => `[Structure] ${e}`),
      ...validation.propertyErrors.map(e => `[Property] ${e}`),
      ...validation.filterErrors.map(e => `[Filter] ${e}`),
    ];
    throw new Error(`Validation failed:\n${allErrors.join('\n')}`);
  }

  // Build logic from template if needed
  let logic: unknown;
  if (proposal.template && proposal.params) {
    const buildResult = buildFromTemplate(
      proposal.template,
      proposal.params,
      config.workflow
    );
    logic = buildResult.logic;
  } else {
    logic = proposal.logic;
  }

  // Compress
  const compressed = compress(logic);

  // Generate IDs
  const timestamp = Date.now();
  const proposalId = `${config.conventions.proposalIdPrefix}${timestamp}`;
  const ruleId = `${config.conventions.ruleIdPrefix}${timestamp}`;

  // Get values
  const name = proposal.name || `Rule-${timestamp}`;
  const description = proposal.description || config.conventions.defaultDescription || 'Created via library';
  const keywords = proposal.keywords || config.conventions.defaultKeywords || 'library-created';

  // Create Foundry client
  const token = config.foundry.token;
  if (!token) {
    throw new Error('FOUNDRY_TOKEN not set in config');
  }

  const client = createPlatformClient(config.foundry.url, async () => token);
  const ontologyId = config.foundry.ontologyRid;
  const actionApiName = config.sdk.actions.createProposal;

  // Call Action API
  await Actions.apply(client, ontologyId, actionApiName, {
    parameters: {
      proposal_id: proposalId,
      rule_id: ruleId,
      new_rule_name: name,
      new_rule_description: description,
      new_logic: compressed,
      new_logic_keywords: keywords,
      proposal_author: config.conventions.defaultAuthor,
      proposal_creation_timestamp: new Date().toISOString(),
    }
  });

  return {
    success: true,
    proposalId,
    ruleId,
    compressedLogic: compressed,
  };
}

/**
 * Load config from a JSON file or object
 *
 * Convenience wrapper around loadConfig that accepts either a path or object.
 *
 * @param configPathOrObject - Path to config file or config object
 * @returns Resolved config
 * @throws Error if config is invalid
 */
export function resolveConfig(
  configPathOrObject: string | Record<string, unknown>
): ResolvedConfig {
  if (typeof configPathOrObject === 'string') {
    const result = loadConfig(configPathOrObject, { validateToken: false });
    if (!result.success || !result.config) {
      throw new Error(`Config loading failed: ${result.errors?.join(', ')}`);
    }
    return result.config;
  } else {
    // Object passed directly - need to validate and resolve
    // For now, assume it's already resolved
    return configPathOrObject as unknown as ResolvedConfig;
  }
}
