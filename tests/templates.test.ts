/**
 * Tests for templates module
 * Tests: buildFromTemplate, getBuiltInTemplates, wrapFilterAsRuleLogic, filter builders
 */

import { describe, test, expect } from 'vitest';
import {
  buildFromTemplate,
  getBuiltInTemplates,
  wrapFilterAsRuleLogic,
  buildStringEqualsFilter,
  buildStringOrFilter,
  buildNumericFilter,
  buildNumericRangeFilter,
  buildNullFilter,
} from '../src/v2/templates/loader.js';
import { WorkflowDefinition } from '../src/v2/config/types.js';

// Mock workflow definition
const mockWorkflow: WorkflowDefinition = {
  name: 'Test Workflow',
  workflowRid: 'ri.taurus.main.workflow.test-123',
  objectType: {
    id: 'test.object-type',
    dynamicLookup: false,
    properties: [
      { id: 'name', type: 'string', description: 'Name field' },
      { id: 'price', type: 'number', description: 'Price field' },
      { id: 'status', type: 'string', description: 'Status field' },
    ],
  },
  output: {
    id: 'output-123',
    version: '1.0.0',
    parameters: [],
  },
};

describe('Template Builders', () => {

  describe('buildStringEqualsFilter()', () => {

    test('should build a valid string equals filter', () => {
      const filter = buildStringEqualsFilter('test.obj', 'name', 'John', false);

      expect(filter).toHaveProperty('columnFilterRule');
      const rule = (filter as any).columnFilterRule;

      expect(rule.column.objectProperty.objectTypeId).toBe('test.obj');
      expect(rule.column.objectProperty.propertyTypeId).toBe('name');
      expect(rule.filter.stringColumnFilter.type).toBe('EQUALS');
      expect(rule.filter.stringColumnFilter.values).toEqual(['John']);
      expect(rule.filter.stringColumnFilter.caseSensitive).toBe(false);
    });

    test('should support case sensitive option', () => {
      const filter = buildStringEqualsFilter('test.obj', 'name', 'John', true);
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.stringColumnFilter.caseSensitive).toBe(true);
    });
  });

  describe('buildStringOrFilter()', () => {

    test('should build OR filter with multiple values', () => {
      const filter = buildStringOrFilter('test.obj', 'status', ['active', 'pending']);

      expect(filter).toHaveProperty('orFilterRule');
      const rule = (filter as any).orFilterRule;

      expect(rule.filters).toHaveLength(2);
      expect(rule.filters[0].columnFilterRule.filter.stringColumnFilter.values).toEqual(['active']);
      expect(rule.filters[1].columnFilterRule.filter.stringColumnFilter.values).toEqual(['pending']);
    });

    test('should handle single value', () => {
      const filter = buildStringOrFilter('test.obj', 'status', ['active']);
      const rule = (filter as any).orFilterRule;

      expect(rule.filters).toHaveLength(1);
    });
  });

  describe('buildNumericFilter()', () => {

    test('should build GREATER_THAN filter', () => {
      const filter = buildNumericFilter('test.obj', 'price', 'GREATER_THAN', 100);

      expect(filter).toHaveProperty('columnFilterRule');
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.numericColumnFilter.type).toBe('GREATER_THAN');
      expect(rule.filter.numericColumnFilter.values).toEqual([100]);
    });

    test('should build LESS_THAN filter', () => {
      const filter = buildNumericFilter('test.obj', 'price', 'LESS_THAN', 50);
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.numericColumnFilter.type).toBe('LESS_THAN');
      expect(rule.filter.numericColumnFilter.values).toEqual([50]);
    });

    test('should build EQUALS filter', () => {
      const filter = buildNumericFilter('test.obj', 'price', 'EQUALS', 99);
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.numericColumnFilter.type).toBe('EQUALS');
    });
  });

  describe('buildNumericRangeFilter()', () => {

    test('should build range filter with min and max', () => {
      const filter = buildNumericRangeFilter('test.obj', 'price', 10, 100);

      expect(filter).toHaveProperty('andFilterRule');
      const rule = (filter as any).andFilterRule;

      expect(rule.filters).toHaveLength(2);
      expect(rule.filters[0].columnFilterRule.filter.numericColumnFilter.type).toBe('GREATER_THAN_OR_EQUAL');
      expect(rule.filters[1].columnFilterRule.filter.numericColumnFilter.type).toBe('LESS_THAN_OR_EQUAL');
    });

    test('should build filter with min only', () => {
      const filter = buildNumericRangeFilter('test.obj', 'price', 10, undefined);

      // Should be a single filter, not AND
      expect(filter).toHaveProperty('columnFilterRule');
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.numericColumnFilter.type).toBe('GREATER_THAN_OR_EQUAL');
      expect(rule.filter.numericColumnFilter.values).toEqual([10]);
    });

    test('should build filter with max only', () => {
      const filter = buildNumericRangeFilter('test.obj', 'price', undefined, 100);

      expect(filter).toHaveProperty('columnFilterRule');
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.numericColumnFilter.type).toBe('LESS_THAN_OR_EQUAL');
    });

    test('should throw error when neither min nor max provided', () => {
      expect(() => {
        buildNumericRangeFilter('test.obj', 'price', undefined, undefined);
      }).toThrow('at least min or max');
    });
  });

  describe('buildNullFilter()', () => {

    test('should build NULL filter', () => {
      const filter = buildNullFilter('test.obj', 'name', true);

      expect(filter).toHaveProperty('columnFilterRule');
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.nullColumnFilter.type).toBe('NULL');
    });

    test('should build NOT_NULL filter', () => {
      const filter = buildNullFilter('test.obj', 'name', false);
      const rule = (filter as any).columnFilterRule;

      expect(rule.filter.nullColumnFilter.type).toBe('NOT_NULL');
    });
  });
});

