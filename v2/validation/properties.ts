/**
 * Property Validation Module
 *
 * Validates that properties used in rule logic exist on the object type.
 * Supports both static (config-defined) and dynamic (API-fetched) validation.
 */

import { ObjectTypeConfig, PropertyDefinition } from '../config/types';

// =============================================================================
// TYPES
// =============================================================================

export interface PropertyValidationResult {
  valid: boolean;
  errors: string[];
  usedProperties: string[];
  validProperties: string[];
}

// =============================================================================
// PROPERTY EXTRACTORS
// =============================================================================

/**
 * Extract all property IDs used in a filter (recursively)
 */
export function extractPropertiesFromFilter(filter: unknown): Set<string> {
  const properties = new Set<string>();

  if (!filter || typeof filter !== 'object') return properties;

  const f = filter as Record<string, unknown>;

  // Column filter - extract property
  if (f.columnFilterRule) {
    const rule = f.columnFilterRule as Record<string, unknown>;
    const column = rule.column as Record<string, unknown>;
    const objProp = column?.objectProperty as Record<string, unknown>;
    if (objProp?.propertyTypeId) {
      properties.add(objProp.propertyTypeId as string);
    }
  }

  // OR filter - recurse into sub-filters
  if (f.orFilterRule) {
    const rule = f.orFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractPropertiesFromFilter(subFilter).forEach(p => properties.add(p));
      }
    }
  }

  // AND filter - recurse into sub-filters
  if (f.andFilterRule) {
    const rule = f.andFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        extractPropertiesFromFilter(subFilter).forEach(p => properties.add(p));
      }
    }
  }

  // NOT filter - recurse into inner filter
  if (f.notFilterRule) {
    const rule = f.notFilterRule as Record<string, unknown>;
    extractPropertiesFromFilter(rule.filter).forEach(p => properties.add(p));
  }

  return properties;
}

/**
 * Extract property from a column reference
 */
function extractPropertyFromColumn(column: unknown): string | null {
  if (!column || typeof column !== 'object') return null;
  const c = column as Record<string, unknown>;
  const objProp = c.objectProperty as Record<string, unknown>;
  return (objProp?.propertyTypeId as string) || null;
}

/**
 * Extract all property IDs used in windowNode
 */
export function extractPropertiesFromWindowNode(node: unknown): Set<string> {
  const properties = new Set<string>();

  if (!node || typeof node !== 'object') return properties;

  const n = node as Record<string, unknown>;

  // columnsToAdd
  const columnsToAdd = n.columnsToAdd as unknown[];
  if (Array.isArray(columnsToAdd)) {
    for (const col of columnsToAdd) {
      const c = col as Record<string, unknown>;
      const def = c.columnDefinition as Record<string, unknown>;
      const propId = extractPropertyFromColumn(def?.column);
      if (propId) properties.add(propId);
    }
  }

  // partitionBy
  const partitionBy = n.partitionBy as unknown[];
  if (Array.isArray(partitionBy)) {
    for (const col of partitionBy) {
      const propId = extractPropertyFromColumn(col);
      if (propId) properties.add(propId);
    }
  }

  return properties;
}

/**
 * Extract all property IDs used in aggregationNode
 */
export function extractPropertiesFromAggregationNode(node: unknown): Set<string> {
  const properties = new Set<string>();

  if (!node || typeof node !== 'object') return properties;

  const n = node as Record<string, unknown>;

  // columnsToAdd
  const columnsToAdd = n.columnsToAdd as unknown[];
  if (Array.isArray(columnsToAdd)) {
    for (const col of columnsToAdd) {
      const c = col as Record<string, unknown>;
      const def = c.columnDefinition as Record<string, unknown>;
      const propId = extractPropertyFromColumn(def?.aggregationColumn);
      if (propId) properties.add(propId);
    }
  }

  // groupByColumns
  const groupByColumns = n.groupByColumns as unknown[];
  if (Array.isArray(groupByColumns)) {
    for (const col of groupByColumns) {
      const c = col as Record<string, unknown>;
      const propId = extractPropertyFromColumn(c.column);
      if (propId) properties.add(propId);
    }
  }

  return properties;
}

/**
 * Extract all property IDs used in rule logic (any node type)
 */
