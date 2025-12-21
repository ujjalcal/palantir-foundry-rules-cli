/**
 * Schema Validation Module
 *
 * Config-driven structure validation for rule logic.
 * Uses ValidationConfig from workflow config to determine valid types.
 */

import { ValidationConfig } from '../config/types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// =============================================================================
// SCHEMA VALIDATOR
// =============================================================================

/**
 * Validate rule logic structure against config-driven rules
 */
export function validateRuleLogic(
  logic: unknown,
  validationConfig: ValidationConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!logic || typeof logic !== 'object') {
    return { valid: false, errors: ['Root must be an object'] };
  }

  const l = logic as Record<string, unknown>;

  // Required fields
  if (l.grammarVersion !== validationConfig.grammarVersion) {
    errors.push(
      `grammarVersion must be '${validationConfig.grammarVersion}', got: ${l.grammarVersion}`
    );
  }

  if (!l.workflowRid || typeof l.workflowRid !== 'string') {
    errors.push('workflowRid is required and must be a string');
  }

  // Strategy validation
  if (!l.strategy || typeof l.strategy !== 'object') {
    errors.push('strategy is required and must be an object');
  } else {
    const strategy = l.strategy as Record<string, unknown>;
    const strategyType = strategy.type as string;

    if (!validationConfig.supportedStrategyTypes.includes(strategyType)) {
      errors.push(
        `strategy.type must be one of [${validationConfig.supportedStrategyTypes.join(', ')}], got: ${strategyType}`
      );
    }

    // Check that the corresponding node exists
    if (strategyType && !strategy[strategyType]) {
      errors.push(`strategy.${strategyType} is required when type is '${strategyType}'`);
    }

    // Check for common mistakes in filterNode
    if (strategyType === 'filterNode') {
      const filterNode = strategy.filterNode as Record<string, unknown> | undefined;
      if (filterNode && 'type' in filterNode) {
        errors.push('filterNode should NOT have a type field (type goes in strategy)');
      }
    }
  }

  // Effect validation
  if (!l.effect || typeof l.effect !== 'object') {
    errors.push('effect is required and must be an object');
  } else {
    const effect = l.effect as Record<string, unknown>;
    if (effect.type !== 'v2') {
      errors.push(`effect.type must be 'v2', got: ${effect.type}`);
    }
    if (!effect.v2 || typeof effect.v2 !== 'object') {
      errors.push('effect.v2 is required');
    } else {
      const v2 = effect.v2 as Record<string, unknown>;
      if (!v2.outputAndVersion) {
        errors.push('effect.v2.outputAndVersion is required');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Extract the strategy type from rule logic
 */
export function getStrategyType(logic: unknown): string | null {
  if (!logic || typeof logic !== 'object') return null;
  const l = logic as Record<string, unknown>;
  const strategy = l.strategy as Record<string, unknown> | undefined;
  return (strategy?.type as string) || null;
}

/**
 * Extract the object type ID from rule logic (works with any node type)
 */
export function extractObjectTypeId(logic: unknown): string | null {
  if (!logic || typeof logic !== 'object') return null;

  const l = logic as Record<string, unknown>;
  const strategy = l.strategy as Record<string, unknown> | undefined;

  if (!strategy) return null;

  // Try each node type
  const nodeTypes = ['filterNode', 'windowNode', 'aggregationNode'];

  for (const nodeType of nodeTypes) {
    const node = strategy[nodeType] as Record<string, unknown> | undefined;
    const source = (node?.nodeInput as Record<string, unknown>)?.source as Record<string, unknown>;
    if (source?.objectTypeId) {
      return source.objectTypeId as string;
    }
  }

  return null;
}

/**
 * Extract the workflow RID from rule logic
 */
export function extractWorkflowRid(logic: unknown): string | null {
  if (!logic || typeof logic !== 'object') return null;
  return (logic as Record<string, unknown>).workflowRid as string || null;
}

/**
 * Validate that workflowRid matches expected value
 */
export function validateWorkflowRid(
  logic: unknown,
  expectedRid: string
): ValidationResult {
  const errors: string[] = [];
  const actualRid = extractWorkflowRid(logic);

  if (!actualRid) {
    errors.push('workflowRid not found in rule logic');
  } else if (actualRid !== expectedRid) {
    errors.push(
      `workflowRid mismatch: expected '${expectedRid}', got '${actualRid}'`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that objectTypeId matches expected value
 */
export function validateObjectType(
  logic: unknown,
  expectedId: string
): ValidationResult {
  const errors: string[] = [];
  const actualId = extractObjectTypeId(logic);

  if (!actualId) {
    errors.push('objectTypeId not found in rule logic');
  } else if (actualId !== expectedId) {
    errors.push(
      `objectTypeId mismatch: expected '${expectedId}', got '${actualId}'`
    );
  }

  return { valid: errors.length === 0, errors };
}
