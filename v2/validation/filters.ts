/**
 * Filter Validation Module
 *
 * Config-driven validation for filter types.
 * Checks that only supported filter types are used.
 */

import { ValidationConfig } from '../config/types';

// =============================================================================
// TYPES
// =============================================================================

export interface FilterValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  usedFilters: {
    string: string[];
    numeric: string[];
    null: string[];
  };
}

// =============================================================================
// FILTER TYPE EXTRACTORS
// =============================================================================

/**
 * Extract all string filter types used in a filter (recursively)
 */
export function extractStringFilterTypes(filter: unknown): Set<string> {
  const types = new Set<string>();

  if (!filter || typeof filter !== 'object') return types;

  const f = filter as Record<string, unknown>;

  // Column filter with string type
  if (f.columnFilterRule) {
    const rule = f.columnFilterRule as Record<string, unknown>;
    const columnFilter = rule.filter as Record<string, unknown>;
    const strFilter = columnFilter?.stringColumnFilter as Record<string, unknown>;
    if (strFilter?.type) {
      types.add(strFilter.type as string);
    }
  }

  // Recurse into compound filters
  if (f.orFilterRule) {
    const rule = f.orFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractStringFilterTypes(subFilter).forEach(t => types.add(t));
      }
    }
  }

  if (f.andFilterRule) {
    const rule = f.andFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractStringFilterTypes(subFilter).forEach(t => types.add(t));
      }
    }
  }

  if (f.notFilterRule) {
    const rule = f.notFilterRule as Record<string, unknown>;
    extractStringFilterTypes(rule.filter).forEach(t => types.add(t));
  }

  return types;
}

/**
 * Extract all numeric filter types used in a filter (recursively)
 */
export function extractNumericFilterTypes(filter: unknown): Set<string> {
  const types = new Set<string>();

  if (!filter || typeof filter !== 'object') return types;

  const f = filter as Record<string, unknown>;

  // Column filter with numeric type
  if (f.columnFilterRule) {
    const rule = f.columnFilterRule as Record<string, unknown>;
    const columnFilter = rule.filter as Record<string, unknown>;
    const numFilter = columnFilter?.numericColumnFilter as Record<string, unknown>;
    if (numFilter?.type) {
      types.add(numFilter.type as string);
    }
  }

  // Recurse into compound filters
  if (f.orFilterRule) {
    const rule = f.orFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractNumericFilterTypes(subFilter).forEach(t => types.add(t));
      }
    }
  }

  if (f.andFilterRule) {
    const rule = f.andFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractNumericFilterTypes(subFilter).forEach(t => types.add(t));
      }
    }
  }

  if (f.notFilterRule) {
    const rule = f.notFilterRule as Record<string, unknown>;
    extractNumericFilterTypes(rule.filter).forEach(t => types.add(t));
  }

  return types;
}

/**
 * Extract all null filter types used in a filter (recursively)
 */
export function extractNullFilterTypes(filter: unknown): Set<string> {
  const types = new Set<string>();

  if (!filter || typeof filter !== 'object') return types;

  const f = filter as Record<string, unknown>;

  // Column filter with null type
  if (f.columnFilterRule) {
    const rule = f.columnFilterRule as Record<string, unknown>;
    const columnFilter = rule.filter as Record<string, unknown>;
    const nullFilter = columnFilter?.nullColumnFilter as Record<string, unknown>;
    if (nullFilter?.type) {
      types.add(nullFilter.type as string);
    }
  }

  // Recurse into compound filters
  if (f.orFilterRule) {
    const rule = f.orFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractNullFilterTypes(subFilter).forEach(t => types.add(t));
      }
    }
  }

  if (f.andFilterRule) {
    const rule = f.andFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractNullFilterTypes(subFilter).forEach(t => types.add(t));
      }
    }
  }

  if (f.notFilterRule) {
    const rule = f.notFilterRule as Record<string, unknown>;
    extractNullFilterTypes(rule.filter).forEach(t => types.add(t));
  }

  return types;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate filter types against config-driven rules
 */
