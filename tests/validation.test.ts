/**
 * Tests for validation modules
 * Tests: validateRuleLogic, validateProperties, validateFilterTypes, extractors
 */

import { describe, test, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  validateRuleLogic,
  extractObjectTypeId,
  extractWorkflowRid,
} from '../src/v2/validation/schema.js';
import {
  validateProperties,
  getPropertySummary,
  extractAllProperties,
} from '../src/v2/validation/properties.js';
import {
  validateFilterTypes,
  getFilterSummary,
  extractStringFilterTypes,
  extractNumericFilterTypes,
} from '../src/v2/validation/filters.js';
import { ValidationConfig, ObjectTypeConfig } from '../src/v2/config/types.js';

// Test fixtures
const fixturesDir = path.join(__dirname, 'fixtures');
const sampleRuleLogic = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'sample-rule-logic.json'), 'utf8')
);

// Mock validation config
const validationConfig: ValidationConfig = {
  grammarVersion: 'V1',
  supportedStrategyTypes: ['filterNode', 'windowNode', 'aggregationNode'],
  supportedStringFilters: ['EQUALS', 'CONTAINS', 'MATCHES'],
  unsupportedStringFilters: ['REGEX', 'STARTS_WITH'],
  supportedNumericFilters: ['EQUALS', 'GREATER_THAN', 'LESS_THAN'],
  supportedNullFilters: ['NULL', 'NOT_NULL'],
};

// Mock object type config
const objectTypeConfig: ObjectTypeConfig = {
  id: 'test.object-type',
  dynamicLookup: false,
  properties: [
    { id: 'property_a', type: 'string', description: 'Test property A' },
    { id: 'property_b', type: 'number', description: 'Test property B' },
    { id: 'property_c', type: 'boolean', description: 'Test property C' },
  ],
};

describe('Schema Validation Module', () => {

  describe('validateRuleLogic()', () => {

    test('should validate correct rule logic', () => {
      const result = validateRuleLogic(sampleRuleLogic, validationConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail when grammarVersion is wrong', () => {
      const logic = { ...sampleRuleLogic, grammarVersion: 'V2' };
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('grammarVersion'))).toBe(true);
    });

    test('should fail when grammarVersion is missing', () => {
      const logic = { ...sampleRuleLogic };
      delete (logic as any).grammarVersion;
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('grammarVersion'))).toBe(true);
    });

    test('should fail when workflowRid is missing', () => {
      const logic = { ...sampleRuleLogic };
      delete (logic as any).workflowRid;
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('workflowRid'))).toBe(true);
    });

    test('should fail when workflowRid is not a string', () => {
      const logic = { ...sampleRuleLogic, workflowRid: 123 };
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('workflowRid'))).toBe(true);
    });

    test('should fail when strategy is missing', () => {
      const logic = { ...sampleRuleLogic };
      delete (logic as any).strategy;
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('strategy'))).toBe(true);
    });

    test('should fail for unsupported strategy type', () => {
      const logic = {
        ...sampleRuleLogic,
        strategy: {
          type: 'unknownNode',
          unknownNode: {}
        }
      };
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('strategy.type'))).toBe(true);
    });

    test('should fail when strategy node is missing', () => {
      const logic = {
        ...sampleRuleLogic,
        strategy: {
          type: 'filterNode'
          // missing filterNode
        }
      };
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('strategy.filterNode'))).toBe(true);
    });

    test('should fail when effect is missing', () => {
      const logic = { ...sampleRuleLogic };
      delete (logic as any).effect;
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('effect'))).toBe(true);
    });

    test('should fail when effect.type is not v2', () => {
      const logic = {
        ...sampleRuleLogic,
        effect: { type: 'v1', v1: {} }
      };
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("effect.type must be 'v2'"))).toBe(true);
    });

    test('should fail when effect.v2.outputAndVersion is missing', () => {
      const logic = {
        ...sampleRuleLogic,
        effect: { type: 'v2', v2: {} }
      };
      const result = validateRuleLogic(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('outputAndVersion'))).toBe(true);
    });

    test('should fail for non-object input', () => {
      const result = validateRuleLogic('not an object', validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Root must be an object');
    });

    test('should fail for null input', () => {
      const result = validateRuleLogic(null, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Root must be an object');
    });
  });

  describe('extractObjectTypeId()', () => {

    test('should extract object type ID from valid logic', () => {
      // Note: The sample rule logic may not have objectTypeId in nodeInput
      // Need to add it for this test
      const logicWithObjectType = {
        ...sampleRuleLogic,
        strategy: {
          ...sampleRuleLogic.strategy,
          filterNode: {
            ...sampleRuleLogic.strategy.filterNode,
            nodeInput: {
              source: {
                objectTypeId: 'test.object-type'
              }
            }
          }
        }
      };

      const result = extractObjectTypeId(logicWithObjectType);
      expect(result).toBe('test.object-type');
    });

    test('should return null for missing object type', () => {
      const logic = {
        grammarVersion: 'V1',
        strategy: {
          type: 'filterNode',
          filterNode: {}
        }
      };

      const result = extractObjectTypeId(logic);
      expect(result).toBeNull();
    });

    test('should return null for non-object input', () => {
      expect(extractObjectTypeId('string')).toBeNull();
      expect(extractObjectTypeId(null)).toBeNull();
      expect(extractObjectTypeId(undefined)).toBeNull();
    });
  });

  describe('extractWorkflowRid()', () => {

    test('should extract workflow RID from valid logic', () => {
      const result = extractWorkflowRid(sampleRuleLogic);
      expect(result).toBe('ri.taurus.main.workflow.test-workflow-123');
    });

    test('should return null for missing workflow RID', () => {
      const logic = { grammarVersion: 'V1' };
      const result = extractWorkflowRid(logic);
      expect(result).toBeNull();
    });

    test('should return null for non-object input', () => {
      expect(extractWorkflowRid('string')).toBeNull();
      expect(extractWorkflowRid(null)).toBeNull();
    });
  });
});