describe('wrapFilterAsRuleLogic()', () => {

  test('should wrap filter with proper structure', () => {
    const filter = buildStringEqualsFilter('test.obj', 'name', 'test');
    const logic = wrapFilterAsRuleLogic(filter, mockWorkflow);

    expect(logic).toHaveProperty('grammarVersion', 'V1');
    expect(logic).toHaveProperty('workflowRid', mockWorkflow.workflowRid);
    expect(logic).toHaveProperty('strategy');
    expect(logic).toHaveProperty('effect');
  });

  test('should include correct strategy structure', () => {
    const filter = buildStringEqualsFilter('test.obj', 'name', 'test');
    const logic = wrapFilterAsRuleLogic(filter, mockWorkflow) as any;

    expect(logic.strategy.type).toBe('filterNode');
    expect(logic.strategy.filterNode).toBeDefined();
    expect(logic.strategy.filterNode.filter).toBe(filter);
    expect(logic.strategy.filterNode.nodeInput.source.objectTypeId).toBe(mockWorkflow.objectType.id);
  });

  test('should include correct effect structure', () => {
    const filter = buildStringEqualsFilter('test.obj', 'name', 'test');
    const logic = wrapFilterAsRuleLogic(filter, mockWorkflow) as any;

    expect(logic.effect.type).toBe('v2');
    expect(logic.effect.v2.outputAndVersion.outputId).toBe(mockWorkflow.output.id);
    expect(logic.effect.v2.outputAndVersion.outputVersion).toBe(mockWorkflow.output.version);
    expect(logic.effect.v2.outputAndVersion.workflowRid).toBe(mockWorkflow.workflowRid);
  });
});

