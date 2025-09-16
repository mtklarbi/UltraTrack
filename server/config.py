import os


class Config:
  API_TITLE = 'SemDiff API'
  API_VERSION = 'v1'
  OPENAPI_VERSION = '3.0.3'
  OPENAPI_URL_PREFIX = '/api'
  OPENAPI_JSON_PATH = 'openapi.json'
  OPENAPI_SWAGGER_UI_PATH = '/docs'
  OPENAPI_SWAGGER_UI_URL = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist/'

  SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///semdiff.db')
  SQLALCHEMY_ENGINE_OPTIONS = { 'pool_pre_ping': True }
  SQLALCHEMY_TRACK_MODIFICATIONS = False

  JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-secret-change-me')
  CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173')


def get_config():
  return Config()

