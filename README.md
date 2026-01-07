# Foundry Rules CLI

Config-driven CLI and Python library for managing Foundry Rules proposals.

## Features

- **Validation** - Validate proposal JSON against workflow schema
- **Templates** - Built-in filter templates for common use cases
- **Compression** - LZ-string compression for rule logic
- **REST API** - Direct Foundry API integration
- **Library SDK** - Programmatic access via Python

## Installation

### Conda

```bash
conda install foundry-rules-cli -c local
```

### Pip

```bash
pip install -e .
```

### Build from Source (Conda)

```bash
conda build conda_recipe
conda install --use-local foundry-rules-cli
```

## CLI Usage

### Initialize Config

Generate a config template:

```bash
foundry-rules init --output config.json
```

Edit the generated config with your workflow details.

### Validate a Proposal

```bash
export FOUNDRY_TOKEN="your-token"
foundry-rules validate proposal.json --config config.json
```

### Create a Proposal

```bash
foundry-rules create proposal.json --config config.json
```

### Approve a Proposal

```bash
foundry-rules approve PROP-123 RULE-123 --config config.json
```

### Reject a Proposal

```bash
foundry-rules reject PROP-123 --config config.json
```

### Bulk Reject Proposals

```bash
foundry-rules bulk-reject PROP-1 PROP-2 PROP-3 --config config.json
```

### Edit a Proposal

```bash
foundry-rules edit PROP-123 --name "New Name" --description "Updated" --config config.json
```

### List Templates

```bash
foundry-rules template --list
```

### Show Template Details

```bash
foundry-rules template string-equals
```

### Compression Utilities

```bash
# Compress rule logic
foundry-rules compress '{"type": "filterNode", ...}'

# Decompress
foundry-rules decompress '{"compressedValue": "...", "type": "compressedValue"}'
```

### Version

```bash
foundry-rules version
```

## Proposal Format

Using a template:

```json
{
  "name": "My Rule",
  "description": "Filter description",
  "template": "string-equals",
  "params": {
    "propertyId": "category",
    "value": "Electronics"
  }
}
```

Using raw rule logic:

```json
{
  "name": "My Rule",
  "description": "Filter description",
  "ruleLogic": {
    "type": "filterNode",
    "filter": {
      "type": "stringFilter",
      "propertyId": "category",
      "operation": "EQUALS",
      "value": "Electronics"
    }
  }
}
```

## Built-in Templates

| Template | Description | Parameters |
|----------|-------------|------------|
| `string-equals` | String equality filter | `propertyId`, `value` |
| `string-or` | OR filter with multiple values | `propertyId`, `values` (array) |
| `numeric-range` | Numeric range filter | `propertyId`, `min`, `max` |
| `null-check` | Null/not-null check | `propertyId`, `isNull` (boolean) |

### Template Examples

**string-equals**
```json
{
  "template": "string-equals",
  "params": { "propertyId": "status", "value": "ACTIVE" }
}
```

**string-or**
```json
{
  "template": "string-or",
  "params": { "propertyId": "priority", "values": ["HIGH", "CRITICAL"] }
}
```

**numeric-range**
```json
{
  "template": "numeric-range",
  "params": { "propertyId": "amount", "min": 100, "max": 1000 }
}
```

**null-check**
```json
{
  "template": "null-check",
  "params": { "propertyId": "assignee", "isNull": false }
}
```

## Library Usage

```python
from foundry_rules import (
    load_config,
    create_proposal,
    approve_proposal,
    reject_proposal,
    edit_proposal,
    bulk_reject_proposals,
    ProposalInput,
)

# Load config
result = load_config("config.json")
config = result.config

# Create proposal
proposal = ProposalInput(
    name="My Rule",
    template="string-equals",
    params={"propertyId": "category", "value": "Electronics"}
)
result = create_proposal(proposal, config)
print(f"Created: {result.proposal_id}")

# Approve proposal
result = approve_proposal("PROP-123", "RULE-456", config)

# Reject proposal
result = reject_proposal("PROP-123", config)

# Edit proposal
result = edit_proposal(
    proposal_id="PROP-123",
    name="Updated Name",
    description="Updated description",
    config=config
)

# Bulk reject
result = bulk_reject_proposals(["PROP-1", "PROP-2"], config)
```

## Configuration

### Config File Structure

```json
{
  "version": "1.0",
  "workflow": {
    "name": "My Workflow",
    "workflowRid": "ri.taurus.main.workflow.xxx",
    "objectType": {
      "id": "my-object-type",
      "properties": [
        { "id": "status", "type": "string" },
        { "id": "priority", "type": "string" },
        { "id": "amount", "type": "numeric" }
      ]
    },
    "output": {
      "id": "output-id",
      "version": "0.1.0"
    }
  },
  "foundry": {
    "url": "https://your-stack.palantirfoundry.com",
    "ontologyRid": "ri.ontology.main.ontology.xxx",
    "tokenEnvVar": "FOUNDRY_TOKEN"
  },
  "sdk": {
    "packageName": "@your/sdk",
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
    "supportedStrategyTypes": ["filterNode"],
    "supportedStringFilters": ["EQUALS", "CONTAINS"],
    "supportedNumericFilters": ["EQUALS", "GREATER_THAN", "LESS_THAN"],
    "supportedNullFilters": ["NULL", "NOT_NULL"]
  },
  "conventions": {
    "proposalIdPrefix": "PROP-",
    "ruleIdPrefix": "RULE-",
    "defaultAuthor": "cli-user",
    "defaultDescription": "Created via CLI",
    "defaultKeywords": "cli,automated"
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `FOUNDRY_TOKEN` | Foundry API token (required) |

The token can also be specified via `tokenEnvVar` in the config to use a different environment variable name.

## Development

### Install Dev Dependencies

```bash
pip install -e ".[dev]"
```

### Run Tests

```bash
pytest
```

### Run Linter

```bash
ruff check src tests
```

### Project Structure

```
├── pyproject.toml
├── conda_recipe/
│   └── meta.yaml
├── src/
│   ├── setup.py
│   └── foundry_rules/
│       ├── __init__.py
│       ├── cli.py
│       ├── api.py
│       ├── sdk.py
│       ├── compression.py
│       ├── config/
│       │   ├── types.py
│       │   ├── loader.py
│       │   └── resolver.py
│       ├── templates/
│       │   └── builders.py
│       └── validation/
│           ├── schema.py
│           ├── properties.py
│           └── filters.py
└── tests/
    ├── test_compression.py
    ├── test_config.py
    ├── test_validation.py
    ├── test_templates.py
    └── test_sdk.py
```
