#!/usr/bin/env npx tsx
/**
 * Proposal CLI v2 - Generic, Config-Driven Rule Proposal Management
 *
 * This is a configuration-driven version of the proposal CLI.
 * All workflow-specific values are loaded from JSON config files.
 *
 * Usage:
 *   npx tsx proposal-cli-v2.ts --config config/demo-product.json <command> [args]
 *
 * Commands:
 *   create <json-file>       - Create proposal from JSON file
 *   decompress <id>          - Decompress and show rule logic from existing proposal
 *   validate <json-file>     - Validate JSON against schema
 *   template <name>          - Generate sample JSON template
 *   template --list          - List available templates
 *   approve <id>             - Approve a proposal
 *   reject <id>              - Reject a proposal
 *   update <id> <json>       - Update a proposal with new logic
 *   list-proposals [status]  - List all proposals (optionally filter by status)
 *   list-rules               - List all rules
 *   batch-reject <pattern>   - Reject all OPEN proposals matching pattern
 *   config --show            - Show current config
 *   config --validate        - Validate config file
 *
 * Examples:
 *   npx tsx proposal-cli-v2.ts --config config/demo-product.json template --list
 *   npx tsx proposal-cli-v2.ts --config config/demo-product.json template string-equals > my-rule.json
 *   npx tsx proposal-cli-v2.ts --config config/demo-product.json validate my-rule.json
 *   FOUNDRY_TOKEN=xxx npx tsx proposal-cli-v2.ts --config config/demo-product.json create my-rule.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createPlatformClient } from '@osdk/client';
import { Actions, OntologyObjectsV2 } from '@osdk/foundry.ontologies';
import type { SearchObjectsRequestV2 } from '@osdk/foundry.ontologies';

// Platform SDK types for dynamic API calls
type PlatformClient = ReturnType<typeof createPlatformClient>;

// v2 modules
import { loadConfig, ResolvedConfig } from './v2/config/index.js';
import { validateRuleLogic, extractObjectTypeId, extractWorkflowRid } from './v2/validation/schema.js';
import { validateProperties, getPropertySummary } from './v2/validation/properties.js';
import { validateFilterTypes, getFilterSummary } from './v2/validation/filters.js';
import { compress, decompress } from './v2/compression.js';
import { buildFromTemplate, getBuiltInTemplates, wrapFilterAsRuleLogic } from './v2/templates/index.js';
import { initWorkflowConfig, quickInit } from './v2/init/index.js';

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

interface CliArgs {
  configPath: string | null;
  command: string;
  args: string[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let configPath: string | null = null;
  let commandIndex = 0;

  // Parse --config flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      commandIndex = i + 2;
      break;
    } else if (args[i].startsWith('--config=')) {
      configPath = args[i].split('=')[1];
      commandIndex = i + 1;
      break;
    }
  }

  const command = args[commandIndex] || '';
  const commandArgs = args.slice(commandIndex + 1);

  return { configPath, command, args: commandArgs };
}

// =============================================================================
// CONFIG LOADING
// =============================================================================

function loadAndValidateConfig(configPath: string | null): ResolvedConfig {
  // Try to find config
  let actualPath = configPath;

  if (!actualPath) {
    // Look for default config
    const defaultPaths = [
      path.join(process.cwd(), 'config', 'default.json'),
      path.join(process.cwd(), 'config', 'demo-product.json'),
      path.join(__dirname, 'config', 'default.json'),
      path.join(__dirname, 'config', 'demo-product.json')
    ];

    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        actualPath = p;
        break;
      }
    }
  }

  if (!actualPath) {
    console.error('Error: No config file specified and no default found.');
    console.error('Use --config <path> to specify a config file.');
    process.exit(1);
  }

  const result = loadConfig(actualPath, { validateToken: false });

  if (!result.success || !result.config) {
    console.error('Config loading failed:');
    result.errors?.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  if (result.warnings?.length) {
    result.warnings.forEach(w => console.warn(`Warning: ${w}`));
  }

  return result.config;
}

// =============================================================================
// CLIENT FACTORY
// =============================================================================

function createFoundryClient(config: ResolvedConfig): PlatformClient {
  const token = config.foundry.token;

  if (!token) {
    console.error('Error: FOUNDRY_TOKEN environment variable required');
    process.exit(1);
  }

  return createPlatformClient(config.foundry.url, async () => token);
}

// Helper to get ontology identifier (can be RID or API name)
function getOntologyId(config: ResolvedConfig): string {
  return config.foundry.ontologyRid;
}

// =============================================================================
// VALIDATION
// =============================================================================

interface FullValidationResult {
  valid: boolean;
  structureErrors: string[];
  propertyErrors: string[];
  filterErrors: string[];
  filterWarnings: string[];
}

function performFullValidation(
  logic: unknown,
  config: ResolvedConfig
): FullValidationResult {
  const result: FullValidationResult = {
    valid: true,
    structureErrors: [],
    propertyErrors: [],
    filterErrors: [],
    filterWarnings: []
  };

  // Structure validation
  console.log('Validating structure...');
  const structureResult = validateRuleLogic(logic, config.validation);
  result.structureErrors = structureResult.errors;

  if (!structureResult.valid) {
    result.valid = false;
    return result;
  }
  console.log('  Structure valid');

  // Workflow RID validation
  const actualRid = extractWorkflowRid(logic);
  if (actualRid && actualRid !== config.workflow.workflowRid) {
    result.structureErrors.push(
      `workflowRid mismatch: config expects '${config.workflow.workflowRid}', got '${actualRid}'`
    );
    result.valid = false;
  }

  // Object type validation
  const actualObjType = extractObjectTypeId(logic);
  if (actualObjType && actualObjType !== config.workflow.objectType.id) {
    result.structureErrors.push(
      `objectTypeId mismatch: config expects '${config.workflow.objectType.id}', got '${actualObjType}'`
    );
    result.valid = false;
  }

  // Property validation
  console.log('Validating properties...');
  const propSummary = getPropertySummary(logic);
  console.log(`  Properties used: ${propSummary.properties.join(', ') || 'none'}`);

  const propResult = validateProperties(logic, config.workflow.objectType);
  result.propertyErrors = propResult.errors;

  if (!propResult.valid) {
    result.valid = false;
  } else {
    console.log('  All properties valid');
  }

  // Filter type validation
  console.log('Validating filter types...');
  const filterSummary = getFilterSummary(logic);
  console.log(`  String filters: ${filterSummary.stringFilters.join(', ') || 'none'}`);
  console.log(`  Numeric filters: ${filterSummary.numericFilters.join(', ') || 'none'}`);
  console.log(`  Null filters: ${filterSummary.nullFilters.join(', ') || 'none'}`);

  const filterResult = validateFilterTypes(logic, config.validation);
  result.filterErrors = filterResult.errors;
  result.filterWarnings = filterResult.warnings;

  if (!filterResult.valid) {
    result.valid = false;
  } else if (filterResult.warnings.length > 0) {
    console.log('  Filter types valid (with warnings)');
  } else {
    console.log('  All filter types valid');
  }

  return result;
}

// =============================================================================
// COMMANDS
// =============================================================================

async function cmdCreate(jsonFile: string, config: ResolvedConfig) {
  console.log(`Reading: ${jsonFile}`);
  const content = fs.readFileSync(jsonFile, 'utf8');

  let logic: unknown;
  let name: string;
  let description: string;
  let keywords: string;

  try {
    const parsed = JSON.parse(content);

    // Check if it's a template-based config or raw logic
    if (parsed.template && parsed.params) {
      console.log(`Building from template: ${parsed.template}`);
      const buildResult = buildFromTemplate(
        parsed.template,
        parsed.params,
        config.workflow
      );

      if (!buildResult.success || !buildResult.logic) {
        console.error('Template build failed:');
        buildResult.errors?.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }

      logic = buildResult.logic;
      name = parsed.name || `Rule-${Date.now()}`;
      description = parsed.description || config.conventions.defaultDescription || 'Created via CLI';
      keywords = parsed.keywords || config.conventions.defaultKeywords || 'cli-created';
    } else {
      // Raw rule logic
      logic = parsed;
      name = `Rule-${Date.now()}`;
      description = config.conventions.defaultDescription || 'Created from raw JSON via CLI';
      keywords = config.conventions.defaultKeywords || 'cli-created';
    }
  } catch (e) {
    console.error('Error parsing JSON:', (e as Error).message);
    process.exit(1);
  }

  // Full validation
  const validation = performFullValidation(logic, config);

  if (!validation.valid) {
    console.error('\nValidation failed:');
    validation.structureErrors.forEach(e => console.error(`  [Structure] ${e}`));
    validation.propertyErrors.forEach(e => console.error(`  [Property] ${e}`));
    validation.filterErrors.forEach(e => console.error(`  [Filter] ${e}`));
    process.exit(1);
  }

  if (validation.filterWarnings.length > 0) {
    console.warn('\nWarnings:');
    validation.filterWarnings.forEach(w => console.warn(`  ${w}`));
  }

  // Compress
  console.log('\nCompressing...');
  const compressed = compress(logic);
  const compressedValue = JSON.parse(compressed).compressedValue;
  console.log(`Compressed length: ${compressedValue.length}`);

  // Generate IDs
  const timestamp = Date.now();
  const proposalId = `${config.conventions.proposalIdPrefix}${timestamp}`;
  const ruleId = `${config.conventions.ruleIdPrefix}${timestamp}`;

  console.log(`\nCreating proposal: ${proposalId}`);
  console.log(`Name: ${name}`);

  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const actionApiName = config.sdk.actions.createProposal;

  console.log(`Using action: ${actionApiName}`);

  await Actions.apply(client, ontologyId, actionApiName, {
    parameters: {
      proposal_id: proposalId,
      rule_id: ruleId,
      new_rule_name: name,
      new_rule_description: description,
      new_logic: compressed,
      new_logic_keywords: keywords,
      proposal_author: config.conventions.defaultAuthor,
      proposal_creation_timestamp: new Date().toISOString(),
    }
  });

  console.log('\nSUCCESS!');
  console.log(`Proposal ID: ${proposalId}`);
  console.log(`Rule ID: ${ruleId}`);
}

async function cmdDecompress(proposalId: string, config: ResolvedConfig) {
  console.log(`Fetching proposal: ${proposalId}`);
  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const proposalObjectType = config.sdk.archetypes.proposal;

  console.log(`Using object type: ${proposalObjectType}`);

  const result = await OntologyObjectsV2.search(client, ontologyId, proposalObjectType, {
    where: {
      type: 'eq',
      field: 'proposalId',
      value: proposalId
    },
    select: ['proposalId', 'proposalStatus', 'proposalAuthor', 'newRuleName', 'newRuleLogic', 'ruleId']
  });

  if (!result.data || result.data.length === 0) {
    console.error(`Proposal not found: ${proposalId}`);
    process.exit(1);
  }

  const proposal = result.data[0] as Record<string, unknown>;
  console.log(`Found: ${proposal.proposalId}`);
  console.log(`Status: ${proposal.proposalStatus}`);
  console.log(`Author: ${proposal.proposalAuthor}`);
  console.log(`Name: ${proposal.newRuleName}`);

  const newLogic = proposal.newRuleLogic as string;
  if (!newLogic) {
    console.error('Proposal has no newLogic');
    process.exit(1);
  }

  console.log('\nDecompressing...');
  try {
    const logic = decompress(newLogic);
    console.log('\n=== DECOMPRESSED RULE LOGIC ===');
    console.log(JSON.stringify(logic, null, 2));
  } catch (e) {
    console.error('Decompression failed:', (e as Error).message);
    console.log('\nRaw newLogic:');
    console.log(newLogic);
  }
}

async function cmdApprove(proposalId: string, config: ResolvedConfig) {
  console.log(`Fetching proposal: ${proposalId}`);
  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const proposalObjectType = config.sdk.archetypes.proposal;

  const result = await OntologyObjectsV2.search(client, ontologyId, proposalObjectType, {
    where: {
      type: 'eq',
      field: 'proposalId',
      value: proposalId
    },
    select: ['proposalId', 'proposalStatus', 'ruleId']
  });

  if (!result.data || result.data.length === 0) {
    console.error(`Proposal not found: ${proposalId}`);
    process.exit(1);
  }

  const proposal = result.data[0] as Record<string, unknown>;
  console.log(`Found: ${proposal.proposalId}`);
  console.log(`Status: ${proposal.proposalStatus}`);

  if (proposal.proposalStatus !== 'OPEN') {
    console.error(`Proposal is not open (status: ${proposal.proposalStatus})`);
    process.exit(1);
  }

  const ruleId = proposal.ruleId as string;
  if (!ruleId) {
    console.error('Proposal has no ruleId');
    process.exit(1);
  }

  console.log('\nApproving proposal...');
  const actionApiName = config.sdk.actions.approveProposal;

  await Actions.apply(client, ontologyId, actionApiName, {
    parameters: {
      proposal_object: proposalId, // Use primary key for object reference
      proposal_review_timestamp: new Date().toISOString(),
      proposal_reviewer: config.conventions.defaultAuthor,
      rule_id: ruleId,
    }
  });

  console.log('\nSUCCESS! Proposal approved.');
  console.log(`Rule ID: ${ruleId}`);
}

async function cmdReject(proposalId: string, config: ResolvedConfig) {
  console.log(`Fetching proposal: ${proposalId}`);
  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const proposalObjectType = config.sdk.archetypes.proposal;

  const result = await OntologyObjectsV2.search(client, ontologyId, proposalObjectType, {
    where: {
      type: 'eq',
      field: 'proposalId',
      value: proposalId
    },
    select: ['proposalId', 'proposalStatus']
  });

  if (!result.data || result.data.length === 0) {
    console.error(`Proposal not found: ${proposalId}`);
    process.exit(1);
  }

  const proposal = result.data[0] as Record<string, unknown>;
  console.log(`Found: ${proposal.proposalId}`);
  console.log(`Status: ${proposal.proposalStatus}`);

  if (proposal.proposalStatus !== 'OPEN') {
    console.error(`Proposal is not open (status: ${proposal.proposalStatus})`);
    process.exit(1);
  }

  console.log('\nRejecting proposal...');
  const actionApiName = config.sdk.actions.rejectProposal;

  await Actions.apply(client, ontologyId, actionApiName, {
    parameters: {
      proposal_object: proposalId, // Use primary key for object reference
      proposal_review_timestamp: new Date().toISOString(),
      proposal_reviewer: config.conventions.defaultAuthor,
    }
  });

  console.log('\nSUCCESS! Proposal rejected.');
}

async function cmdListProposals(statusFilter: string | undefined, config: ResolvedConfig) {
  console.log('Fetching proposals...');
  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const proposalObjectType = config.sdk.archetypes.proposal;

  console.log(`Using object type: ${proposalObjectType}`);

  const searchBody: SearchObjectsRequestV2 = {
    select: ['proposalId', 'proposalStatus', 'newRuleName', 'proposalAuthor', 'proposalCreationTimestamp'],
    pageSize: 100,
    ...(statusFilter && {
      where: {
        type: 'eq',
        field: 'proposalStatus',
        value: statusFilter
      }
    })
  };

  const result = await OntologyObjectsV2.search(client, ontologyId, proposalObjectType, searchBody);

  console.log(`\n${'='.repeat(100)}`);
  console.log(`PROPOSALS ${statusFilter ? `(Status: ${statusFilter})` : '(All)'}`);
  console.log('='.repeat(100));
  console.log(
    'ID'.padEnd(35) +
    'Status'.padEnd(12) +
    'Name'.padEnd(30) +
    'Author'.padEnd(15) +
    'Created'
  );
  console.log('-'.repeat(100));

  const proposals = result.data || [];
  if (proposals.length === 0) {
    console.log('No proposals found.');
  } else {
    for (const p of proposals) {
      const prop = p as Record<string, unknown>;
      const created = prop.proposalCreationTimestamp
        ? new Date(prop.proposalCreationTimestamp as string).toLocaleDateString()
        : 'N/A';
      console.log(
        ((prop.proposalId as string) || 'N/A').padEnd(35) +
        ((prop.proposalStatus as string) || 'N/A').padEnd(12) +
        ((prop.newRuleName as string) || 'N/A').substring(0, 28).padEnd(30) +
        ((prop.proposalAuthor as string) || 'N/A').substring(0, 13).padEnd(15) +
        created
      );
    }
  }

  console.log('-'.repeat(100));
  console.log(`Total: ${proposals.length} proposals`);
}

async function cmdListRules(config: ResolvedConfig) {
  console.log('Fetching rules...');
  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const ruleObjectType = config.sdk.archetypes.rule;

  console.log(`Using object type: ${ruleObjectType}`);

  const result = await OntologyObjectsV2.list(client, ontologyId, ruleObjectType, {
    select: ['ruleId', 'ruleName', 'logicKeywords'],
    pageSize: 100
  });

  console.log(`\n${'='.repeat(100)}`);
  console.log('RULES');
  console.log('='.repeat(100));
  console.log(
    'ID'.padEnd(40) +
    'Name'.padEnd(35) +
    'Keywords'.padEnd(25)
  );
  console.log('-'.repeat(100));

  const rules = result.data || [];
  if (rules.length === 0) {
    console.log('No rules found.');
  } else {
    for (const r of rules) {
      const rule = r as Record<string, unknown>;
      console.log(
        ((rule.ruleId as string) || 'N/A').padEnd(40) +
        ((rule.ruleName as string) || 'N/A').substring(0, 33).padEnd(35) +
        ((rule.logicKeywords as string) || 'N/A').substring(0, 23).padEnd(25)
      );
    }
  }

  console.log('-'.repeat(100));
  console.log(`Total: ${rules.length} rules`);
}

async function cmdBatchReject(pattern: string, config: ResolvedConfig) {
  console.log(`Finding OPEN proposals matching pattern: "${pattern}"`);
  const client = createFoundryClient(config);
  const ontologyId = getOntologyId(config);
  const proposalObjectType = config.sdk.archetypes.proposal;

  const result = await OntologyObjectsV2.search(client, ontologyId, proposalObjectType, {
    where: {
      type: 'eq',
      field: 'proposalStatus',
      value: 'OPEN'
    },
    select: ['proposalId', 'newRuleName'],
    pageSize: 100
  });

  const proposals = result.data || [];
  const matching = proposals.filter((p: Record<string, unknown>) => {
    const id = (p.proposalId as string) || '';
    const name = (p.newRuleName as string) || '';
    return id.includes(pattern) || name.includes(pattern);
  });

  if (matching.length === 0) {
    console.log('No matching OPEN proposals found.');
    return;
  }

  console.log(`\nFound ${matching.length} proposals to reject:`);
  for (const p of matching) {
    const prop = p as Record<string, unknown>;
    console.log(`  - ${prop.proposalId}: ${prop.newRuleName}`);
  }

  console.log(`\nRejecting ${matching.length} proposals...`);

  let rejected = 0;
  let failed = 0;
  const actionApiName = config.sdk.actions.rejectProposal;

  for (const proposal of matching) {
    const prop = proposal as Record<string, unknown>;
    try {
      await Actions.apply(client, ontologyId, actionApiName, {
        parameters: {
          proposal_object: prop.proposalId, // Use primary key
          proposal_review_timestamp: new Date().toISOString(),
          proposal_reviewer: `${config.conventions.defaultAuthor}-batch`,
        }
      });
      console.log(`  ✓ Rejected: ${prop.proposalId}`);
      rejected++;
    } catch (e) {
      console.log(`  ✗ Failed: ${prop.proposalId} - ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`\nBatch reject complete: ${rejected} rejected, ${failed} failed`);
}

function cmdValidate(jsonFile: string, config: ResolvedConfig) {
  console.log(`Validating: ${jsonFile}`);

  const content = fs.readFileSync(jsonFile, 'utf8');
  let logic: unknown;

  try {
    const parsed = JSON.parse(content);

    // Handle template-based config
    if (parsed.template && parsed.params) {
      console.log(`Template: ${parsed.template}`);
      const buildResult = buildFromTemplate(
        parsed.template,
        parsed.params,
        config.workflow
      );

      if (!buildResult.success || !buildResult.logic) {
        console.error('Template build failed:');
        buildResult.errors?.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }

      logic = buildResult.logic;
    } else {
      logic = parsed;
    }
  } catch (e) {
    console.error('Invalid JSON:', (e as Error).message);
    process.exit(1);
  }

  const validation = performFullValidation(logic, config);

  if (validation.valid) {
    console.log('\nVALID - No errors found');

    // Show compressed preview
    const compressed = compress(logic);
    const compressedValue = JSON.parse(compressed).compressedValue;
    console.log(`\nCompressed length: ${compressedValue.length}`);
    console.log(`Preview: ${compressedValue.substring(0, 60)}...`);
  } else {
    console.error('\nINVALID - Errors found:');
    validation.structureErrors.forEach(e => console.error(`  [Structure] ${e}`));
    validation.propertyErrors.forEach(e => console.error(`  [Property] ${e}`));
    validation.filterErrors.forEach(e => console.error(`  [Filter] ${e}`));
    process.exit(1);
  }

  if (validation.filterWarnings.length > 0) {
    console.warn('\nWarnings:');
    validation.filterWarnings.forEach(w => console.warn(`  ${w}`));
  }
}

function cmdTemplate(templateArg: string, config: ResolvedConfig) {
  if (templateArg === '--list') {
    console.log('Available templates:\n');
    const templates = getBuiltInTemplates();
    for (const t of templates) {
      console.log(`  ${t.name.padEnd(20)} - ${t.description}`);
      console.log(`      Parameters: ${t.parameters.join(', ')}`);
    }

    // Also list templates from config
    if (config.templates?.length) {
      console.log('\nCustom templates from config:');
      for (const t of config.templates) {
        console.log(`  ${t.name.padEnd(20)} - ${t.description || 'No description'}`);
      }
    }
    return;
  }

  // Generate template
  const result = buildFromTemplate(templateArg, {
    propertyId: 'YOUR_PROPERTY_ID',
    value: 'YOUR_VALUE',
    values: ['value1', 'value2'],
    min: 0,
    max: 100,
    caseSensitive: false,
    isNull: true
  }, config.workflow);

  if (!result.success || !result.logic) {
    console.error(`Error generating template "${templateArg}":`, result.errors?.join(', '));
    process.exit(1);
  }

  // Output as a template file format
  const templateFile = {
    name: `Rule from ${templateArg} template`,
    description: `Generated from ${templateArg} template - edit values as needed`,
    keywords: 'template-generated',
    template: templateArg,
    params: {
      propertyId: 'YOUR_PROPERTY_ID',
      // Add appropriate params based on template
      ...(templateArg === 'string-equals' ? { value: 'YOUR_VALUE' } : {}),
      ...(templateArg === 'string-or' ? { values: ['value1', 'value2'] } : {}),
      ...(templateArg === 'numeric-range' ? { min: 0, max: 100 } : {}),
      ...(templateArg === 'null-check' ? { isNull: true } : {})
    },
    _rawLogicPreview: result.logic
  };

  console.log(JSON.stringify(templateFile, null, 2));
}

function cmdConfigShow(config: ResolvedConfig) {
  console.log('Current Configuration:\n');
  console.log(`Version: ${config.version}`);
  console.log(`\nWorkflow:`);
  console.log(`  Name: ${config.workflow.name}`);
  console.log(`  RID: ${config.workflow.workflowRid}`);
  console.log(`  Object Type: ${config.workflow.objectType.id}`);
  console.log(`  Properties: ${config.workflow.objectType.properties.map(p => p.id).join(', ')}`);
  console.log(`  Output ID: ${config.workflow.output.id}`);
  console.log(`\nFoundry:`);
  console.log(`  URL: ${config.foundry.url}`);
  console.log(`  Ontology: ${config.foundry.ontologyRid}`);
  console.log(`  Token: ${config.foundry.token ? '***' : '(not set)'}`);
  console.log(`\nValidation:`);
  console.log(`  Grammar: ${config.validation.grammarVersion}`);
  console.log(`  Strategy Types: ${config.validation.supportedStrategyTypes.join(', ')}`);
  console.log(`  String Filters: ${config.validation.supportedStringFilters.join(', ')}`);
  console.log(`\nConventions:`);
  console.log(`  Proposal Prefix: ${config.conventions.proposalIdPrefix}`);
  console.log(`  Rule Prefix: ${config.conventions.ruleIdPrefix}`);
  console.log(`  Default Author: ${config.conventions.defaultAuthor}`);
}

function cmdInit(workflowRid: string, name: string, outputDir?: string) {
  const foundryUrl = process.env.FOUNDRY_URL || process.env.VITE_FOUNDRY_URL || '';
  const ontologyRid = process.env.ONTOLOGY_RID || 'ri.ontology.main.ontology.a0e4fce1-dea7-4947-84bd-9f67d37a508e';

  if (!foundryUrl) {
    console.error('Error: FOUNDRY_URL environment variable required');
    process.exit(1);
  }

  const configPath = initWorkflowConfig({
    workflowRid,
    name,
    foundryUrl,
    ontologyRid,
    outputDir
  });

  console.log(`\nNext steps:`);
  console.log(`  1. Edit the generated config: ${configPath}`);
  console.log(`  2. Fill in TODO values from your Foundry Rules workflow`);
  console.log(`  3. Run: npx tsx src/proposal-cli-v2.ts --config ${configPath} template --list`);
}

function showHelp() {
  console.log(`
Proposal CLI v2 - Generic, Config-Driven Rule Proposal Management

Usage:
  npx tsx proposal-cli-v2.ts --config <config-file> <command> [args]

Options:
  --config <path>    Path to workflow config JSON file

Commands:
  init <workflow-rid> <name>   Auto-generate config from Foundry workflow
  create <json-file>           Create proposal from JSON file
  decompress <id>              Decompress rule logic from existing proposal
  validate <json-file>         Validate JSON against schema
  template <name>              Generate sample JSON template
  template --list              List available templates
  approve <id>                 Approve a pending proposal
  reject <id>                  Reject a pending proposal
  update <id> <json-file>      Update proposal with new logic
  list-proposals [status]      List all proposals (filter by OPEN/APPROVED/REJECTED)
  list-rules                   List all rules
  batch-reject <pattern>       Reject all OPEN proposals matching pattern
  config --show                Show current configuration
  config --validate            Validate config file syntax

Template-Based Rule File Format:
  {
    "name": "My Rule",
    "description": "Rule description",
    "keywords": "keyword1,keyword2",
    "template": "string-equals",
    "params": {
      "propertyId": "risk_level",
      "value": "high"
    }
  }

Examples:
  # List available templates
  npx tsx proposal-cli-v2.ts --config config/demo-product.json template --list

  # Generate a template
  npx tsx proposal-cli-v2.ts --config config/demo-product.json template string-equals > my-rule.json

  # Validate the JSON
  npx tsx proposal-cli-v2.ts --config config/demo-product.json validate my-rule.json

  # Create proposal (requires FOUNDRY_TOKEN)
  FOUNDRY_TOKEN=xxx npx tsx proposal-cli-v2.ts --config config/demo-product.json create my-rule.json

  # Show current config
  npx tsx proposal-cli-v2.ts --config config/demo-product.json config --show

Environment Variables:
  FOUNDRY_TOKEN    Foundry API token (required for Foundry operations)
  FOUNDRY_URL      Foundry URL (can be used instead of config value)
  ONTOLOGY_RID     Ontology RID (can be used instead of config value)
`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const { configPath, command, args } = parseArgs();

  // Handle help without config
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  // Load config
  const config = loadAndValidateConfig(configPath);

  // Execute command
  switch (command) {
    case 'create':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 create <json-file>');
        process.exit(1);
      }
      await cmdCreate(args[0], config);
      break;

    case 'decompress':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 decompress <proposal-id>');
        process.exit(1);
      }
      await cmdDecompress(args[0], config);
      break;

    case 'validate':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 validate <json-file>');
        process.exit(1);
      }
      cmdValidate(args[0], config);
      break;

    case 'template':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 template <name> or template --list');
        process.exit(1);
      }
      cmdTemplate(args[0], config);
      break;

    case 'approve':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 approve <proposal-id>');
        process.exit(1);
      }
      await cmdApprove(args[0], config);
      break;

    case 'reject':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 reject <proposal-id>');
        process.exit(1);
      }
      await cmdReject(args[0], config);
      break;

    case 'list-proposals':
      await cmdListProposals(args[0], config);
      break;

    case 'list-rules':
      await cmdListRules(config);
      break;

    case 'batch-reject':
      if (!args[0]) {
        console.error('Usage: proposal-cli-v2 batch-reject <pattern>');
        process.exit(1);
      }
      await cmdBatchReject(args[0], config);
      break;

    case 'config':
      if (args[0] === '--show') {
        cmdConfigShow(config);
      } else if (args[0] === '--validate') {
        console.log('Config file is valid!');
      } else {
        console.error('Usage: proposal-cli-v2 config --show|--validate');
        process.exit(1);
      }
      break;

    case 'init':
      if (!args[0] || !args[1]) {
        console.error('Usage: proposal-cli-v2 init <workflow-rid> <name> [output-dir]');
        console.error('Example: proposal-cli-v2 init ri.taurus.main.workflow.xxx "My Workflow"');
        process.exit(1);
      }
      cmdInit(args[0], args[1], args[2]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
