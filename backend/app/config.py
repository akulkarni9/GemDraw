from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = ""

    # --- LLM (provider-agnostic via LiteLLM) --------------------------------
    # Full LiteLLM model id, e.g. "ollama_chat/gemma4:26b", "openai/gpt-4o",
    # "anthropic/claude-3-5-sonnet-latest", "gemini/gemini-2.0-flash".
    # If empty, falls back to "ollama_chat/{ollama_model}" (see resolved_model).
    # The model MUST support tool/function calling.
    llm_model: str = ""
    # Optional endpoint override (e.g. a self-hosted OpenAI-compatible server).
    # If empty and the provider is Ollama, ollama_base_url is used.
    llm_api_base: str = ""
    # API key for hosted providers (OpenAI/Anthropic/Gemini/…). Not needed for Ollama.
    llm_api_key: str = ""
    # Sampling temperature (shared across providers).
    llm_temperature: float = 0.2
    # Max output tokens for non-Ollama providers. 0 falls back to ollama_num_predict.
    llm_max_output_tokens: int = 0

    # --- Ollama-specific (used when the provider is Ollama) ------------------
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:26b"
    ollama_temperature: float = 0.2
    ollama_num_predict: int = 16384
    ollama_num_ctx: int = 131072
    # Comma-separated extra browser origins allowed by CORS, e.g.
    # "https://gemdraw.example.com". localhost/127.0.0.1 are always allowed.
    cors_origins: str = ""

    @field_validator("database_url")
    @classmethod
    def _require_database_url(cls, value: str) -> str:
        if not value:
            raise ValueError("DATABASE_URL must be set in the environment or .env file")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_model(self) -> str:
        """Full LiteLLM model id, defaulting to Ollama for backward compat."""
        return self.llm_model or f"ollama_chat/{self.ollama_model}"

    @property
    def is_ollama_provider(self) -> bool:
        return self.resolved_model.startswith("ollama")

    @property
    def resolved_api_base(self) -> str:
        """Endpoint to send requests to; defaults to Ollama's when applicable."""
        if self.llm_api_base:
            return self.llm_api_base
        return self.ollama_base_url if self.is_ollama_provider else ""

    @property
    def resolved_temperature(self) -> float:
        # Prefer the generic knob; fall back to the legacy Ollama one.
        return self.llm_temperature if self.llm_model else self.ollama_temperature

    @property
    def resolved_max_output_tokens(self) -> int:
        return self.llm_max_output_tokens or self.ollama_num_predict


settings = Settings()