describe('Property Validation Module', () => {

  describe('validateProperties()', () => {

    test('should validate when all properties exist', () => {
      const result = validateProperties(sampleRuleLogic, objectTypeConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail for unknown property', () => {
      const logic = {
        ...sampleRuleLogic,
        strategy: {
          ...sampleRuleLogic.strategy,
          filterNode: {
            filter: {
              columnFilterRule: {
                column: {
                  objectProperty: {
                    objectTypeId: 'test.object-type',
                    propertyTypeId: 'unknown_property'
                  }
                },
                filter: { stringColumnFilter: { type: 'EQUALS', values: ['x'] } }
              }
            }
          }
        }
      };

      const result = validateProperties(logic, objectTypeConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('unknown_property'))).toBe(true);
      expect(result.errors.some(e => e.includes('does not exist'))).toBe(true);
    });

    test('should return empty properties for logic without filters', () => {
      const logic = {
        grammarVersion: 'V1',
        workflowRid: 'test-rid',
        strategy: { type: 'filterNode', filterNode: {} }
      };

      const result = validateProperties(logic, objectTypeConfig);

      expect(result.valid).toBe(true);
      expect(result.usedProperties).toHaveLength(0);
    });

    test('should list valid properties in result', () => {
      const result = validateProperties(sampleRuleLogic, objectTypeConfig);

      expect(result.validProperties).toContain('property_a');
      expect(result.validProperties).toContain('property_b');
      expect(result.validProperties).toContain('property_c');
    });
  });

  describe('getPropertySummary()', () => {

    test('should return properties and count', () => {
      const result = getPropertySummary(sampleRuleLogic);

      expect(result).toHaveProperty('properties');
      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.properties)).toBe(true);
      expect(typeof result.count).toBe('number');
    });

    test('should return correct count for sample logic', () => {
      const result = getPropertySummary(sampleRuleLogic);

      // Sample logic uses property_a
      expect(result.properties).toContain('property_a');
      expect(result.count).toBe(1);
    });

    test('should return empty for logic without properties', () => {
      const logic = { grammarVersion: 'V1' };
      const result = getPropertySummary(logic);

      expect(result.properties).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('extractAllProperties()', () => {

    test('should extract properties from compound filters', () => {
      const logic = {
        strategy: {
          filterNode: {
            filter: {
              andFilterRule: {
                filters: [
                  {
                    columnFilterRule: {
                      column: { objectProperty: { propertyTypeId: 'prop1' } },
                      filter: { stringColumnFilter: { type: 'EQUALS' } }
                    }
                  },
                  {
                    columnFilterRule: {
                      column: { objectProperty: { propertyTypeId: 'prop2' } },
                      filter: { stringColumnFilter: { type: 'EQUALS' } }
                    }
                  }
                ]
              }
            }
          }
        }
      };

      const properties = extractAllProperties(logic);

      expect(properties.has('prop1')).toBe(true);
      expect(properties.has('prop2')).toBe(true);
      expect(properties.size).toBe(2);
    });

    test('should extract properties from OR filters', () => {
      const logic = {
        strategy: {
          filterNode: {
            filter: {
              orFilterRule: {
                filters: [
                  {
                    columnFilterRule: {
                      column: { objectProperty: { propertyTypeId: 'propA' } },
                      filter: {}
                    }
                  },
                  {
                    columnFilterRule: {
                      column: { objectProperty: { propertyTypeId: 'propB' } },
                      filter: {}
                    }
                  }
                ]
              }
            }
          }
        }
      };

      const properties = extractAllProperties(logic);

      expect(properties.has('propA')).toBe(true);
      expect(properties.has('propB')).toBe(true);
    });

    test('should extract properties from NOT filters', () => {
      const logic = {
        strategy: {
          filterNode: {
            filter: {
              notFilterRule: {
                filter: {
                  columnFilterRule: {
                    column: { objectProperty: { propertyTypeId: 'negatedProp' } },
                    filter: {}
                  }
                }
              }
            }
          }
        }
      };

      const properties = extractAllProperties(logic);

      expect(properties.has('negatedProp')).toBe(true);
    });
  });
});

describe('Filter Validation Module', () => {

  describe('validateFilterTypes()', () => {

    test('should validate supported string filter', () => {
      const result = validateFilterTypes(sampleRuleLogic, validationConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail for unsupported string filter', () => {
      const logic = {
        ...sampleRuleLogic,
        strategy: {
          ...sampleRuleLogic.strategy,
          filterNode: {
            filter: {
              columnFilterRule: {
                column: { objectProperty: { propertyTypeId: 'prop' } },
                filter: {
                  stringColumnFilter: {
                    type: 'REGEX',  // Unsupported
                    values: ['test']
                  }
                }
              }
            }
          }
        }
      };

      const result = validateFilterTypes(logic, validationConfig);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('REGEX'))).toBe(true);
      expect(result.errors.some(e => e.includes('not supported'))).toBe(true);
    });

    test('should warn for unknown string filter type', () => {
      const logic = {
        ...sampleRuleLogic,
        strategy: {
          ...sampleRuleLogic.strategy,
          filterNode: {
            filter: {
              columnFilterRule: {
                column: { objectProperty: { propertyTypeId: 'prop' } },
                filter: {
                  stringColumnFilter: {
                    type: 'UNKNOWN_FILTER',
                    values: ['test']
                  }
                }
              }
            }
          }
        }
      };

      const result = validateFilterTypes(logic, validationConfig);

      // Should be valid but with warnings
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('UNKNOWN_FILTER'))).toBe(true);
    });

    test('should track used filter types', () => {
      const result = validateFilterTypes(sampleRuleLogic, validationConfig);

      expect(result.usedFilters).toBeDefined();
      expect(result.usedFilters.string).toContain('EQUALS');
    });

    test('should validate numeric filters', () => {
      const logic = {
        strategy: {
          filterNode: {
            filter: {
              columnFilterRule: {
                column: { objectProperty: { propertyTypeId: 'prop' } },
                filter: {
                  numericColumnFilter: {
                    type: 'GREATER_THAN',
                    value: 100
                  }
                }
              }
            }
          }
        }
      };

      const result = validateFilterTypes(logic, validationConfig);

      expect(result.usedFilters.numeric).toContain('GREATER_THAN');
    });

    test('should validate null filters', () => {
      const logic = {
        strategy: {
          filterNode: {
            filter: {
              columnFilterRule: {
                column: { objectProperty: { propertyTypeId: 'prop' } },
                filter: {
                  nullColumnFilter: {
                    type: 'NULL'
                  }
                }
              }
            }
          }
        }
      };

      const result = validateFilterTypes(logic, validationConfig);

      expect(result.usedFilters.null).toContain('NULL');
    });
  });

  describe('getFilterSummary()', () => {

    test('should return filter summary structure', () => {
      const result = getFilterSummary(sampleRuleLogic);

      expect(result).toHaveProperty('stringFilters');
      expect(result).toHaveProperty('numericFilters');
      expect(result).toHaveProperty('nullFilters');
      expect(result).toHaveProperty('hasCompoundFilters');
    });

    test('should detect compound filters', () => {
      const logic = {
        strategy: {
          filterNode: {
            filter: {
              andFilterRule: {
                filters: [
                  { columnFilterRule: { column: {}, filter: {} } },
                  { columnFilterRule: { column: {}, filter: {} } }
                ]
              }
            }
          }
        }
      };

      const result = getFilterSummary(logic);

      expect(result.hasCompoundFilters).toBe(true);
    });

    test('should return false for hasCompoundFilters when no compound filters', () => {
      const result = getFilterSummary(sampleRuleLogic);

      expect(result.hasCompoundFilters).toBe(false);
    });
  });

  describe('extractStringFilterTypes()', () => {

    test('should extract string filter types', () => {
      const filter = {
        columnFilterRule: {
          column: {},
          filter: {
            stringColumnFilter: {
              type: 'EQUALS',
              values: ['test']
            }
          }
        }
      };

      const types = extractStringFilterTypes(filter);

      expect(types.has('EQUALS')).toBe(true);
    });

    test('should extract from nested AND filters', () => {
      const filter = {
        andFilterRule: {
          filters: [
            {
              columnFilterRule: {
                filter: { stringColumnFilter: { type: 'EQUALS' } }
              }
            },
            {
              columnFilterRule: {
                filter: { stringColumnFilter: { type: 'CONTAINS' } }
              }
            }
          ]
        }
      };

      const types = extractStringFilterTypes(filter);

      expect(types.has('EQUALS')).toBe(true);
      expect(types.has('CONTAINS')).toBe(true);
    });

    test('should handle empty/invalid input', () => {
      expect(extractStringFilterTypes(null).size).toBe(0);
      expect(extractStringFilterTypes(undefined).size).toBe(0);
      expect(extractStringFilterTypes('string').size).toBe(0);
    });
  });

  describe('extractNumericFilterTypes()', () => {

    test('should extract numeric filter types', () => {
      const filter = {
        columnFilterRule: {
          column: {},
          filter: {
            numericColumnFilter: {
              type: 'GREATER_THAN',
              value: 50
            }
          }
        }
      };

      const types = extractNumericFilterTypes(filter);

      expect(types.has('GREATER_THAN')).toBe(true);
    });

    test('should extract from OR filters', () => {
      const filter = {
        orFilterRule: {
          filters: [
            {
              columnFilterRule: {
                filter: { numericColumnFilter: { type: 'LESS_THAN' } }
              }
            },
            {
              columnFilterRule: {
                filter: { numericColumnFilter: { type: 'GREATER_THAN' } }
              }
            }
          ]
        }
      };

      const types = extractNumericFilterTypes(filter);

      expect(types.has('LESS_THAN')).toBe(true);
      expect(types.has('GREATER_THAN')).toBe(true);
    });
  });
});
