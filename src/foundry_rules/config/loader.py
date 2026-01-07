"""
Configuration loader.

Loads, validates, and resolves workflow configuration files.
"""

import json
import os
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from .types import (
    WorkflowConfig,
    ResolvedConfig,
    ResolvedFoundryConnection,
    LoadResult,
)
from .resolver import resolve_env_vars, get_env_var


def load_config(
    config_path: str | Path,
    validate_token: bool = True,
    resolve_paths: bool = True,
) -> LoadResult:
    """
    Load and validate a workflow configuration file.

    Args:
        config_path: Path to the configuration JSON file
        validate_token: Whether to check if token env var is set
        resolve_paths: Whether to resolve relative template paths

    Returns:
        LoadResult with config or errors
    """
    errors: list[str] = []
    warnings: list[str] = []
    config_path = Path(config_path)

    # Check file exists
    if not config_path.exists():
        return LoadResult(
            success=False,
            errors=[f"Config file not found: {config_path}"],
        )

    # Read and parse JSON
    try:
        content = config_path.read_text()
        raw_config = json.loads(content)
    except json.JSONDecodeError as e:
        return LoadResult(
            success=False,
            errors=[f"Failed to parse config file: {e}"],
        )
    except Exception as e:
        return LoadResult(
            success=False,
            errors=[f"Failed to read config file: {e}"],
        )

    # Validate with Pydantic
    try:
        config = WorkflowConfig.model_validate(raw_config)
    except ValidationError as e:
        error_messages = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err["loc"])
            error_messages.append(f"Missing or invalid field: {loc}")
        return LoadResult(success=False, errors=error_messages)

    # Resolve environment variables in foundry connection
    url_resolved, url_missing = resolve_env_vars(config.foundry.url)
    ontology_resolved, ontology_missing = resolve_env_vars(config.foundry.ontology_rid)

    if url_missing:
        errors.append(f"Missing environment variable for foundry.url: {', '.join(url_missing)}")
    if ontology_missing:
        errors.append(
            f"Missing environment variable for foundry.ontologyRid: {', '.join(ontology_missing)}"
        )

    # Check token env var
    token = get_env_var(config.foundry.token_env_var, "")
    if validate_token and not token:
        warnings.append(f"Token environment variable not set: {config.foundry.token_env_var}")

    if errors:
        return LoadResult(success=False, errors=errors, warnings=warnings)

    # Resolve template paths
    resolved_templates = config.templates
    if resolve_paths and config.templates:
        config_dir = config_path.parent
        resolved_templates = []
        for t in config.templates:
            if t.file and not Path(t.file).is_absolute():
                resolved_path = str((config_dir / t.file).resolve())
                resolved_templates.append(t.model_copy(update={"file": resolved_path}))
            else:
                resolved_templates.append(t)

    # Build resolved config
    resolved_foundry = ResolvedFoundryConnection(
        url=url_resolved,
        ontology_rid=ontology_resolved,
        token=token,
    )

    resolved_config = ResolvedConfig(
        version=config.version,
        workflow=config.workflow,
        foundry=resolved_foundry,
        sdk=config.sdk,
        validation=config.validation,
        conventions=config.conventions,
        templates=resolved_templates,
    )

    return LoadResult(
        success=True,
        config=resolved_config,
        warnings=warnings if warnings else [],
    )


def validate_config_syntax(config_path: str | Path) -> LoadResult:
    """
    Validate a config file without checking token.

    Useful for syntax checking before deployment.
    """
    return load_config(config_path, validate_token=False)


def get_default_config_path(base_dir: Optional[Path] = None) -> Optional[Path]:
    """
    Get the default config path.

    Checks FOUNDRY_RULES_CONFIG env var first, then looks for config/default.json.
    """
    # Check environment variable
    env_path = os.environ.get("FOUNDRY_RULES_CONFIG")
    if env_path:
        return Path(env_path)

    # Search paths
    search_paths = []
    if base_dir:
        search_paths.append(base_dir / "config" / "default.json")
    search_paths.append(Path.cwd() / "config" / "default.json")

    for path in search_paths:
        if path.exists():
            return path

    return None


def list_configs(config_dir: Optional[Path] = None) -> list[Path]:
    """List available config files in the config directory."""
    dir_path = config_dir or Path.cwd() / "config"

    if not dir_path.exists():
        return []

    return [
        f
        for f in dir_path.iterdir()
        if f.suffix == ".json" and not f.name.endswith("-schema.json")
    ]
