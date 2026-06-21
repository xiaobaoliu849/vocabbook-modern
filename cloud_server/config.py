from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRET_KEY = "CHANGE_THIS_IN_PRODUCTION_TO_A_LONG_RANDOM_STRING"
PLACEHOLDER_ALIPAY_APP_ID = "9021000161679538"

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DEBUG_PAYMENT_MOCKS: bool = False
    ENABLE_LIVE_TEST_PLAN: bool = False
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./cloud_app.db" # Default to local SQLite for easier dev

    # Security
    SECRET_KEY: str = PLACEHOLDER_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200
    ADMIN_TOKEN: str = ""

    # Alipay Configuration
    ALIPAY_APP_ID: str = "9021000161679538"
    ALIPAY_PRIVATE_KEY_PATH: str = "./alipay_private_key.pem"
    ALIPAY_PUBLIC_KEY_PATH: str = "./alipay_public_key.pem"
    ALIPAY_GATEWAY_URL: str = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
    ALIPAY_NOTIFY_URL: str = "http://localhost:8001/api/pay/alipay/notify" # Note: Localhost callbacks require tools like ngrok for real testing, but we can simulate/mock success for local dev.

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"prod", "production"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    def validate_runtime(self) -> None:
        if not self.is_production:
            return

        errors = []
        if self.SECRET_KEY == PLACEHOLDER_SECRET_KEY or len(self.SECRET_KEY.strip()) < 32:
            errors.append("SECRET_KEY must be set to a strong production secret.")
        if not self.ADMIN_TOKEN.strip() or len(self.ADMIN_TOKEN.strip()) < 32:
            errors.append("ADMIN_TOKEN must be set to a strong production token.")
        if not self.ALIPAY_APP_ID.strip() or self.ALIPAY_APP_ID == PLACEHOLDER_ALIPAY_APP_ID:
            errors.append("ALIPAY_APP_ID must be set to the production Alipay app id.")
        for key_name, key_path in (
            ("ALIPAY_PRIVATE_KEY_PATH", self.ALIPAY_PRIVATE_KEY_PATH),
            ("ALIPAY_PUBLIC_KEY_PATH", self.ALIPAY_PUBLIC_KEY_PATH),
        ):
            resolved_key_path = Path(key_path).expanduser()
            if not resolved_key_path.is_file():
                errors.append(f"{key_name} must point to an existing key file.")
        if "sandbox" in self.ALIPAY_GATEWAY_URL.lower():
            errors.append("ALIPAY_GATEWAY_URL must point to the production Alipay gateway.")
        if "localhost" in self.ALIPAY_NOTIFY_URL.lower() or "127.0.0.1" in self.ALIPAY_NOTIFY_URL:
            errors.append("ALIPAY_NOTIFY_URL must be a public HTTPS callback URL.")
        if not self.ALIPAY_NOTIFY_URL.lower().startswith("https://"):
            errors.append("ALIPAY_NOTIFY_URL must use HTTPS in production.")
        if self.DEBUG_PAYMENT_MOCKS:
            errors.append("DEBUG_PAYMENT_MOCKS must be disabled in production.")
        if "*" in self.cors_origin_list:
            errors.append("CORS_ORIGINS must not contain '*' in production.")

        if errors:
            raise RuntimeError("Invalid production configuration: " + " ".join(errors))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
