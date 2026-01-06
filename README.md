# Foundry Rules CLI

A config-driven CLI and library for managing Foundry Rules proposals. Create, validate, and manage rule proposals programmatically across any Foundry Rules workflow.

## Features

- **Config-Driven**: All workflow-specific values loaded from JSON config files
- **Init Command**: Auto-generate starter configs for new workflows
- **Template Support**: Built-in templates for common rule patterns (string-equals, string-or, numeric-range, null-check)
- **JSON Schema Validation**: Rule inputs validated against schema before submission
- **Complex Rules**: Support for AND/OR combinations with raw logic format
- **Library Mode**: Import functions for use in TypeScript Functions or Node.js

## Installation

```bash
npm install foundry-rules-cli
```

Or use directly from source:

```bash
git clone <repo>
cd foundry-rules-cli
npm install
npm run build
```

## Quick Start

```bash
# Set your Foundry token
export FOUNDRY_TOKEN=your_token_here
export FOUNDRY_URL=https://your-stack.palantirfoundry.com

# Initialize a new workflow config
npx foundry-rules init ri.taurus.main.workflow.xxxxx "My Workflow"

# Or use an existing config - list available templates
npx foundry-rules --config config/example-workflow.json template --list

# Generate a template file
npx foundry-rules --config config/example-workflow.json template string-equals > my-rule.json

# Edit the generated file with your rule values

# Validate before submitting
npx foundry-rules --config config/example-workflow.json validate my-rule.json

# Create proposal
npx foundry-rules --config config/example-workflow.json create my-rule.json

# List proposals
npx foundry-rules --config config/example-workflow.json list-proposals OPEN
```

## Commands

| Command | Description |
|---------|-------------|
| `init <workflow-rid> <name>` | Generate starter config for a workflow |
| `create <file>` | Create proposal from JSON file |
| `validate <file>` | Validate JSON without submitting |
| `template <name>` | Generate sample template |
| `template --list` | List available templates |
| `decompress <id>` | Show rule logic from proposal |
| `approve <id>` | Approve a proposal |
| `reject <id>` | Reject a proposal |
| `list-proposals [status]` | List proposals (OPEN/APPROVED/REJECTED) |
| `list-rules` | List all rules |
| `batch-reject <pattern>` | Reject matching proposals |
| `config --show` | Show current configuration |

## Rule Input Formats

### Template-Based (Simple)

For common filter patterns, use templates:

```json
{
  "$schema": "../config/rule-input-schema.json",
  "name": "High Priority Items",
  "description": "Filter items with high priority status",
  "keywords": "priority,high,filter",
  "template": "string-equals",
  "params": {
    "propertyId": "status",
    "value": "high"
  }
}
```

### Available Templates

| Template | Description | Required Params | Optional Params |
|----------|-------------|-----------------|-----------------|
| `string-equals` | Match exact string value | `propertyId`, `value` | `caseSensitive` |
| `string-or` | Match any of multiple values | `propertyId`, `values[]` | `caseSensitive` |
| `numeric-range` | Match numeric range | `propertyId`, `min` or `max` | both `min` and `max` |
| `null-check` | Check if null/not null | `propertyId` | `isNull` (default: true) |

### Raw Logic (Complex Rules)

For complex rules with AND/OR combinations:

```json
{
  "$schema": "../config/rule-input-schema.json",
  "name": "High-Value-Active-Items",
  "description": "Filter active items with high value using AND combination",
  "keywords": "complex,and,high-value,active",
  "grammarVersion": "V1",
  "workflowRid": "ri.taurus.main.workflow.00000000-0000-0000-0000-000000000000",
  "strategy": {
    "type": "filterNode",
    "filterNode": {
      "nodeInput": {
        "type": "source",
        "source": { "type": "objectTypeId", "objectTypeId": "namespace.your-object-type" }
      },
      "filter": {
        "type": "andFilterRule",
        "andFilterRule": {
          "filters": [
            { "type": "columnFilterRule", "columnFilterRule": { ... } },
            { "type": "columnFilterRule", "columnFilterRule": { ... } },
            { "type": "columnFilterRule", "columnFilterRule": { ... } }
          ]
        }
      }
    }
  },
  "effect": { ... }
}
```

See `samples/complex-and-filter.json` for a complete example.

## Configuration

### Workflow Config Structure

Each workflow needs a JSON config file:

```json
{
  "$schema": "./workflow-schema.json",
  "version": "1.0.0",
  "workflow": {
    "name": "Example Workflow",
    "workflowRid": "ri.taurus.main.workflow.xxxxx",
    "objectType": {
      "id": "namespace.your-object-type",
      "properties": [
        { "id": "category", "type": "string" },
        { "id": "status", "type": "string" },
        { "id": "amount", "type": "number" }
      ]
    },
    "output": {
      "id": "821a6877-c5bf-43c9-9bc4-bc967ef518b4",
      "version": "0.1.0"
    }
  },
  "foundry": {
    "url": "https://your-stack.palantirfoundry.com",
    "ontologyRid": "ri.ontology.main.ontology.xxxxx",
    "tokenEnvVar": "FOUNDRY_TOKEN"
  },
  "sdk": {
    "archetypes": {
      "proposal": "FoundryRulesProposalObjectArchetypeId1_7",
      "rule": "FoundryRulesRuleObjectArchetypeId1_7"
    },
    "actions": {
      "createProposal": "foundry-rules-create-add-proposal-1-1",
      "approveProposal": "foundry-rules-approve-add-proposal-1-1",
      "rejectProposal": "foundry-rules-reject-proposal-1-1",
      "editProposal": "foundry-rules-edit-proposal-1-1"
    }
  },
  "validation": {
    "grammarVersion": "V1",
    "supportedStrategyTypes": ["filterNode", "windowNode", "aggregationNode"],
    "supportedStringFilters": ["EQUALS", "CONTAINS", "MATCHES", "EQUALS_WITH_WILDCARDS"],
    "supportedNumericFilters": ["EQUALS", "GREATER_THAN", "LESS_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"],
    "supportedNullFilters": ["NULL", "NOT_NULL"]
  },
  "conventions": {
    "proposalIdPrefix": "PROP-TITLE-CURE-",
    "ruleIdPrefix": "RULE-TITLE-CURE-",
    "defaultAuthor": "proposal-cli-v2"
  }
}
```

### SDK Configuration (Critical)

The `sdk` section must match your Foundry Rules installation:

```json
"sdk": {
  "archetypes": {
    "proposal": "FoundryRulesProposalObjectArchetypeId1_7",
    "rule": "FoundryRulesRuleObjectArchetypeId1_7"
  },
  "actions": {
    "createProposal": "foundry-rules-create-add-proposal-1-1",
    "approveProposal": "foundry-rules-approve-add-proposal-1-1",
    "rejectProposal": "foundry-rules-reject-proposal-1-1",
    "editProposal": "foundry-rules-edit-proposal-1-1"
  }
}
```

**Finding Your API Names:**
- Use Foundry's Ontology Manager to find object types matching `FoundryRulesProposal*`
- Look for the highest version that is NOT trashed
- Action names follow pattern: `foundry-rules-{action}-proposal-{version}`

## Project Structure

```
foundry-rules-cli/
├── src/
│   ├── proposal-cli-v2.ts       # Main CLI implementation
│   ├── index.ts                 # Library exports
│   ├── bin/cli.ts               # CLI entry point
│   └── v2/
│       ├── config/              # Config loading & types
│       ├── validation/          # Schema, property, filter validation
│       ├── templates/           # Template builders
│       ├── init/                # Init command (config generator)
│       └── compression.ts       # LZ-string compression
├── config/
│   ├── example-workflow.json    # Example workflow config
│   ├── demo-product.json        # Demo workflow config
│   ├── rule-input-schema.json   # JSON Schema for rule inputs
│   └── workflow-schema.json     # JSON Schema for workflow configs
├── samples/                     # Example rule files
│   ├── simple-string-filter.json
│   ├── multi-value-filter.json
│   ├── numeric-range-filter.json
│   └── complex-and-filter.json
├── tests/                       # Test files
│   └── schema-validation.test.ts
├── dist/                        # Compiled output
└── package.json
```

## Library Usage

Import functions for programmatic use:

```typescript
import {
  loadConfig,
  validateProposal,
  createProposal,
  compress,
  decompress,
  buildFromTemplate
} from 'foundry-rules-cli';

// Load config
const config = loadConfig('config/example-workflow.json');

// Validate a proposal
const validation = validateProposal({
  template: 'string-equals',
  params: { propertyId: 'status', value: 'high' }
}, config);

// Create proposal
const result = await createProposal({
  name: 'My Rule',
  template: 'string-equals',
  params: { propertyId: 'status', value: 'high' }
}, config);
```

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run from source (development)
npx tsx src/proposal-cli-v2.ts --config config/example-workflow.json <command>

# Run CLI in dev mode
npm run cli:dev -- --config config/example-workflow.json <command>
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FOUNDRY_TOKEN` | Foundry API token (required for API calls) |
| `FOUNDRY_URL` | Foundry stack URL (for init command) |
| `ONTOLOGY_RID` | Ontology RID (optional, has default) |

## Troubleshooting

### "Object type not found" (404)
- Verify the `sdk.archetypes.proposal` value matches your ontology
- Check that the archetype is not trashed (use Foundry Ontology Manager)
- Use the latest version (currently v1.7)

### "Action not found"
- Verify the `sdk.actions.*` values match your ontology
- Action names use kebab-case: `foundry-rules-create-add-proposal-1-1`
- Check that you have permissions to execute the action

### Token issues
- Ensure `FOUNDRY_TOKEN` is exported: `export FOUNDRY_TOKEN=xxx`
- Verify the token has `api:ontologies-read` and `api:ontologies-write` scopes
- Token should not be expired

### Proposals not visible in UI
- Ensure you're on the correct branch in Foundry Rules App
- Check that the archetype version matches the Rules App installation
- Use `list-proposals` to verify proposals were created

## Testing

The project uses Vitest for testing:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/schema-validation.test.ts
```

Test coverage includes:
- JSON Schema validation for all template types
- Field constraints (name length, keywords pattern)
- Sample file validation
