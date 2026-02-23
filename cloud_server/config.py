from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./cloud_app.db" # Default to local SQLite for easier dev
    
    # Security
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION_TO_A_LONG_RANDOM_STRING"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200
    
    # Alipay Sandbox Configuration
    ALIPAY_APP_ID: str = "9021000161679538"
    ALIPAY_PRIVATE_KEY_PATH: str = "./alipay_private_key.pem"
    ALIPAY_PUBLIC_KEY_PATH: str = "./alipay_public_key.pem"
    ALIPAY_GATEWAY_URL: str = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
    ALIPAY_NOTIFY_URL: str = "http://localhost:8001/api/pay/alipay/notify" # Note: Localhost callbacks require tools like ngrok for real testing, but we can simulate/mock success for local dev.
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
