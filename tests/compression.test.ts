/**
 * Tests for compression utilities
 * Tests: compress, decompress, getCompressedValue, wrapCompressedValue, getCompressionStats
 */

import { describe, test, expect } from 'vitest';
import {
  compress,
  decompress,
  getCompressedValue,
  wrapCompressedValue,
  getCompressionStats,
} from '../src/v2/compression.js';

describe('Compression Module', () => {

  describe('compress()', () => {

    test('should compress a simple object', () => {
      const logic = { key: 'value' };
      const result = compress(logic);

      // Result should be a JSON string
      expect(typeof result).toBe('string');

      // Should parse as wrapper object
      const wrapper = JSON.parse(result);
      expect(wrapper).toHaveProperty('compressedValue');
      expect(wrapper).toHaveProperty('type', 'compressedValue');
    });

    test('should compress an empty object', () => {
      const logic = {};
      const result = compress(logic);

      const wrapper = JSON.parse(result);
      expect(wrapper.type).toBe('compressedValue');
      expect(wrapper.compressedValue).toBeTruthy();
    });

    test('should compress a nested object', () => {
      const logic = {
        grammarVersion: 'V1',
        strategy: {
          type: 'filterNode',
          filterNode: {
            columnFilterRule: {
              column: { objectProperty: { objectTypeId: 'test', propertyTypeId: 'prop' } }
            }
          }
        }
      };

      const result = compress(logic);
      const wrapper = JSON.parse(result);
      expect(wrapper.type).toBe('compressedValue');
    });

    test('should compress an array', () => {
      const logic = [1, 2, 3, { nested: true }];
      const result = compress(logic);

      const wrapper = JSON.parse(result);
      expect(wrapper.type).toBe('compressedValue');
    });

    test('should compress a string value', () => {
      const logic = 'simple string';
      const result = compress(logic);

      const wrapper = JSON.parse(result);
      expect(wrapper.type).toBe('compressedValue');
    });
  });

  describe('decompress()', () => {

    test('should decompress a valid compressed wrapper', () => {
      const original = { key: 'value', nested: { deep: true } };
      const compressed = compress(original);

      const result = decompress(compressed);
      expect(result).toEqual(original);
    });

    test('should decompress an empty object', () => {
      const original = {};
      const compressed = compress(original);

      const result = decompress(compressed);
      expect(result).toEqual(original);
    });

    test('should throw on invalid JSON wrapper', () => {
      expect(() => decompress('not json')).toThrow();
    });

    test('should throw on invalid compressed value', () => {
      const invalidWrapper = JSON.stringify({
        compressedValue: 'invalid-compressed-data',
        type: 'compressedValue'
      });

      expect(() => decompress(invalidWrapper)).toThrow('Failed to decompress');
    });

    test('should throw on missing compressedValue field', () => {
      const invalidWrapper = JSON.stringify({ type: 'compressedValue' });

      expect(() => decompress(invalidWrapper)).toThrow();
    });
  });

  describe('Round-trip compression', () => {

    test('should preserve simple object through compress/decompress', () => {
      const original = { a: 1, b: 'two', c: true };
      const compressed = compress(original);
      const decompressed = decompress(compressed);

      expect(decompressed).toEqual(original);
    });

    test('should preserve complex nested object through round-trip', () => {
      const original = {
        grammarVersion: 'V1',
        workflowRid: 'ri.taurus.main.workflow.abc123',
        strategy: {
          type: 'filterNode',
          filterNode: {
            columnFilterRule: {
              column: {
                objectProperty: {
                  objectTypeId: 'hvznujj5.demo-product',
                  propertyTypeId: 'product_id'
                }
              },
              filter: {
                stringColumnFilter: {
                  type: 'EQUALS',
                  values: ['test-value'],
                  caseSensitive: false
                }
              }
            }
          }
        },
        effect: {
          type: 'v2',
          v2: { outputAndVersion: { id: 'output-id', version: 1 } }
        }
      };

      const compressed = compress(original);
      const decompressed = decompress(compressed);

      expect(decompressed).toEqual(original);
    });

    test('should preserve array through round-trip', () => {
      const original = [1, 'two', { three: 3 }, [4, 5]];
      const compressed = compress(original);
      const decompressed = decompress(compressed);

      expect(decompressed).toEqual(original);
    });

    test('should preserve null values through round-trip', () => {
      const original = { key: null, nested: { alsoNull: null } };
      const compressed = compress(original);
      const decompressed = decompress(compressed);

      expect(decompressed).toEqual(original);
    });
  });

  describe('getCompressedValue()', () => {

    test('should extract compressed value from wrapper', () => {
      const logic = { test: 'data' };
      const wrapper = compress(logic);

      const value = getCompressedValue(wrapper);

      expect(typeof value).toBe('string');
      expect(value).not.toContain('{'); // Should be encoded, not JSON
    });

    test('should throw on invalid JSON', () => {
      expect(() => getCompressedValue('not json')).toThrow();
    });
  });

  describe('wrapCompressedValue()', () => {

    test('should create valid wrapper from compressed value', () => {
      const logic = { test: 'data' };
      const originalWrapper = compress(logic);
      const compressedValue = getCompressedValue(originalWrapper);

      const newWrapper = wrapCompressedValue(compressedValue);

      const parsed = JSON.parse(newWrapper);
      expect(parsed.type).toBe('compressedValue');
      expect(parsed.compressedValue).toBe(compressedValue);
    });

    test('should create wrapper that can be decompressed', () => {
      const original = { key: 'value' };
      const compressed = compress(original);
      const value = getCompressedValue(compressed);
      const rewrapped = wrapCompressedValue(value);

      const decompressed = decompress(rewrapped);
      expect(decompressed).toEqual(original);
    });
  });

  describe('getCompressionStats()', () => {

    test('should return correct stats structure', () => {
      const logic = { key: 'value' };
      const stats = getCompressionStats(logic);

      expect(stats).toHaveProperty('originalSize');
      expect(stats).toHaveProperty('compressedSize');
      expect(stats).toHaveProperty('ratio');

      expect(typeof stats.originalSize).toBe('number');
      expect(typeof stats.compressedSize).toBe('number');
      expect(typeof stats.ratio).toBe('number');
    });

    test('should show compression ratio less than 1 for large repetitive data', () => {
      // Large repetitive data compresses well
      const logic = {
        items: Array(100).fill({ repeated: 'value', another: 'field' })
      };

      const stats = getCompressionStats(logic);

      expect(stats.ratio).toBeLessThan(1);
      expect(stats.compressedSize).toBeLessThan(stats.originalSize);
    });

    test('should calculate originalSize correctly', () => {
      const logic = { test: 123 };
      const stats = getCompressionStats(logic);

      const expectedSize = JSON.stringify(logic).length;
      expect(stats.originalSize).toBe(expectedSize);
    });

    test('should handle empty object', () => {
      const logic = {};
      const stats = getCompressionStats(logic);

      expect(stats.originalSize).toBe(2); // '{}'
      expect(stats.compressedSize).toBeGreaterThan(0);
    });
  });
});
