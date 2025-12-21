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
import { createClient } from '@osdk/client';

// Import OSDK types dynamically based on config
import {
  foundryRulesCreateAddProposal11,
  foundryRulesApproveAddProposal11,
  foundryRulesRejectProposal11,
  foundryRulesEditProposal11,
  FoundryRulesProposalObjectArchetypeId1_4,
  FoundryRulesRuleObjectArchetypeId1_4
} from '@title-review-app/sdk';

// v2 modules
import { loadConfig, ResolvedConfig } from './v2/config/index.js';
import { validateRuleLogic, extractObjectTypeId, extractWorkflowRid } from './v2/validation/schema.js';
import { validateProperties, getPropertySummary } from './v2/validation/properties.js';
import { validateFilterTypes, getFilterSummary } from './v2/validation/filters.js';
import { compress, decompress } from './v2/compression.js';
import { buildFromTemplate, getBuiltInTemplates, wrapFilterAsRuleLogic } from './v2/templates/index.js';

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

function createFoundryClient(config: ResolvedConfig) {
  const token = config.foundry.token;

  if (!token) {
    console.error('Error: FOUNDRY_TOKEN environment variable required');
    process.exit(1);
  }

  return createClient(config.foundry.url, config.foundry.ontologyRid, async () => token);
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

  await client(foundryRulesCreateAddProposal11).applyAction({
    proposal_id: proposalId,
    rule_id: ruleId,
    new_rule_name: name,
    new_rule_description: description,
    new_logic: compressed,
    new_logic_keywords: keywords,
    proposal_author: config.conventions.defaultAuthor,
    proposal_creation_timestamp: new Date().toISOString(),
  });

  console.log('\nSUCCESS!');
  console.log(`Proposal ID: ${proposalId}`);
  console.log(`Rule ID: ${ruleId}`);
}

async function cmdDecompress(proposalId: string, config: ResolvedConfig) {
  console.log(`Fetching proposal: ${proposalId}`);
  const client = createFoundryClient(config);

  const proposals = await client(FoundryRulesProposalObjectArchetypeId1_4)
    .where({ proposalId: { $eq: proposalId } })
    .fetchPage({ $pageSize: 1 });

  if (proposals.data.length === 0) {
    console.error(`Proposal not found: ${proposalId}`);
    process.exit(1);
  }

  const proposal = proposals.data[0];
  console.log(`Found: ${proposal.proposalId}`);
  console.log(`Status: ${proposal.proposalStatus}`);
  console.log(`Author: ${proposal.proposalAuthor}`);
  console.log(`Name: ${proposal.newRuleName}`);

  const newLogic = proposal.newRuleLogic;
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

  const proposals = await client(FoundryRulesProposalObjectArchetypeId1_4)
    .where({ proposalId: { $eq: proposalId } })
    .fetchPage({ $pageSize: 1 });

  if (proposals.data.length === 0) {
    console.error(`Proposal not found: ${proposalId}`);
    process.exit(1);
  }

  const proposal = proposals.data[0];
  console.log(`Found: ${proposal.proposalId}`);
  console.log(`Status: ${proposal.proposalStatus}`);

  if (proposal.proposalStatus !== 'OPEN') {
    console.error(`Proposal is not open (status: ${proposal.proposalStatus})`);
    process.exit(1);
  }

  const ruleId = proposal.ruleId;
  if (!ruleId) {
    console.error('Proposal has no ruleId');
    process.exit(1);
  }

  console.log('\nApproving proposal...');
  await client(foundryRulesApproveAddProposal11).applyAction({
    proposal_object: proposal,
    proposal_review_timestamp: new Date().toISOString(),
    proposal_reviewer: config.conventions.defaultAuthor,
    rule_id: ruleId,
  });

  console.log('\nSUCCESS! Proposal approved.');
  console.log(`Rule ID: ${ruleId}`);
}

async function cmdReject(proposalId: string, config: ResolvedConfig) {
  console.log(`Fetching proposal: ${proposalId}`);
  const client = createFoundryClient(config);

  const proposals = await client(FoundryRulesProposalObjectArchetypeId1_4)
    .where({ proposalId: { $eq: proposalId } })
    .fetchPage({ $pageSize: 1 });

  if (proposals.data.length === 0) {
    console.error(`Proposal not found: ${proposalId}`);
    process.exit(1);
  }

  const proposal = proposals.data[0];
  console.log(`Found: ${proposal.proposalId}`);
  console.log(`Status: ${proposal.proposalStatus}`);

  if (proposal.proposalStatus !== 'OPEN') {
    console.error(`Proposal is not open (status: ${proposal.proposalStatus})`);
    process.exit(1);
  }

  console.log('\nRejecting proposal...');
  await client(foundryRulesRejectProposal11).applyAction({
    proposal_object: proposal,
    proposal_review_timestamp: new Date().toISOString(),
    proposal_reviewer: config.conventions.defaultAuthor,
  });

  console.log('\nSUCCESS! Proposal rejected.');
}

