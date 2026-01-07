"""
Configuration type definitions using Pydantic.

These models match the TypeScript interfaces in the original CLI.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class PropertyDefinition(BaseModel):
    """Definition of an object type property."""

    id: str
    type: Literal["string", "number", "boolean", "date", "timestamp"]
    description: Optional[str] = None
    nullable: Optional[bool] = None


class ObjectTypeConfig(BaseModel):
    """Object type configuration."""

    id: str
    dynamic_lookup: bool = Field(default=False, alias="dynamicLookup")
    properties: list[PropertyDefinition] = []

    class Config:
        populate_by_name = True


class OutputParameterConfig(BaseModel):
    """Output parameter configuration."""

    id: str
    type: str
    default_value: Optional[str] = Field(default=None, alias="defaultValue")

    class Config:
        populate_by_name = True


class OutputConfig(BaseModel):
    """Output configuration."""

    id: str
    version: str
    parameters: list[OutputParameterConfig] = []


class WorkflowDefinition(BaseModel):
    """Workflow definition."""

    name: str
    workflow_rid: str = Field(alias="workflowRid")
    object_type: ObjectTypeConfig = Field(alias="objectType")
    output: OutputConfig

    class Config:
        populate_by_name = True


class FoundryConnection(BaseModel):
    """Foundry connection configuration."""

    url: str
    ontology_rid: str = Field(alias="ontologyRid")
    token_env_var: str = Field(alias="tokenEnvVar")

    class Config:
        populate_by_name = True


class ArchetypeConfig(BaseModel):
    """SDK archetype configuration."""

    proposal: str
    rule: str


class ActionConfig(BaseModel):
    """SDK action configuration."""

    create_proposal: str = Field(alias="createProposal")
    approve_proposal: str = Field(alias="approveProposal")
    reject_proposal: str = Field(alias="rejectProposal")
    edit_proposal: str = Field(alias="editProposal")

    class Config:
        populate_by_name = True


class SdkConfig(BaseModel):
    """SDK configuration."""

    package_name: str = Field(alias="packageName")
    archetypes: ArchetypeConfig
    actions: ActionConfig

    class Config:
        populate_by_name = True


class ValidationConfig(BaseModel):
    """Validation configuration."""

    grammar_version: str = Field(alias="grammarVersion")
    supported_strategy_types: list[str] = Field(alias="supportedStrategyTypes")
    supported_string_filters: list[str] = Field(alias="supportedStringFilters")
    unsupported_string_filters: list[str] = Field(default=[], alias="unsupportedStringFilters")
    supported_numeric_filters: list[str] = Field(default=[], alias="supportedNumericFilters")
    supported_null_filters: list[str] = Field(default=[], alias="supportedNullFilters")

    class Config:
        populate_by_name = True


class ConventionConfig(BaseModel):
    """Convention configuration."""

    proposal_id_prefix: str = Field(alias="proposalIdPrefix")
    rule_id_prefix: str = Field(alias="ruleIdPrefix")
    default_author: str = Field(alias="defaultAuthor")
    default_description: Optional[str] = Field(default=None, alias="defaultDescription")
    default_keywords: Optional[str] = Field(default=None, alias="defaultKeywords")

    class Config:
        populate_by_name = True


class TemplateConfig(BaseModel):
    """Template configuration."""

    name: str
    description: Optional[str] = None
    file: Optional[str] = None


class WorkflowConfig(BaseModel):
    """Root workflow configuration (from JSON file)."""

    version: str
    workflow: WorkflowDefinition
    foundry: FoundryConnection
    sdk: SdkConfig
    validation: ValidationConfig
    conventions: ConventionConfig
    templates: list[TemplateConfig] = []

    class Config:
        populate_by_name = True


class ResolvedFoundryConnection(BaseModel):
    """Resolved Foundry connection with actual token."""

    url: str
    ontology_rid: str
    token: str


class ResolvedConfig(BaseModel):
    """Fully resolved configuration with environment variables substituted."""

    version: str
    workflow: WorkflowDefinition
    foundry: ResolvedFoundryConnection
    sdk: SdkConfig
    validation: ValidationConfig
    conventions: ConventionConfig
    templates: list[TemplateConfig] = []


class LoadResult(BaseModel):
    """Result of loading a configuration file."""

    success: bool
    config: Optional[ResolvedConfig] = None
    errors: list[str] = []
    warnings: list[str] = []
