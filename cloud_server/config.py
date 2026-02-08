from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./cloud_app.db" # Default to local SQLite for easier dev
    
    # Security
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION_TO_A_LONG_RANDOM_STRING"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200
    
    # WeChat Pay
    WECHAT_MCHID: str = ""
    WECHAT_PRIVATE_KEY_PATH: str = "./apiclient_key.pem"
    WECHAT_CERT_SERIAL_NO: str = ""
    WECHAT_APIV3_KEY: str = ""
    WECHAT_APPID: str = ""
    WECHAT_NOTIFY_URL: str = "https://your-domain.com/api/pay/notify"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