async function cmdListProposals(statusFilter: string | undefined, config: ResolvedConfig) {
  console.log('Fetching proposals...');
  const client = createFoundryClient(config);

  let query = client(FoundryRulesProposalObjectArchetypeId1_4);

  if (statusFilter) {
    query = query.where({ proposalStatus: { $eq: statusFilter } });
  }

  const proposals = await query.fetchPage({ $pageSize: 100 });

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

  if (proposals.data.length === 0) {
    console.log('No proposals found.');
  } else {
    for (const p of proposals.data) {
      const created = p.proposalCreationTimestamp
        ? new Date(p.proposalCreationTimestamp).toLocaleDateString()
        : 'N/A';
      console.log(
        (p.proposalId || 'N/A').padEnd(35) +
        (p.proposalStatus || 'N/A').padEnd(12) +
        (p.newRuleName || 'N/A').substring(0, 28).padEnd(30) +
        (p.proposalAuthor || 'N/A').substring(0, 13).padEnd(15) +
        created
      );
    }
  }

  console.log('-'.repeat(100));
  console.log(`Total: ${proposals.data.length} proposals`);
}

async function cmdListRules(config: ResolvedConfig) {
  console.log('Fetching rules...');
  const client = createFoundryClient(config);

  const rules = await client(FoundryRulesRuleObjectArchetypeId1_4)
    .fetchPage({ $pageSize: 100 });

  console.log(`\n${'='.repeat(100)}`);
  console.log('RULES');
  console.log('='.repeat(100));
  console.log(
    'ID'.padEnd(40) +
    'Name'.padEnd(35) +
    'Keywords'.padEnd(25)
  );
  console.log('-'.repeat(100));

  if (rules.data.length === 0) {
    console.log('No rules found.');
  } else {
    for (const r of rules.data) {
      console.log(
        (r.ruleId || 'N/A').padEnd(40) +
        (r.ruleName || 'N/A').substring(0, 33).padEnd(35) +
        (r.logicKeywords || 'N/A').substring(0, 23).padEnd(25)
      );
    }
  }

  console.log('-'.repeat(100));
  console.log(`Total: ${rules.data.length} rules`);
}

async function cmdBatchReject(pattern: string, config: ResolvedConfig) {
  console.log(`Finding OPEN proposals matching pattern: "${pattern}"`);
  const client = createFoundryClient(config);

  const proposals = await client(FoundryRulesProposalObjectArchetypeId1_4)
    .where({ proposalStatus: { $eq: 'OPEN' } })
    .fetchPage({ $pageSize: 100 });

  const matching = proposals.data.filter(p =>
    p.proposalId?.includes(pattern) || p.newRuleName?.includes(pattern)
  );

  if (matching.length === 0) {
    console.log('No matching OPEN proposals found.');
    return;
  }

  console.log(`\nFound ${matching.length} proposals to reject:`);
  for (const p of matching) {
    console.log(`  - ${p.proposalId}: ${p.newRuleName}`);
  }

  console.log(`\nRejecting ${matching.length} proposals...`);

  let rejected = 0;
  let failed = 0;

  for (const proposal of matching) {
    try {
      await client(foundryRulesRejectProposal11).applyAction({
        proposal_object: proposal,
        proposal_review_timestamp: new Date().toISOString(),
        proposal_reviewer: `${config.conventions.defaultAuthor}-batch`,
      });
      console.log(`  ✓ Rejected: ${proposal.proposalId}`);
      rejected++;
    } catch (e) {
      console.log(`  ✗ Failed: ${proposal.proposalId} - ${(e as Error).message}`);
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

function showHelp() {
  console.log(`
Proposal CLI v2 - Generic, Config-Driven Rule Proposal Management

Usage:
  npx tsx proposal-cli-v2.ts --config <config-file> <command> [args]

Options:
  --config <path>    Path to workflow config JSON file

Commands:
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
