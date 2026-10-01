import logging
from typing import Any, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from backend.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

class SourceRef(BaseModel):
    """A URL Google Search grounded a response in."""

    url: str
    title: str = ""

class LLMService:
    def __init__(self):
        # Initialize Google GenAI client with settings
        self.client = genai.Client(api_key=settings.google_api_key)
        self.model = settings.llm_model
        # Fallback model used when the primary model errors or returns an
        # unusable response. Kept in the same SDK so retries are cheap and
        # the response contract (parsed Pydantic object) stays identical.
        self.fallback_model = settings.llm_fallback_model
        self.temperature = settings.llm_temperature
        self.max_retries = settings.llm_max_retries

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_config(
        system_msg: str,
        temperature: float,
        response_model: type[BaseModel] | None = None,
    ) -> types.GenerateContentConfig:
        """Build a GenerateContentConfig; adds schema-constrained JSON mode when a
        response model is supplied."""
        config_kwargs: dict[str, Any] = {
            "system_instruction": system_msg,
            "temperature": temperature,
        }
        if response_model is not None:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = response_model
        return types.GenerateContentConfig(**config_kwargs)

    async def _invoke(self, model_name: str, prompt: str, config: types.GenerateContentConfig):
        """Single attempt against a named model. Raises on failure — callers own retries."""
        return await self.client.aio.models.generate_content(
            model=model_name,
            contents=prompt,
            config=config,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_structured(self, system_msg: str, prompt: str, response_model: type[T]) -> T:
        """Generate structured JSON output using Gemini API matching the Pydantic model.

        Failure policy per attempt:
          1. try the primary model;
          2. on any exception, try the fallback model once;
          3. only if both fail, count the attempt and retry the pair,
             up to ``max_retries`` total attempts.
        This keeps a transient provider error (quota blip, 500, malformed
        parse) from failing the whole pipeline when a second model can serve.
        """
        config = self._make_config(system_msg, self.temperature, response_model)
        fallback_config = self._make_config(system_msg, self.temperature, response_model)

        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                response = await self._invoke(self.model, prompt, config)
                return response.parsed
            except Exception as primary_error:
                last_error = primary_error
                logger.warning(
                    "LLM call failed on primary model '%s' (attempt %d/%d): %s",
                    self.model, attempt + 1, self.max_retries + 1, primary_error,
                )

            if self.fallback_model and self.fallback_model != self.model:
                try:
                    response = await self._invoke(self.fallback_model, prompt, fallback_config)
                    logger.info("Fallback model '%s' served the request.", self.fallback_model)
                    return response.parsed
                except Exception as fallback_error:
                    last_error = fallback_error
                    logger.warning(
                        "Fallback model '%s' also failed (attempt %d/%d): %s",
                        self.fallback_model, attempt + 1, self.max_retries + 1, fallback_error,
                    )

        raise RuntimeError(
            f"LLM generation failed after {self.max_retries + 1} attempt(s) "
            f"on both '{self.model}' and '{self.fallback_model}'"
        ) from last_error

    async def generate_structured_with_search(self, system_msg: str, prompt: str, response_model: type[T]) -> T:
        """Generate structured JSON output using Gemini API with Google Search Grounding enabled."""
        parsed, _ = await self.generate_structured_with_search_and_sources(system_msg, prompt, response_model)
        return parsed

    async def generate_structured_with_search_and_sources(
        self, system_msg: str, prompt: str, response_model: type[T]
    ) -> tuple[T, list[SourceRef]]:
        """Same as generate_structured_with_search, but also returns the URLs the
        answer was grounded in.

        Google Search grounding is the only web access we have through the API —
        the response's grounding metadata carries the pages the model actually
        read. The research engine uses those as page-fetch candidates and as the
        allowed citation set for per-field evidence.
        """
        import json

        from pydantic import ValidationError

        # We cannot use response_mime_type or response_schema with tools in the Developer API.
        # So we instruct the model to output raw JSON.
        schema_json = response_model.model_json_schema()
        enhanced_system_msg = (
            f"{system_msg}\n\n"
            f"IMPORTANT: You MUST return ONLY valid JSON matching this schema. "
            f"Do not include markdown formatting (like ```json), just the raw JSON string.\n"
            f"If you cannot find a verified, current answer via search for a field, "
            f"set that field to null — do NOT guess or fabricate a plausible-sounding "
            f"value. A null field is far more useful to us than a wrong one.\n"
            f"Schema: {json.dumps(schema_json)}"
        )

        config = types.GenerateContentConfig(
            system_instruction=enhanced_system_msg,
            temperature=self.temperature,
            tools=[{"google_search": {}}],
        )

        for attempt in range(self.max_retries + 1):
            try:
                response = await self._invoke(self.model, prompt, config)

                # Confirm search was actually used, not just permitted.
                grounding = getattr(
                    getattr(response, "candidates", [None])[0], "grounding_metadata", None
                ) if getattr(response, "candidates", None) else None
                if not grounding:
                    logger.warning(
                        f"No grounding metadata returned for prompt (model may not have "
                        f"actually searched): {prompt[:80]}..."
                    )

                text = response.text.strip()
                # Clean up potential markdown formatting
                if text.startswith("```json"):
                    text = text[7:]
                elif text.startswith("```"):
                    text = text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

                try:
                    parsed_json = json.loads(text)
                    parsed = response_model.model_validate(parsed_json)
                    return parsed, self._extract_sources(response)
                except (json.JSONDecodeError, ValidationError) as e:
                    logger.warning(
                        f"Failed to parse LLM JSON output (attempt {attempt + 1}/"
                        f"{self.max_retries + 1}): {e}\nOutput was: {text}"
                    )
                    if attempt == self.max_retries:
                        raise e

            except Exception as e:
                logger.warning(f"LLM search call failed (attempt {attempt + 1}/{self.max_retries + 1}): {e}")
                if attempt == self.max_retries:
                    raise

    @staticmethod
    def _extract_sources(response) -> list[SourceRef]:
        """Pull grounding chunk URLs out of a Gemini response.

        Tolerates both attribute- and dict-shaped SDK objects so a minor SDK
        change degrades to "no sources" instead of crashing a research round.
        """
        def _get(obj, key, default=None):
            if obj is None:
                return default
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        sources: list[SourceRef] = []
        if not _get(response, "candidates"):
            return sources
        metadata = _get(_get(response, "candidates")[0], "grounding_metadata")
        seen: set[str] = set()
        for chunk in (_get(metadata, "grounding_chunks") or []):
            web = _get(chunk, "web")
            uri = _get(web, "uri")
            if uri and uri not in seen:
                seen.add(uri)
                sources.append(SourceRef(url=uri, title=_get(web, "title") or ""))
        return sources

    async def generate_text(self, system_msg: str, prompt: str) -> str:
        """Generate raw text output."""
        config = types.GenerateContentConfig(
            system_instruction=system_msg,
            temperature=self.temperature,
        )

        for attempt in range(self.max_retries + 1):
            try:
                response = await self._invoke(self.model, prompt, config)

                return response.text

            except Exception as e:
                logger.warning(f"LLM call failed (attempt {attempt + 1}/{self.max_retries + 1}): {e}")
                if attempt == self.max_retries:
                    raise

llm_service = LLMService()
