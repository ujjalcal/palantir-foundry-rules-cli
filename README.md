# Foundry Rules CLI (Python)

Config-driven CLI and library for managing Foundry Rules proposals.

## Installation

```bash
pip install -e .
```

## Usage

### Initialize Config

```bash
foundry-rules init --output config.json
```

Edit the generated config file with your workflow details.

### Validate a Proposal

```bash
export FOUNDRY_TOKEN="your-token"
foundry-rules validate proposal.json --config config.json
```

### Create a Proposal

```bash
foundry-rules create proposal.json --config config.json
```

### Approve/Reject Proposals

```bash
foundry-rules approve PROP-123 RULE-123 --config config.json
foundry-rules reject PROP-123 --config config.json
```

### List Templates

```bash
foundry-rules template --list
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

## Built-in Templates

- `string-equals` - Simple string equality filter
- `string-or` - OR filter with multiple string values
- `numeric-range` - Numeric range filter (min <= value <= max)
- `null-check` - Check if property is null or not null

## Library Usage

```python
from foundry_rules import (
    load_config,
    create_proposal,
    approve_proposal,
    reject_proposal,
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
```

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run linter
ruff check src tests
```