export function validateFilterTypes(
  logic: unknown,
  validationConfig: ValidationConfig
): FilterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract filter from rule logic
  const l = logic as Record<string, unknown>;
  const strategy = l?.strategy as Record<string, unknown>;
  const filterNode = strategy?.filterNode as Record<string, unknown>;
  const filter = filterNode?.filter;

  // Extract all filter types used
  const stringTypes = Array.from(extractStringFilterTypes(filter));
  const numericTypes = Array.from(extractNumericFilterTypes(filter));
  const nullTypes = Array.from(extractNullFilterTypes(filter));

  // Validate string filters
  for (const filterType of stringTypes) {
    if (validationConfig.unsupportedStringFilters?.includes(filterType)) {
      errors.push(
        `String filter type "${filterType}" is not supported. ` +
        `Use one of: ${validationConfig.supportedStringFilters.join(', ')}`
      );
    } else if (!validationConfig.supportedStringFilters.includes(filterType)) {
      warnings.push(
        `String filter type "${filterType}" is not in the list of tested filters. ` +
        `It may not render correctly in the UI.`
      );
    }
  }

  // Validate numeric filters
  if (validationConfig.supportedNumericFilters?.length) {
    for (const filterType of numericTypes) {
      if (!validationConfig.supportedNumericFilters.includes(filterType)) {
        warnings.push(
          `Numeric filter type "${filterType}" is not in the list of tested filters.`
        );
      }
    }
  }

  // Validate null filters
  if (validationConfig.supportedNullFilters?.length) {
    for (const filterType of nullTypes) {
      if (!validationConfig.supportedNullFilters.includes(filterType)) {
        warnings.push(
          `Null filter type "${filterType}" is not in the list of tested filters.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    usedFilters: {
      string: stringTypes,
      numeric: numericTypes,
      null: nullTypes
    }
  };
}

/**
 * Check common filter type mistakes and suggest corrections
 */
export function suggestCorrections(filterType: string): string | null {
  const corrections: Record<string, string> = {
    'REGEX': 'MATCHES',
    'WILDCARD': 'EQUALS_WITH_WILDCARDS',
    'IS_NULL': 'NULL',
    'IS_NOT_NULL': 'NOT_NULL',
    'GREATER_THAN_OR_EQUALS': 'GREATER_THAN_OR_EQUAL',
    'LESS_THAN_OR_EQUALS': 'LESS_THAN_OR_EQUAL',
    'GTE': 'GREATER_THAN_OR_EQUAL',
    'LTE': 'LESS_THAN_OR_EQUAL',
    'GT': 'GREATER_THAN',
    'LT': 'LESS_THAN',
    'EQ': 'EQUALS',
    'NEQ': 'Use NOT(EQUALS) instead',
    'NOT_EQUALS': 'Use NOT(EQUALS) instead'
  };

  return corrections[filterType] || null;
}

/**
 * Get ignoreWhitespace requirement for string filter types
 */
export function requiresIgnoreWhitespace(filterType: string): boolean {
  // These types require ignoreWhitespace: true to work correctly
  return ['CONTAINS', 'MATCHES', 'EQUALS_WITH_WILDCARDS'].includes(filterType);
}

/**
 * Validate ignoreWhitespace settings in string filters
 */
export function validateIgnoreWhitespace(filter: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  validateIgnoreWhitespaceRecursive(filter, errors);

  return { valid: errors.length === 0, errors };
}

function validateIgnoreWhitespaceRecursive(filter: unknown, errors: string[]): void {
  if (!filter || typeof filter !== 'object') return;

  const f = filter as Record<string, unknown>;

  // Check string column filter
  if (f.columnFilterRule) {
    const rule = f.columnFilterRule as Record<string, unknown>;
    const columnFilter = rule.filter as Record<string, unknown>;
    const strFilter = columnFilter?.stringColumnFilter as Record<string, unknown>;

    if (strFilter) {
      const filterType = strFilter.type as string;
      const ignoreWhitespace = strFilter.ignoreWhitespace as boolean;

      if (requiresIgnoreWhitespace(filterType) && ignoreWhitespace !== true) {
        errors.push(
          `String filter type "${filterType}" requires ignoreWhitespace: true, ` +
          `but got: ${ignoreWhitespace}`
        );
      }
    }
  }

  // Recurse into compound filters
  if (f.orFilterRule) {
    const rule = f.orFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        validateIgnoreWhitespaceRecursive(subFilter, errors);
      }
    }
  }

  if (f.andFilterRule) {
    const rule = f.andFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        validateIgnoreWhitespaceRecursive(subFilter, errors);
      }
    }
  }

  if (f.notFilterRule) {
    const rule = f.notFilterRule as Record<string, unknown>;
    validateIgnoreWhitespaceRecursive(rule.filter, errors);
  }
}

/**
 * Get a summary of all filter types used
 */
export function getFilterSummary(logic: unknown): {
  stringFilters: string[];
  numericFilters: string[];
  nullFilters: string[];
  hasCompoundFilters: boolean;
} {
  const l = logic as Record<string, unknown>;
  const strategy = l?.strategy as Record<string, unknown>;
  const filterNode = strategy?.filterNode as Record<string, unknown>;
  const filter = filterNode?.filter as Record<string, unknown>;

  return {
    stringFilters: Array.from(extractStringFilterTypes(filter)),
    numericFilters: Array.from(extractNumericFilterTypes(filter)),
    nullFilters: Array.from(extractNullFilterTypes(filter)),
    hasCompoundFilters: !!(filter?.orFilterRule || filter?.andFilterRule || filter?.notFilterRule)
  };
}
