/**
 * Template Loader and Builder
 *
 * Loads template definitions and builds rule logic from templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TemplateConfig, WorkflowDefinition } from '../config/types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TemplateDefinition {
  name: string;
  description?: string;
  category?: string;
  parameters: Record<string, TemplateParameter>;
  example?: Record<string, unknown>;
  templateLogic: unknown;
}

export interface TemplateParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  items?: { type: string };
  required: boolean;
  default?: unknown;
  description?: string;
  placeholder?: unknown;
}

export interface TemplateContext {
  workflowRid: string;
  objectTypeId: string;
  outputId: string;
  outputVersion: string;
  [key: string]: unknown;
}

export interface BuildResult {
  success: boolean;
  logic?: unknown;
  errors?: string[];
}

// =============================================================================
// TEMPLATE LOADER
// =============================================================================

/**
 * Load a template definition from a file
 */
export function loadTemplate(templatePath: string): TemplateDefinition | null {
  if (!fs.existsSync(templatePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(templatePath, 'utf8');
    return JSON.parse(content) as TemplateDefinition;
  } catch {
    return null;
  }
}

/**
 * Load all templates from config
 */
export function loadTemplates(
  templates: TemplateConfig[],
  baseDir?: string
): Map<string, TemplateDefinition> {
  const loaded = new Map<string, TemplateDefinition>();

  for (const config of templates) {
    if (config.file) {
      const templatePath = baseDir
        ? path.resolve(baseDir, config.file)
        : config.file;

      const template = loadTemplate(templatePath);
      if (template) {
        loaded.set(config.name, template);
      }
    }
  }

  return loaded;
}

/**
 * List available templates from a directory
 */
export function listTemplatesInDirectory(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.basename(f, '.json'));
}

// =============================================================================
// TEMPLATE BUILDER
// =============================================================================

const DEFAULT_MACRO = {
  function: 'VALUE',
  inputType: 'ALL_TYPES',
  outputType: 'ALL_TYPES'
};

/**
 * Build a string equals filter
 */
export function buildStringEqualsFilter(
  objectTypeId: string,
  propertyId: string,
  value: string,
  caseSensitive: boolean = false
): unknown {
  return {
    columnFilterRule: {
      column: {
        objectProperty: { objectTypeId, propertyTypeId: propertyId },
        type: 'objectProperty'
      },
      filter: {
        stringColumnFilter: {
          type: 'EQUALS',
          caseSensitive,
          ignoreWhitespace: false,
          values: [value],
          macro: DEFAULT_MACRO
        },
        type: 'stringColumnFilter'
      }
    },
    type: 'columnFilterRule'
  };
}

/**
 * Build a string OR filter (multiple values)
 */
export function buildStringOrFilter(
  objectTypeId: string,
  propertyId: string,
  values: string[],
  caseSensitive: boolean = false
): unknown {
  const filters = values.map(value =>
    buildStringEqualsFilter(objectTypeId, propertyId, value, caseSensitive)
  );

  return {
    orFilterRule: { filters },
    type: 'orFilterRule'
  };
}

/**
 * Build a numeric comparison filter
 */
export function buildNumericFilter(
  objectTypeId: string,
  propertyId: string,
  comparison: 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL',
  value: number
): unknown {
  return {
    columnFilterRule: {
      column: {
        objectProperty: { objectTypeId, propertyTypeId: propertyId },
        type: 'objectProperty'
      },
      filter: {
        numericColumnFilter: {
          type: comparison,
          values: [value],
          macro: DEFAULT_MACRO
        },
        type: 'numericColumnFilter'
      }
    },
    type: 'columnFilterRule'
  };
}

/**
 * Build a numeric range filter (min <= value <= max)
 */