export function extractAllProperties(logic: unknown): Set<string> {
  const properties = new Set<string>();

  if (!logic || typeof logic !== 'object') return properties;

  const l = logic as Record<string, unknown>;
  const strategy = l.strategy as Record<string, unknown>;

  if (!strategy) return properties;

  // filterNode
  if (strategy.filterNode) {
    const node = strategy.filterNode as Record<string, unknown>;
    extractPropertiesFromFilter(node.filter).forEach(p => properties.add(p));
  }

  // windowNode
  if (strategy.windowNode) {
    extractPropertiesFromWindowNode(strategy.windowNode).forEach(p => properties.add(p));
  }

  // aggregationNode
  if (strategy.aggregationNode) {
    extractPropertiesFromAggregationNode(strategy.aggregationNode).forEach(p => properties.add(p));
  }

  // Also extract from effect parameterValues (column type)
  const effect = l.effect as Record<string, unknown>;
  const v2 = effect?.v2 as Record<string, unknown>;
  const parameterValues = v2?.parameterValues as Record<string, unknown>;
  if (parameterValues) {
    for (const [, value] of Object.entries(parameterValues)) {
      const v = value as Record<string, unknown>;
      if (v?.type === 'column') {
        const propId = extractPropertyFromColumn(v.column);
        if (propId) properties.add(propId);
      }
    }
  }

  return properties;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate properties against object type config (static validation)
 */
export function validateProperties(
  logic: unknown,
  objectTypeConfig: ObjectTypeConfig
): PropertyValidationResult {
  const errors: string[] = [];

  // Extract used properties
  const usedProperties = extractAllProperties(logic);
  const usedList = Array.from(usedProperties);

  // Get valid properties from config
  const validProperties = objectTypeConfig.properties.map(p => p.id);

  // Check each used property
  for (const prop of usedList) {
    if (!validProperties.includes(prop)) {
      errors.push(
        `Property "${prop}" does not exist on object type "${objectTypeConfig.id}". ` +
        `Valid properties: ${validProperties.join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    usedProperties: usedList,
    validProperties
  };
}

/**
 * Validate property type compatibility
 * Ensures numeric properties are used with numeric filters, etc.
 */
export function validatePropertyTypes(
  logic: unknown,
  objectTypeConfig: ObjectTypeConfig
): PropertyValidationResult {
  const errors: string[] = [];
  const usedProperties: string[] = [];
  const validProperties = objectTypeConfig.properties.map(p => p.id);

  // Build property type map
  const propTypes = new Map<string, PropertyDefinition['type']>();
  for (const prop of objectTypeConfig.properties) {
    propTypes.set(prop.id, prop.type);
  }

  // Extract filters and check type compatibility
  const l = logic as Record<string, unknown>;
  const strategy = l?.strategy as Record<string, unknown>;
  const filterNode = strategy?.filterNode as Record<string, unknown>;

  if (filterNode?.filter) {
    validateFilterPropertyTypes(
      filterNode.filter,
      propTypes,
      errors,
      usedProperties
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    usedProperties,
    validProperties
  };
}

/**
 * Recursively validate property types in filters
 */
function validateFilterPropertyTypes(
  filter: unknown,
  propTypes: Map<string, PropertyDefinition['type']>,
  errors: string[],
  usedProperties: string[]
): void {
  if (!filter || typeof filter !== 'object') return;

  const f = filter as Record<string, unknown>;

  // Column filter
  if (f.columnFilterRule) {
    const rule = f.columnFilterRule as Record<string, unknown>;
    const column = rule.column as Record<string, unknown>;
    const objProp = column?.objectProperty as Record<string, unknown>;
    const propId = objProp?.propertyTypeId as string;
    const columnFilter = rule.filter as Record<string, unknown>;

    if (propId) {
      usedProperties.push(propId);
      const expectedType = propTypes.get(propId);

      if (expectedType && columnFilter) {
        // Check filter type matches property type
        if (columnFilter.stringColumnFilter && expectedType !== 'string') {
          errors.push(
            `Property "${propId}" is type "${expectedType}" but used with stringColumnFilter`
          );
        }
        if (columnFilter.numericColumnFilter && expectedType !== 'number') {
          errors.push(
            `Property "${propId}" is type "${expectedType}" but used with numericColumnFilter`
          );
        }
      }
    }
  }

  // Recurse into compound filters
  if (f.orFilterRule) {
    const rule = f.orFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        validateFilterPropertyTypes(subFilter, propTypes, errors, usedProperties);
      }
    }
  }

  if (f.andFilterRule) {
    const rule = f.andFilterRule as Record<string, unknown>;
    const filters = rule.filters as unknown[];
    if (Array.isArray(filters)) {
      for (const subFilter of filters) {
        validateFilterPropertyTypes(subFilter, propTypes, errors, usedProperties);
      }
    }
  }

  if (f.notFilterRule) {
    const rule = f.notFilterRule as Record<string, unknown>;
    validateFilterPropertyTypes(rule.filter, propTypes, errors, usedProperties);
  }
}

/**
 * Get a summary of properties used in rule logic
 */
export function getPropertySummary(logic: unknown): {
  properties: string[];
  count: number;
} {
  const properties = Array.from(extractAllProperties(logic));
  return {
    properties,
    count: properties.length
  };
}
