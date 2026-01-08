"""
Foundry Rules CLI

Command-line interface for managing Foundry Rules proposals.
"""

import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from .config import load_config, LoadResult
from .config.types import ResolvedConfig
from .compression import compress, decompress
from .templates import build_from_template, get_builtin_templates
from .validation import validate_rule_logic, validate_properties, validate_filter_types
from .sdk import (
    ProposalInput,
    ValidationResult,
    validate_proposal,
    create_proposal,
    approve_proposal,
    reject_proposal,
    bulk_reject_proposals,
    edit_proposal,
    EditProposalInput,
)

app = typer.Typer(
    name="foundry-rules",
    help="CLI for managing Foundry Rules proposals",
    add_completion=False,
)
console = Console()


def load_config_or_exit(config_path: Path, validate_token: bool = True) -> ResolvedConfig:
    """Load config or exit with error."""
    result = load_config(str(config_path), validate_token=validate_token)

    if result.warnings:
        for warning in result.warnings:
            console.print(f"[yellow]Warning:[/yellow] {warning}")

    if not result.success or not result.config:
        console.print(f"[red]Error loading config:[/red]")
        for error in result.errors:
            console.print(f"  - {error}")
        raise typer.Exit(1)

    return result.config


def load_json_file(path: Path) -> dict:
    """Load JSON file or exit with error."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        console.print(f"[red]Error:[/red] File not found: {path}")
        raise typer.Exit(1)
    except json.JSONDecodeError as e:
        console.print(f"[red]Error:[/red] Invalid JSON: {e}")
        raise typer.Exit(1)


@app.command()
def validate(
    json_file: Path = typer.Argument(..., help="Path to JSON file with proposal data"),
    config: Path = typer.Option(..., "--config", "-c", help="Path to workflow config file"),
):
    """Validate a proposal without creating it."""
    config_data = load_config_or_exit(config, validate_token=False)
    proposal_data = load_json_file(json_file)

    # Build ProposalInput
    proposal = ProposalInput(
        name=proposal_data.get("name"),
        description=proposal_data.get("description"),
        keywords=proposal_data.get("keywords"),
        template=proposal_data.get("template"),
        params=proposal_data.get("params"),
        logic=proposal_data.get("logic"),
    )

    # Validate
    result = validate_proposal(proposal, config_data)

    if result.valid:
        console.print(Panel("[green]Validation passed![/green]", title="Result"))

        if result.filter_warnings:
            console.print("\n[yellow]Warnings:[/yellow]")
            for warning in result.filter_warnings:
                console.print(f"  - {warning}")
    else:
        console.print(Panel("[red]Validation failed[/red]", title="Result"))

        if result.structure_errors:
            console.print("\n[red]Structure errors:[/red]")
            for error in result.structure_errors:
                console.print(f"  - {error}")

        if result.property_errors:
            console.print("\n[red]Property errors:[/red]")
            for error in result.property_errors:
                console.print(f"  - {error}")

        if result.filter_errors:
            console.print("\n[red]Filter errors:[/red]")
            for error in result.filter_errors:
                console.print(f"  - {error}")

        raise typer.Exit(1)


@app.command()
def create(
    json_file: Path = typer.Argument(..., help="Path to JSON file with proposal data"),
    config: Path = typer.Option(..., "--config", "-c", help="Path to workflow config file"),
    dry_run: bool = typer.Option(False, "--dry-run", "-n", help="Validate only, don't create"),
):
    """Create a new proposal in Foundry Rules."""
    config_data = load_config_or_exit(config)
    proposal_data = load_json_file(json_file)

    # Build ProposalInput
    proposal = ProposalInput(
        name=proposal_data.get("name"),
        description=proposal_data.get("description"),
        keywords=proposal_data.get("keywords"),
        template=proposal_data.get("template"),
        params=proposal_data.get("params"),
        logic=proposal_data.get("logic"),
    )

    if dry_run:
        # Just validate
        result = validate_proposal(proposal, config_data)
        if result.valid:
            console.print("[green]Validation passed - would create proposal[/green]")
        else:
            console.print("[red]Validation failed[/red]")
            raise typer.Exit(1)
        return

    try:
        result = create_proposal(proposal, config_data)
        console.print(Panel(
            f"[green]Proposal created successfully![/green]\n\n"
            f"Proposal ID: [cyan]{result.proposal_id}[/cyan]\n"
            f"Rule ID: [cyan]{result.rule_id}[/cyan]",
            title="Success"
        ))
    except ValueError as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]API Error:[/red] {e}")
        raise typer.Exit(1)


@app.command("approve")
def approve_cmd(
    proposal_id: str = typer.Argument(..., help="Proposal ID to approve"),
    rule_id: str = typer.Argument(..., help="Rule ID associated with the proposal"),
    config: Path = typer.Option(..., "--config", "-c", help="Path to workflow config file"),
    reviewer: Optional[str] = typer.Option(None, "--reviewer", "-r", help="Reviewer name"),
):
    """Approve a proposal."""
    config_data = load_config_or_exit(config)

    try:
        result = approve_proposal(proposal_id, rule_id, config_data, reviewer)
        console.print(f"[green]{result.message}[/green]")
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)


@app.command("reject")
def reject_cmd(
    proposal_id: str = typer.Argument(..., help="Proposal ID to reject"),
    config: Path = typer.Option(..., "--config", "-c", help="Path to workflow config file"),
    reviewer: Optional[str] = typer.Option(None, "--reviewer", "-r", help="Reviewer name"),
):
    """Reject a proposal."""
    config_data = load_config_or_exit(config)

    try:
        result = reject_proposal(proposal_id, config_data, reviewer)
        console.print(f"[green]{result.message}[/green]")
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)


@app.command("bulk-reject")
def bulk_reject_cmd(
    proposal_ids: list[str] = typer.Argument(..., help="Proposal IDs to reject"),
    config: Path = typer.Option(..., "--config", "-c", help="Path to workflow config file"),
    reason: Optional[str] = typer.Option(None, "--reason", help="Rejection reason"),
):
    """Bulk reject multiple proposals."""
    config_data = load_config_or_exit(config)

    try:
        result = bulk_reject_proposals(proposal_ids, config_data, reason)

        if result.success:
            console.print(f"[green]Successfully rejected {result.rejected} proposals[/green]")
        else:
            console.print(f"[yellow]Rejected {result.rejected}/{result.total} proposals[/yellow]")
            console.print(f"[red]Failed: {result.failed}[/red]")

            for r in result.results:
                if not r.success:
                    console.print(f"  - {r.proposal_id}: {r.message}")

            raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)


@app.command("edit")
def edit_cmd(
    proposal_id: str = typer.Argument(..., help="Proposal ID to edit"),
    config: Path = typer.Option(..., "--config", "-c", help="Path to workflow config file"),
    name: Optional[str] = typer.Option(None, "--name", help="New name"),
    description: Optional[str] = typer.Option(None, "--description", help="New description"),
    keywords: Optional[str] = typer.Option(None, "--keywords", help="New keywords"),
    logic_file: Optional[Path] = typer.Option(None, "--logic", help="Path to JSON file with new logic"),
):
    """Edit an existing proposal."""
    config_data = load_config_or_exit(config)

    logic = None
    if logic_file:
        logic = load_json_file(logic_file)

    edit_input = EditProposalInput(
        proposal_id=proposal_id,
        name=name,
        description=description,
        keywords=keywords,
        logic=logic,
    )

    try:
        result = edit_proposal(edit_input, config_data)
        console.print(f"[green]{result.message}[/green]")
    except ValueError as e:
        console.print(f"[red]Validation Error:[/red] {e}")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        raise typer.Exit(1)


@app.command("template")
def template_cmd(
    name: Optional[str] = typer.Argument(None, help="Template name to show details"),
    list_all: bool = typer.Option(False, "--list", "-l", help="List all available templates"),
):
    """List or show details of built-in templates."""
    templates = get_builtin_templates()

    if list_all or name is None:
        table = Table(title="Built-in Templates")
        table.add_column("Name", style="cyan")
        table.add_column("Description")
        table.add_column("Parameters")

        for t in templates:
            table.add_row(
                t["name"],
                t["description"],
                ", ".join(t["parameters"]),
            )

        console.print(table)
    else:
        template = next((t for t in templates if t["name"] == name), None)
        if not template:
            console.print(f"[red]Template not found:[/red] {name}")
            raise typer.Exit(1)

        console.print(Panel(
            f"[cyan]{template['name']}[/cyan]\n\n"
            f"{template['description']}\n\n"
            f"[bold]Parameters:[/bold]\n"
            + "\n".join(f"  - {p}" for p in template["parameters"]),
            title="Template Details"
        ))


@app.command()
def compress_cmd(
    json_file: Path = typer.Argument(..., help="Path to JSON file to compress"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Output file (default: stdout)"),
):
    """Compress rule logic JSON."""
    data = load_json_file(json_file)
    compressed = compress(data)

    if output:
        with open(output, "w") as f:
            f.write(compressed)
        console.print(f"[green]Compressed to:[/green] {output}")
    else:
        print(compressed)


@app.command()
def decompress_cmd(
    input_str: str = typer.Argument(..., help="Compressed string or @file path"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Output file (default: stdout)"),
    pretty: bool = typer.Option(True, "--pretty/--compact", help="Pretty print JSON"),
):
    """Decompress rule logic."""
    # Handle file input
    if input_str.startswith("@"):
        file_path = Path(input_str[1:])
        if not file_path.exists():
            console.print(f"[red]File not found:[/red] {file_path}")
            raise typer.Exit(1)
        with open(file_path) as f:
            input_str = f.read().strip()

    try:
        data = decompress(input_str)
    except Exception as e:
        console.print(f"[red]Decompression error:[/red] {e}")
        raise typer.Exit(1)

    json_str = json.dumps(data, indent=2 if pretty else None)

    if output:
        with open(output, "w") as f:
            f.write(json_str)
        console.print(f"[green]Decompressed to:[/green] {output}")
    else:
        print(json_str)


@app.command()
def init(
    output: Path = typer.Option(
        Path("foundry-rules.json"),
        "--output", "-o",
        help="Output config file path"
    ),
    force: bool = typer.Option(False, "--force", "-f", help="Overwrite existing file"),
):
    """Initialize a new configuration file."""
    if output.exists() and not force:
        console.print(f"[red]File already exists:[/red] {output}")
        console.print("Use --force to overwrite")
        raise typer.Exit(1)

    template = {
        "version": "1.0",
        "workflow": {
            "name": "My Workflow",
            "workflowRid": "ri.rules..workflow.YOUR_WORKFLOW_RID",
            "objectType": {
                "id": "your-object-type-id",
                "properties": [
                    {
                        "id": "property-api-name",
                        "type": "string"
                    }
                ]
            },
            "output": {
                "id": "output-id",
                "version": "1"
            }
        },
        "foundry": {
            "url": "https://YOUR_STACK.palantirfoundry.com",
            "ontologyRid": "ri.ontology.main.ontology.YOUR_ONTOLOGY_RID",
            "tokenEnvVar": "FOUNDRY_TOKEN"
        },
        "sdk": {
            "packageName": "@your-org/sdk",
            "archetypes": {
                "proposal": "Proposal",
                "rule": "Rule"
            },
            "actions": {
                "createProposal": "create-proposal-action",
                "approveProposal": "approve-proposal-action",
                "rejectProposal": "reject-proposal-action",
                "editProposal": "edit-proposal-action"
            }
        },
        "validation": {
            "grammarVersion": "V1",
            "supportedStrategyTypes": ["filterNode"],
            "supportedStringFilters": ["EQUALS", "CONTAINS", "STARTS_WITH", "ENDS_WITH"],
            "unsupportedStringFilters": ["REGEX"],
            "supportedNumericFilters": ["EQUALS", "GREATER_THAN", "LESS_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"],
            "supportedNullFilters": ["NULL", "NOT_NULL"]
        },
        "conventions": {
            "proposalIdPrefix": "PROP-",
            "ruleIdPrefix": "RULE-",
            "defaultAuthor": "cli-user",
            "defaultDescription": "Created via CLI",
            "defaultKeywords": "cli-created"
        }
    }

    with open(output, "w") as f:
        json.dump(template, f, indent=2)

    console.print(f"[green]Created config file:[/green] {output}")
    console.print("\nEdit the file and set your workflow/ontology details.")
    console.print("Set FOUNDRY_TOKEN environment variable for authentication.")


@app.command()
def version():
    """Show CLI version."""
    from . import __version__
    console.print(f"foundry-rules CLI v{__version__}")


def main():
    """Entry point."""
    app()


if __name__ == "__main__":
    main()
