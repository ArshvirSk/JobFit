import logging
from typing import Type, TypeVar, Any
from pydantic import BaseModel
from google import genai
from google.genai import types
from backend.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

class LLMService:
    def __init__(self):
        # Initialize Google GenAI client with settings
        self.client = genai.Client(api_key=settings.google_api_key)
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature
        self.max_retries = settings.llm_max_retries

    async def generate_structured(self, system_msg: str, prompt: str, response_model: Type[T]) -> T:
        """Generate structured JSON output using Gemini API matching the Pydantic model."""
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_model,
            system_instruction=system_msg,
            temperature=self.temperature,
        )
        
        for attempt in range(self.max_retries + 1):
            try:
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config,
                )
                
                return response.parsed
                
            except Exception as e:
                logger.warning(f"LLM call failed (attempt {attempt + 1}/{self.max_retries + 1}): {e}")
                if attempt == self.max_retries:
                    raise
                    
    async def generate_structured_with_search(self, system_msg: str, prompt: str, response_model: Type[T]) -> T:
        """Generate structured JSON output using Gemini API with Google Search Grounding enabled."""
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
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config,
                )
                
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
                    return response_model.model_validate(parsed_json)
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

    async def generate_text(self, system_msg: str, prompt: str) -> str:
        """Generate raw text output."""
        config = types.GenerateContentConfig(
            system_instruction=system_msg,
            temperature=self.temperature,
        )
        
        for attempt in range(self.max_retries + 1):
            try:
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config,
                )
                
                return response.text
                
            except Exception as e:
                logger.warning(f"LLM call failed (attempt {attempt + 1}/{self.max_retries + 1}): {e}")
                if attempt == self.max_retries:
                    raise

llm_service = LLMService()
