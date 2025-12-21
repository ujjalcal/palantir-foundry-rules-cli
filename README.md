# Foundry Rules Proposal CLI v2

A config-driven CLI for managing Foundry Rules proposals. Create, validate, and manage rule proposals programmatically.

## Quick Start

```bash
# List available templates
npx tsx proposal-cli-v2.ts --config config/demo-product.json template --list

# Generate a template file
npx tsx proposal-cli-v2.ts --config config/demo-product.json template string-equals > my-rule.json

# Validate before submitting
npx tsx proposal-cli-v2.ts --config config/demo-product.json validate my-rule.json

# Create proposal (requires FOUNDRY_TOKEN)
FOUNDRY_TOKEN=xxx npx tsx proposal-cli-v2.ts --config config/demo-product.json create my-rule.json

# List proposals
FOUNDRY_TOKEN=xxx npx tsx proposal-cli-v2.ts --config config/demo-product.json list-proposals OPEN
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
osdk-test/
├── proposal-cli-v2.ts       # Main CLI
├── config/
│   ├── demo-product.json    # Workflow configuration
│   └── workflow-schema.json # JSON Schema for configs
├── v2/
│   ├── config/              # Config loading & types
│   ├── validation/          # Schema, property, filter validation
│   ├── templates/           # Template builders
│   └── compression.ts       # LZ-string compression
├── prompts/templates/       # Template definitions
├── samples/                 # Example rule files
└── archive/v1/              # Original CLI (archived)
```

## Configuration

Workflow configs define:
- **workflow**: Object type, properties, output settings
- **foundry**: URL, ontology RID, token env var
- **validation**: Supported filter types, strategy types
- **conventions**: ID prefixes, default author

See `config/demo-product.json` for a complete example.

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
