/**
 * Config Loader
 *
 * Loads, validates, and resolves workflow configuration files.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  WorkflowConfig,
  ResolvedConfig,
  ResolvedFoundryConnection
} from './types.js';
import { resolveEnvVars, validateEnvVars } from './resolver.js';

// =============================================================================
// LOADER TYPES
// =============================================================================

export interface LoadResult {
  success: boolean;
  config?: ResolvedConfig;
  errors?: string[];
  warnings?: string[];
}

export interface LoadOptions {
  resolvePaths?: boolean;  // Resolve relative paths in templates
  validateToken?: boolean; // Check if token env var is set
}

// =============================================================================
// CONFIG LOADER
// =============================================================================

/**
 * Load and validate a workflow configuration file
 */
export function loadConfig(
  configPath: string,
  options: LoadOptions = {}
): LoadResult {
  const { resolvePaths = true, validateToken = true } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file exists
  if (!fs.existsSync(configPath)) {
    return {
      success: false,
      errors: [`Config file not found: ${configPath}`]
    };
  }

  // Read and parse JSON
  let rawConfig: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    rawConfig = JSON.parse(content);
  } catch (e) {
    return {
      success: false,
      errors: [`Failed to parse config file: ${(e as Error).message}`]
    };
  }

  // Validate required fields
  const config = rawConfig as WorkflowConfig;

  if (!config.version) {
    errors.push('Missing required field: version');
  }

  if (!config.workflow) {
    errors.push('Missing required field: workflow');
  } else {
    if (!config.workflow.name) errors.push('Missing workflow.name');
    if (!config.workflow.workflowRid) errors.push('Missing workflow.workflowRid');
    if (!config.workflow.objectType?.id) errors.push('Missing workflow.objectType.id');
    if (!config.workflow.output?.id) errors.push('Missing workflow.output.id');
  }

  if (!config.foundry) {
    errors.push('Missing required field: foundry');
  } else {
    if (!config.foundry.url) errors.push('Missing foundry.url');
    if (!config.foundry.ontologyRid) errors.push('Missing foundry.ontologyRid');
    if (!config.foundry.tokenEnvVar) errors.push('Missing foundry.tokenEnvVar');
  }

  if (!config.sdk) {
    errors.push('Missing required field: sdk');
  } else {
    if (!config.sdk.packageName) errors.push('Missing sdk.packageName');
    if (!config.sdk.archetypes?.proposal) errors.push('Missing sdk.archetypes.proposal');
    if (!config.sdk.archetypes?.rule) errors.push('Missing sdk.archetypes.rule');
  }

  if (!config.validation) {
    errors.push('Missing required field: validation');
  } else {
    if (!config.validation.grammarVersion) errors.push('Missing validation.grammarVersion');
    if (!config.validation.supportedStrategyTypes?.length) {
      errors.push('Missing or empty validation.supportedStrategyTypes');
    }
  }

  if (!config.conventions) {
    errors.push('Missing required field: conventions');
  } else {
    if (!config.conventions.proposalIdPrefix) errors.push('Missing conventions.proposalIdPrefix');
    if (!config.conventions.ruleIdPrefix) errors.push('Missing conventions.ruleIdPrefix');
    if (!config.conventions.defaultAuthor) errors.push('Missing conventions.defaultAuthor');
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Resolve environment variables in foundry connection
  const urlResult = resolveEnvVars(config.foundry.url);
  const ontologyResult = resolveEnvVars(config.foundry.ontologyRid);

  if (urlResult.missing?.length) {
    errors.push(`Missing environment variable for foundry.url: ${urlResult.missing.join(', ')}`);
  }

  if (ontologyResult.missing?.length) {
    errors.push(`Missing environment variable for foundry.ontologyRid: ${ontologyResult.missing.join(', ')}`);
  }

  // Validate token env var is set (optional)
  if (validateToken) {
    const tokenCheck = validateEnvVars([config.foundry.tokenEnvVar]);
    if (!tokenCheck.valid) {
      warnings.push(`Token environment variable not set: ${config.foundry.tokenEnvVar}`);
    }
  }

  // Get token value
  const token = process.env[config.foundry.tokenEnvVar] || '';

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  // Resolve template paths
  let resolvedTemplates = config.templates;
  if (resolvePaths && config.templates) {
    const configDir = path.dirname(configPath);
    resolvedTemplates = config.templates.map(t => {
      if (t.file && !path.isAbsolute(t.file)) {
        return { ...t, file: path.resolve(configDir, t.file) };
      }
      return t;
    });
  }

  // Build resolved config
  const resolvedFoundry: ResolvedFoundryConnection = {
    url: urlResult.value,
    ontologyRid: ontologyResult.value,
    token
  };

  const resolvedConfig: ResolvedConfig = {
    version: config.version,
    workflow: config.workflow,
    foundry: resolvedFoundry,
    sdk: config.sdk,
    validation: config.validation,
    conventions: config.conventions,
    templates: resolvedTemplates
  };

  return {
    success: true,
    config: resolvedConfig,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Get the default config path
 * Looks for config/default.json or uses env var CONFIG_PATH
 */
export function getDefaultConfigPath(baseDir?: string): string | null {
  // Check environment variable first
  if (process.env.PROPOSAL_CLI_CONFIG) {
    return process.env.PROPOSAL_CLI_CONFIG;
  }

  // Look for default.json in config directory
  const searchPaths = [
    baseDir ? path.join(baseDir, 'config', 'default.json') : null,
    path.join(process.cwd(), 'config', 'default.json'),
    path.join(__dirname, '..', '..', 'config', 'default.json')
  ].filter(Boolean) as string[];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * List available config files in the config directory
 */
export function listConfigs(configDir?: string): string[] {
  const dir = configDir || path.join(process.cwd(), 'config');

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.endsWith('-schema.json'))
    .map(f => path.join(dir, f));
}

/**
 * Validate a config file without resolving environment variables
 * Useful for checking config syntax before deployment
 */
export function validateConfigSyntax(configPath: string): LoadResult {
  return loadConfig(configPath, { validateToken: false });
}