export function buildNumericRangeFilter(
  objectTypeId: string,
  propertyId: string,
  min?: number,
  max?: number
): unknown {
  const filters: unknown[] = [];

  if (min !== undefined) {
    filters.push(buildNumericFilter(objectTypeId, propertyId, 'GREATER_THAN_OR_EQUAL', min));
  }

  if (max !== undefined) {
    filters.push(buildNumericFilter(objectTypeId, propertyId, 'LESS_THAN_OR_EQUAL', max));
  }

  if (filters.length === 0) {
    throw new Error('Numeric range filter requires at least min or max');
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return {
    andFilterRule: { filters },
    type: 'andFilterRule'
  };
}

/**
 * Build a null check filter
 */
export function buildNullFilter(
  objectTypeId: string,
  propertyId: string,
  isNull: boolean
): unknown {
  return {
    columnFilterRule: {
      column: {
        objectProperty: { objectTypeId, propertyTypeId: propertyId },
        type: 'objectProperty'
      },
      filter: {
        nullColumnFilter: {
          type: isNull ? 'NULL' : 'NOT_NULL'
        },
        type: 'nullColumnFilter'
      }
    },
    type: 'columnFilterRule'
  };
}

/**
 * Wrap a filter in a complete rule logic structure
 */
export function wrapFilterAsRuleLogic(
  filter: unknown,
  workflow: WorkflowDefinition
): unknown {
  return {
    namedStrategies: {},
    strategyComponents: null,
    grammarVersion: 'V1',
    strategy: {
      filterNode: {
        nodeInput: {
          source: { objectTypeId: workflow.objectType.id, type: 'objectTypeId' },
          type: 'source'
        },
        filter,
        joinFilterInputs: {}
      },
      type: 'filterNode'
    },
    workflowRid: workflow.workflowRid,
    effect: {
      v2: {
        outputAndVersion: {
          outputId: workflow.output.id,
          outputVersion: workflow.output.version,
          workflowRid: workflow.workflowRid
        },
        parameterValues: {}
      },
      type: 'v2'
    }
  };
}

// =============================================================================
// HIGH-LEVEL TEMPLATE BUILDER
// =============================================================================

/**
 * Build rule logic from a template name and parameters
 */
export function buildFromTemplate(
  templateName: string,
  params: Record<string, unknown>,
  workflow: WorkflowDefinition
): BuildResult {
  const errors: string[] = [];
  const objectTypeId = workflow.objectType.id;

  try {
    let filter: unknown;

    switch (templateName) {
      case 'string-equals': {
        const propertyId = params.propertyId as string;
        const value = params.value as string;
        const caseSensitive = (params.caseSensitive as boolean) ?? false;

        if (!propertyId) errors.push('Missing required parameter: propertyId');
        if (!value) errors.push('Missing required parameter: value');

        if (errors.length > 0) {
          return { success: false, errors };
        }

        filter = buildStringEqualsFilter(objectTypeId, propertyId, value, caseSensitive);
        break;
      }

      case 'string-or': {
        const propertyId = params.propertyId as string;
        const values = params.values as string[];
        const caseSensitive = (params.caseSensitive as boolean) ?? false;

        if (!propertyId) errors.push('Missing required parameter: propertyId');
        if (!values || !Array.isArray(values) || values.length === 0) {
          errors.push('Missing or empty required parameter: values');
        }

        if (errors.length > 0) {
          return { success: false, errors };
        }

        filter = buildStringOrFilter(objectTypeId, propertyId, values, caseSensitive);
        break;
      }

      case 'numeric-range': {
        const propertyId = params.propertyId as string;
        const min = params.min as number | undefined;
        const max = params.max as number | undefined;

        if (!propertyId) errors.push('Missing required parameter: propertyId');
        if (min === undefined && max === undefined) {
          errors.push('At least one of min or max is required');
        }

        if (errors.length > 0) {
          return { success: false, errors };
        }

        filter = buildNumericRangeFilter(objectTypeId, propertyId, min, max);
        break;
      }

      case 'null-check': {
        const propertyId = params.propertyId as string;
        const isNull = (params.isNull as boolean) ?? true;

        if (!propertyId) errors.push('Missing required parameter: propertyId');

        if (errors.length > 0) {
          return { success: false, errors };
        }

        filter = buildNullFilter(objectTypeId, propertyId, isNull);
        break;
      }

      default:
        return { success: false, errors: [`Unknown template: ${templateName}`] };
    }

    const logic = wrapFilterAsRuleLogic(filter, workflow);
    return { success: true, logic };
  } catch (e) {
    return { success: false, errors: [(e as Error).message] };
  }
}

/**
 * Get available built-in templates
 */
export function getBuiltInTemplates(): Array<{
  name: string;
  description: string;
  parameters: string[];
}> {
  return [
    {
      name: 'string-equals',
      description: 'Simple string equality filter',
      parameters: ['propertyId', 'value', 'caseSensitive?']
    },
    {
      name: 'string-or',
      description: 'OR filter with multiple string values',
      parameters: ['propertyId', 'values[]', 'caseSensitive?']
    },
    {
      name: 'numeric-range',
      description: 'Numeric range filter (min <= value <= max)',
      parameters: ['propertyId', 'min?', 'max?']
    },
    {
      name: 'null-check',
      description: 'Check if property is null or not null',
      parameters: ['propertyId', 'isNull?']
    }
  ];
}
