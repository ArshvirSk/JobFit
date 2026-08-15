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
