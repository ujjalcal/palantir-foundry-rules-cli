/**
 * Init Command - Generate workflow config template
 *
 * Generates a starter config file with default archetypes/actions (1_7 version).
 * Users can customize the config based on their Foundry Rules workflow settings.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface InitOptions {
  workflowRid: string;
  name: string;
  foundryUrl: string;
  ontologyRid: string;
  outputDir?: string;
}

export interface DiscoveredWorkflow {
  workflowRid: string;
  name: string;
  objectType: {
    id: string;
    properties: Array<{ id: string; type: string; description?: string }>;
  };
  output: {
    id: string;
    version: string;
  };
  archetypes: {
    proposal: string;
    rule: string;
  };
  actions: {
    createProposal: string;
    approveProposal: string;
    rejectProposal: string;
    editProposal: string;
  };
}

/**
 * Get default Foundry Rules archetypes and actions (v1.7)
 * These are the latest stable versions as of 2024
 */
function getDefaultArchetypesAndActions(): {
  archetypes: DiscoveredWorkflow['archetypes'];
  actions: DiscoveredWorkflow['actions']
} {
  return {
    archetypes: {
      proposal: 'FoundryRulesProposalObjectArchetypeId1_7',
      rule: 'FoundryRulesRuleObjectArchetypeId1_7'
    },
    actions: {
      createProposal: 'foundry-rules-create-add-proposal-1-1',
      approveProposal: 'foundry-rules-approve-add-proposal-1-1',
      rejectProposal: 'foundry-rules-reject-proposal-1-1',
      editProposal: 'foundry-rules-edit-proposal-1-1'
    }
  };
}

/**
 * Generate a config file for a workflow
 */
export function initWorkflowConfig(options: InitOptions): string {
  console.log(`\nGenerating workflow configuration...`);
  console.log(`  Workflow RID: ${options.workflowRid}`);
  console.log(`  Ontology RID: ${options.ontologyRid}`);

  // Use default archetypes and actions (v1.7)
  console.log(`\nUsing default Foundry Rules archetypes and actions (v1.7)...`);
  const { archetypes, actions } = getDefaultArchetypesAndActions();

  console.log(`  Proposal archetype: ${archetypes.proposal}`);
  console.log(`  Rule archetype: ${archetypes.rule}`);
  console.log(`  Create action: ${actions.createProposal}`);

  // Generate config
  const config = {
    "$schema": "./workflow-schema.json",
    "version": "1.0.0",
    "workflow": {
      "name": options.name,
      "workflowRid": options.workflowRid,
      "objectType": {
        "id": "TODO_OBJECT_TYPE_ID",
        "dynamicLookup": false,
        "properties": [
          { "id": "TODO_PROPERTY_1", "type": "string", "description": "TODO" },
          { "id": "TODO_PROPERTY_2", "type": "string", "description": "TODO" }
        ]
      },
      "output": {
        "id": "TODO_OUTPUT_ID",
        "version": "0.1.0",
        "parameters": []
      }
    },
    "foundry": {
      "url": options.foundryUrl,
      "ontologyRid": options.ontologyRid,
      "tokenEnvVar": "FOUNDRY_TOKEN"
    },
    "sdk": {
      "packageName": `@${options.name.toLowerCase().replace(/\s+/g, '-')}/sdk`,
      "archetypes": archetypes,
      "actions": actions
    },
    "validation": {
      "grammarVersion": "V1",
      "supportedStrategyTypes": ["filterNode", "windowNode", "aggregationNode"],
      "supportedStringFilters": ["EQUALS", "CONTAINS", "MATCHES", "EQUALS_WITH_WILDCARDS"],
      "unsupportedStringFilters": ["REGEX", "STARTS_WITH", "ENDS_WITH"],
      "supportedNumericFilters": ["EQUALS", "GREATER_THAN", "LESS_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"],
      "supportedNullFilters": ["NULL", "NOT_NULL"]
    },
    "conventions": {
      "proposalIdPrefix": `PROP-${options.name.toUpperCase().replace(/\s+/g, '-')}-`,
      "ruleIdPrefix": `RULE-${options.name.toUpperCase().replace(/\s+/g, '-')}-`,
      "defaultAuthor": "proposal-cli-v2",
      "defaultDescription": `Created via CLI for ${options.name}`,
      "defaultKeywords": options.name.toLowerCase().replace(/\s+/g, ',')
    },
    "templates": []
  };

  // Write config file
  const outputDir = options.outputDir || path.join(process.cwd(), 'config');
  const fileName = `${options.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  const outputPath = path.join(outputDir, fileName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));

  console.log(`\n✅ Config generated: ${outputPath}`);
  console.log(`\n⚠️  TODO: Update the following in the generated config:`);
  console.log(`   - workflow.objectType.id (get from Foundry Rules workflow settings)`);
  console.log(`   - workflow.objectType.properties (list your object type properties)`);
  console.log(`   - workflow.output.id (get from Foundry Rules workflow output settings)`);

  return outputPath;
}

/**
 * Quick init with minimal params - uses defaults from env vars
 */
export function quickInit(
  workflowRid: string,
  name: string
): string {
  const foundryUrl = process.env.FOUNDRY_URL || process.env.VITE_FOUNDRY_URL || '';
  const ontologyRid = process.env.ONTOLOGY_RID || 'ri.ontology.main.ontology.a0e4fce1-dea7-4947-84bd-9f67d37a508e';

  if (!foundryUrl) {
    throw new Error('FOUNDRY_URL environment variable required');
  }

  return initWorkflowConfig({
    workflowRid,
    name,
    foundryUrl,
    ontologyRid
  });
}
