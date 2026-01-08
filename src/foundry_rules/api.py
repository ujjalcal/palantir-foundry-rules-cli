"""
Foundry API Client

REST client for Foundry API (until Python OSDK works).
"""

from typing import Any, Optional
import httpx

from .config.types import ResolvedConfig


class FoundryClient:
    """HTTP client for Foundry REST API."""

    def __init__(self, config: ResolvedConfig):
        """
        Initialize the Foundry client.

        Args:
            config: Resolved configuration with URL and token
        """
        self.base_url = config.foundry.url.rstrip("/")
        self.ontology_rid = config.foundry.ontology_rid
        # Remove ALL whitespace from token (including internal newlines)
        self.token = "".join(config.foundry.token.split()) if config.foundry.token else ""

        if not self.token:
            raise ValueError("FOUNDRY_TOKEN not set in config")

        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def apply_action_sync(
        self,
        action_api_name: str,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Apply a Foundry action (synchronous version).

        Args:
            action_api_name: The action API name
            parameters: Action parameters

        Returns:
            Response data
        """
        url = (
            f"{self.base_url}/api/v2/ontologies/{self.ontology_rid}"
            f"/actions/{action_api_name}/apply"
        )

        with httpx.Client() as client:
            response = client.post(
                url,
                headers=self.headers,
                json={"parameters": parameters},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json() if response.text else {}

    def search_objects_sync(
        self,
        object_type: str,
        where: Optional[dict[str, Any]] = None,
        select: Optional[list[str]] = None,
        page_size: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Search for objects (synchronous version).

        Args:
            object_type: Object type API name
            where: Filter conditions
            select: Properties to return
            page_size: Number of results per page

        Returns:
            List of matching objects
        """
        url = (
            f"{self.base_url}/api/v2/ontologies/{self.ontology_rid}"
            f"/objectTypes/{object_type}/search"
        )

        body: dict[str, Any] = {"pageSize": page_size}
        if where:
            body["where"] = where
        if select:
            body["select"] = select

        results: list[dict[str, Any]] = []
        page_token: Optional[str] = None

        with httpx.Client() as client:
            while True:
                if page_token:
                    body["pageToken"] = page_token

                response = client.post(
                    url,
                    headers=self.headers,
                    json=body,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                results.extend(data.get("data", []))

                page_token = data.get("nextPageToken")
                if not page_token:
                    break

        return results