describe('buildFromTemplate()', () => {

  describe('string-equals template', () => {

    test('should build valid logic from string-equals template', () => {
      const result = buildFromTemplate('string-equals', {
        propertyId: 'name',
        value: 'test'
      }, mockWorkflow);

      expect(result.success).toBe(true);
      expect(result.logic).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    test('should include grammarVersion in result', () => {
      const result = buildFromTemplate('string-equals', {
        propertyId: 'name',
        value: 'test'
      }, mockWorkflow);

      expect((result.logic as any).grammarVersion).toBe('V1');
    });

    test('should fail when propertyId is missing', () => {
      const result = buildFromTemplate('string-equals', {
        value: 'test'
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Missing required parameter: propertyId');
    });

    test('should fail when value is missing', () => {
      const result = buildFromTemplate('string-equals', {
        propertyId: 'name'
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Missing required parameter: value');
    });

    test('should support caseSensitive parameter', () => {
      const result = buildFromTemplate('string-equals', {
        propertyId: 'name',
        value: 'Test',
        caseSensitive: true
      }, mockWorkflow);

      expect(result.success).toBe(true);
      const filter = (result.logic as any).strategy.filterNode.filter;
      expect(filter.columnFilterRule.filter.stringColumnFilter.caseSensitive).toBe(true);
    });
  });

  describe('string-or template', () => {

    test('should build valid logic from string-or template', () => {
      const result = buildFromTemplate('string-or', {
        propertyId: 'status',
        values: ['active', 'pending', 'approved']
      }, mockWorkflow);

      expect(result.success).toBe(true);
      expect(result.logic).toBeDefined();
    });

    test('should create OR filter structure', () => {
      const result = buildFromTemplate('string-or', {
        propertyId: 'status',
        values: ['a', 'b']
      }, mockWorkflow);

      const filter = (result.logic as any).strategy.filterNode.filter;
      expect(filter).toHaveProperty('orFilterRule');
      expect(filter.orFilterRule.filters).toHaveLength(2);
    });

    test('should fail when values is empty', () => {
      const result = buildFromTemplate('string-or', {
        propertyId: 'status',
        values: []
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes('values'))).toBe(true);
    });

    test('should fail when values is not an array', () => {
      const result = buildFromTemplate('string-or', {
        propertyId: 'status',
        values: 'not-an-array'
      }, mockWorkflow);

      expect(result.success).toBe(false);
    });
  });

  describe('numeric-range template', () => {

    test('should build valid logic with min and max', () => {
      const result = buildFromTemplate('numeric-range', {
        propertyId: 'price',
        min: 10,
        max: 100
      }, mockWorkflow);

      expect(result.success).toBe(true);
      expect(result.logic).toBeDefined();
    });

    test('should build valid logic with min only', () => {
      const result = buildFromTemplate('numeric-range', {
        propertyId: 'price',
        min: 10
      }, mockWorkflow);

      expect(result.success).toBe(true);
    });

    test('should build valid logic with max only', () => {
      const result = buildFromTemplate('numeric-range', {
        propertyId: 'price',
        max: 100
      }, mockWorkflow);

      expect(result.success).toBe(true);
    });

    test('should fail when neither min nor max is provided', () => {
      const result = buildFromTemplate('numeric-range', {
        propertyId: 'price'
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes('min or max'))).toBe(true);
    });

    test('should fail when propertyId is missing', () => {
      const result = buildFromTemplate('numeric-range', {
        min: 10
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Missing required parameter: propertyId');
    });
  });

  describe('null-check template', () => {

    test('should build NULL check (default)', () => {
      const result = buildFromTemplate('null-check', {
        propertyId: 'name'
      }, mockWorkflow);

      expect(result.success).toBe(true);
      const filter = (result.logic as any).strategy.filterNode.filter;
      expect(filter.columnFilterRule.filter.nullColumnFilter.type).toBe('NULL');
    });

    test('should build NOT_NULL check', () => {
      const result = buildFromTemplate('null-check', {
        propertyId: 'name',
        isNull: false
      }, mockWorkflow);

      expect(result.success).toBe(true);
      const filter = (result.logic as any).strategy.filterNode.filter;
      expect(filter.columnFilterRule.filter.nullColumnFilter.type).toBe('NOT_NULL');
    });

    test('should fail when propertyId is missing', () => {
      const result = buildFromTemplate('null-check', {
        isNull: true
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Missing required parameter: propertyId');
    });
  });

  describe('unknown template', () => {

    test('should fail for unknown template name', () => {
      const result = buildFromTemplate('unknown-template', {
        propertyId: 'name'
      }, mockWorkflow);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Unknown template: unknown-template');
    });

    test('should fail for empty template name', () => {
      const result = buildFromTemplate('', {
        propertyId: 'name'
      }, mockWorkflow);

      expect(result.success).toBe(false);
    });
  });
});

describe('getBuiltInTemplates()', () => {

  test('should return array of templates', () => {
    const templates = getBuiltInTemplates();

    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  test('should include string-equals template', () => {
    const templates = getBuiltInTemplates();
    const stringEquals = templates.find(t => t.name === 'string-equals');

    expect(stringEquals).toBeDefined();
    expect(stringEquals?.description).toBeTruthy();
    expect(stringEquals?.parameters).toContain('propertyId');
    expect(stringEquals?.parameters).toContain('value');
  });

  test('should include string-or template', () => {
    const templates = getBuiltInTemplates();
    const stringOr = templates.find(t => t.name === 'string-or');

    expect(stringOr).toBeDefined();
    expect(stringOr?.parameters).toContain('values[]');
  });

  test('should include numeric-range template', () => {
    const templates = getBuiltInTemplates();
    const numericRange = templates.find(t => t.name === 'numeric-range');

    expect(numericRange).toBeDefined();
    expect(numericRange?.parameters.some(p => p.includes('min'))).toBe(true);
    expect(numericRange?.parameters.some(p => p.includes('max'))).toBe(true);
  });

  test('should include null-check template', () => {
    const templates = getBuiltInTemplates();
    const nullCheck = templates.find(t => t.name === 'null-check');

    expect(nullCheck).toBeDefined();
    expect(nullCheck?.parameters).toContain('propertyId');
  });

  test('should have 4 built-in templates', () => {
    const templates = getBuiltInTemplates();

    expect(templates).toHaveLength(4);
  });

  test('each template should have name, description, and parameters', () => {
    const templates = getBuiltInTemplates();

    for (const template of templates) {
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('parameters');
      expect(typeof template.name).toBe('string');
      expect(typeof template.description).toBe('string');
      expect(Array.isArray(template.parameters)).toBe(true);
    }
  });
});
