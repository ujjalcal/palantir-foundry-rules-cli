/**
 * Compression Module
 *
 * Shared LZ-string compression/decompression for rule logic.
 * Extracted from rule-logic-lib.ts for reuse in v2.
 */

import LZString from 'lz-string';

// =============================================================================
// COMPRESSION
// =============================================================================

/**
 * Compress rule logic to Foundry's expected format
 *
 * @param logic - The rule logic object
 * @returns JSON string containing { compressedValue, type: 'compressedValue' }
 */
export function compress(logic: unknown): string {
  const json = JSON.stringify(logic);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return JSON.stringify({ compressedValue: compressed, type: 'compressedValue' });
}

/**
 * Decompress rule logic from Foundry's format
 *
 * @param compressedWrapper - JSON string containing compressedValue
 * @returns Parsed rule logic object
 */
export function decompress(compressedWrapper: string): unknown {
  const wrapper = JSON.parse(compressedWrapper);
  const json = LZString.decompressFromEncodedURIComponent(wrapper.compressedValue);
  if (!json) {
    throw new Error('Failed to decompress - invalid compressed value');
  }
  return JSON.parse(json);
}

/**
 * Get just the compressed value string (without wrapper)
 */
export function getCompressedValue(compressedWrapper: string): string {
  const wrapper = JSON.parse(compressedWrapper);
  return wrapper.compressedValue;
}

/**
 * Create compressed wrapper from raw compressed value
 */
export function wrapCompressedValue(compressedValue: string): string {
  return JSON.stringify({ compressedValue, type: 'compressedValue' });
}

/**
 * Get compression stats
 */
export function getCompressionStats(logic: unknown): {
  originalSize: number;
  compressedSize: number;
  ratio: number;
} {
  const original = JSON.stringify(logic);
  const compressed = LZString.compressToEncodedURIComponent(original);

  return {
    originalSize: original.length,
    compressedSize: compressed.length,
    ratio: compressed.length / original.length
  };
}
