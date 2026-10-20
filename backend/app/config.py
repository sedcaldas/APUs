import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Sistema de Presupuesto Infraestructura Educativa Caldas"
    API_V1_STR: str = "/api"
    DATABASE_URL: str = "sqlite:///./caldas_presupuesto.db"
    BASE_EXCEL_PATH: str = "BASE DE DATOS 2026_S2_SV.xlsm"

    class Config:
        env_file = ".env"

settings = Settings()
