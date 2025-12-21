# Foundry Rules CLI

A config-driven CLI for managing Foundry Rules proposals. Create, validate, and manage rule proposals programmatically across any Foundry Rules workflow version.

## Features

- **Version-Agnostic**: Works with any Foundry Rules version (1_2, 1_3, 1_4, 1_5, etc.)
- **Config-Driven**: All workflow-specific values loaded from JSON config files
- **Dynamic API Calls**: Uses Platform SDK for dynamic object/action access
- **Template Support**: Built-in templates for common rule patterns
- **Validation**: Comprehensive validation before submission

## Installation

```bash
npm install @foundry-tools/foundry-rules-cli
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

# List available templates
npx foundry-rules --config config/rule2.json template --list

# Generate a template file
npx foundry-rules --config config/rule2.json template string-equals > my-rule.json

# Edit the generated file with your rule values

# Validate before submitting
npx foundry-rules --config config/rule2.json validate my-rule.json

# Create proposal
npx foundry-rules --config config/rule2.json create my-rule.json

# List proposals
npx foundry-rules --config config/rule2.json list-proposals OPEN
```

## Commands

| Command | Description |
|---------|-------------|
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

## Configuration

### Workflow Config Structure

Each workflow needs a JSON config file that defines:

```json
{
  "$schema": "./workflow-schema.json",
  "version": "1.0.0",
  "workflow": {
    "name": "My Workflow",
    "workflowRid": "ri.taurus.main.workflow.xxxxx",
    "objectType": {
      "id": "my-object-type",
      "properties": [...]
    },
    "output": { ... }
  },
  "foundry": {
    "url": "https://your-stack.palantirfoundry.com",
    "ontologyRid": "ri.ontology.main.ontology.xxxxx",
    "tokenEnvVar": "FOUNDRY_TOKEN"
  },
  "sdk": {
    "archetypes": {
      "proposal": "FoundryRulesProposalObjectArchetypeId1_5",
      "rule": "FoundryRulesRuleObjectArchetypeId1_5"
    },
    "actions": {
      "createProposal": "foundry-rules-create-add-proposal-1-2",
      "approveProposal": "foundry-rules-approve-add-proposal-1-2",
      "rejectProposal": "foundry-rules-reject-proposal-1-2",
      "editProposal": "foundry-rules-edit-proposal-1-2"
    }
  },
  "validation": { ... },
  "conventions": { ... }
}
```

### SDK Configuration (Key Section)

The `sdk` section is critical for targeting the correct Foundry Rules version:

```json
"sdk": {
  "archetypes": {
    "proposal": "FoundryRulesProposalObjectArchetypeId1_5",
    "rule": "FoundryRulesRuleObjectArchetypeId1_5"
  },
  "actions": {
    "createProposal": "foundry-rules-create-add-proposal-1-2",
    "approveProposal": "foundry-rules-approve-add-proposal-1-2",
    "rejectProposal": "foundry-rules-reject-proposal-1-2",
    "editProposal": "foundry-rules-edit-proposal-1-2"
  }
}
```

**Finding Your API Names:**

Use Foundry's Ontology search or the MCP tools to find the correct API names:
- Object types: Look for `FoundryRulesProposalObjectArchetypeId{version}`
- Actions: Look for `foundry-rules-{action}-proposal-{version}`

**Common Version Mappings:**

| Rules Version | Object Type Suffix | Action Suffix |
|--------------|-------------------|---------------|
| 1.1 | `1_1` | `1` |
| 1.2 | `1_2` | `1-1` |
| 1.3 | `1_3` | `1-1` |
| 1.4 | `1_4` | `1-1` |
| 1.5 | `1_5` | `1-2` |

## Templates

| Template | Description | Parameters |
|----------|-------------|------------|
| `string-equals` | Match exact string value | `propertyId`, `value` |
| `string-or` | Match any of multiple values | `propertyId`, `values[]` |
| `numeric-range` | Match numeric range | `propertyId`, `min?`, `max?` |
| `null-check` | Check if null/not null | `propertyId`, `isNull?` |

### Template-Based Rule File

```json
{
  "name": "High Risk Products",
  "description": "Matches products with high risk level",
  "keywords": "risk,high",
  "template": "string-equals",
  "params": {
    "propertyId": "risk_level",
    "value": "high"
  }
}
```

### Raw Rule Logic

For complex rules (AND/OR combinations), use raw rule logic format. See `samples/complex-price-risk.json` for an example.

## Project Structure

```
foundry-rules-cli/
├── src/
│   ├── proposal-cli-v2.ts       # Main CLI
│   ├── bin/cli.ts               # CLI entry point
│   └── v2/
│       ├── config/              # Config loading & types
│       ├── validation/          # Schema, property, filter validation
│       ├── templates/           # Template builders
│       └── compression.ts       # LZ-string compression
├── config/
│   ├── rule2.json               # Example workflow config
│   └── workflow-schema.json     # JSON Schema for configs
├── prompts/templates/           # Template definitions
├── samples/                     # Example rule files
├── dist/                        # Compiled output
└── package.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FOUNDRY_TOKEN` | Foundry API token (required for API calls) |

## Supported Filter Types

| Category | Types |
|----------|-------|
| String | `EQUALS`, `CONTAINS`, `MATCHES`, `EQUALS_WITH_WILDCARDS` |
| Numeric | `EQUALS`, `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL` |
| Null | `NULL`, `NOT_NULL` |

## Strategy Types

- `filterNode` - Filter objects based on conditions
- `windowNode` - Apply window functions (SUM, AVG, etc.)
- `aggregationNode` - Group and aggregate data

## Development

```bash
# Build
npm run build

# Run from source (development)
npx tsx src/proposal-cli-v2.ts --config config/rule2.json <command>

# Run from built output
node dist/proposal-cli-v2.js --config config/rule2.json <command>
```

## Architecture

The CLI uses the Palantir Platform SDK (`@osdk/foundry.ontologies`) for dynamic API access:

- **`OntologyObjectsV2.search()`** - Query proposals/rules by object type API name
- **`Actions.apply()`** - Execute actions by action API name

This allows the CLI to work with any Foundry Rules version without code changes - just update the config file.

## Troubleshooting

### "Object type not found" (404)
- Verify the `sdk.archetypes.proposal` value matches your ontology
- Use Foundry Ontology Manager to find the correct API name

### "Action not found"
- Verify the `sdk.actions.*` values match your ontology
- Check that the action exists and you have permissions

### Token issues
- Ensure `FOUNDRY_TOKEN` is exported in your shell
- Verify the token has `api:ontologies-read` and `api:ontologies-write` scopes
