/**
 * Environment Variable Resolver
 *
 * Resolves ${VAR_NAME} patterns in config values to actual environment variable values.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ResolverOptions {
  throwOnMissing?: boolean;
  prefix?: string;
}

export interface ResolverResult {
  value: string;
  resolved: boolean;
  missing?: string[];
}

// =============================================================================
// RESOLVER
// =============================================================================

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Resolve environment variables in a string
 * Supports ${VAR_NAME} syntax
 *
 * @example
 * resolveEnvVars('https://${HOST}:${PORT}')
 * // Returns 'https://localhost:8080' if HOST=localhost, PORT=8080
 */
export function resolveEnvVars(
  value: string,
  options: ResolverOptions = {}
): ResolverResult {
  const { throwOnMissing = false, prefix = '' } = options;
  const missing: string[] = [];
  let resolved = false;

  const result = value.replace(ENV_VAR_PATTERN, (match, varName) => {
    const fullVarName = prefix ? `${prefix}${varName}` : varName;
    const envValue = process.env[fullVarName];

    if (envValue === undefined) {
      missing.push(fullVarName);
      if (throwOnMissing) {
        throw new Error(`Missing environment variable: ${fullVarName}`);
      }
      return match; // Keep original if not found
    }

    resolved = true;
    return envValue;
  });

  return { value: result, resolved, missing: missing.length > 0 ? missing : undefined };
}

/**
 * Check if a string contains environment variable references
 */
export function hasEnvVars(value: string): boolean {
  return ENV_VAR_PATTERN.test(value);
}

/**
 * Extract environment variable names from a string
 */
export function extractEnvVarNames(value: string): string[] {
  const names: string[] = [];
  let match;

  // Reset lastIndex for global regex
  ENV_VAR_PATTERN.lastIndex = 0;

  while ((match = ENV_VAR_PATTERN.exec(value)) !== null) {
    names.push(match[1]);
  }

  return names;
}

/**
 * Resolve all environment variables in an object recursively
 */
export function resolveEnvVarsInObject<T extends object>(
  obj: T,
  options: ResolverOptions = {}
): { value: T; missing: string[] } {
  const allMissing: string[] = [];

  function resolveValue(val: unknown): unknown {
    if (typeof val === 'string') {
      const result = resolveEnvVars(val, { ...options, throwOnMissing: false });
      if (result.missing) {
        allMissing.push(...result.missing);
      }
      return result.value;
    }

    if (Array.isArray(val)) {
      return val.map(resolveValue);
    }

    if (val && typeof val === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(val)) {
        resolved[key] = resolveValue(value);
      }
      return resolved;
    }

    return val;
  }

  const resolved = resolveValue(obj) as T;

  if (options.throwOnMissing && allMissing.length > 0) {
    throw new Error(`Missing environment variables: ${allMissing.join(', ')}`);
  }

  return { value: resolved, missing: allMissing };
}

/**
 * Validate that all required environment variables are set
 */
export function validateEnvVars(
  requiredVars: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredVars.filter(name => !process.env[name]);
  return { valid: missing.length === 0, missing };
}
