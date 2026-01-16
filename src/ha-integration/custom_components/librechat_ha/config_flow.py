"""Config flow for LibreChat HA Bridge integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DOMAIN,
    CONF_API_URL,
    CONF_USER_ID,
    DEFAULT_API_URL,
    DEFAULT_USER_ID,
    API_HEALTH_ENDPOINT,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_API_URL, default=DEFAULT_API_URL): str,
        vol.Optional(CONF_USER_ID, default=DEFAULT_USER_ID): str,
    }
)


async def validate_input(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Validate the user input allows us to connect."""
    session = async_get_clientsession(hass)
    api_url = data[CONF_API_URL].rstrip("/")

    try:
        async with session.get(
            f"{api_url}{API_HEALTH_ENDPOINT}",
            timeout=aiohttp.ClientTimeout(total=10),
        ) as response:
            if response.status != 200:
                raise CannotConnect(f"API returned status {response.status}")
            result = await response.json()
            if result.get("status") != "ok":
                raise CannotConnect("API health check failed")
    except aiohttp.ClientError as err:
        _LOGGER.error("Error connecting to HA Bridge: %s", err)
        raise CannotConnect from err

    return {"title": "LibreChat HA Bridge"}


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for LibreChat HA Bridge."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except Exception:  # pylint: disable=broad-except
                _LOGGER.exception("Unexpected exception")
                errors["base"] = "unknown"
            else:
                return self.async_create_entry(title=info["title"], data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )


class CannotConnect(HomeAssistantError):
    """Error to indicate we cannot connect."""
