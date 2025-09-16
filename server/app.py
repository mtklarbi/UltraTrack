from flask import Flask
from flask_smorest import Api
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from .config import get_config
from .models import db
from .resources import register_resources


def create_app() -> Flask:
  app = Flask(__name__)
  app.config.from_object(get_config())

  # DB
  db.init_app(app)
  with app.app_context():
    db.create_all()

  # CORS
  CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}})

  # JWT
  JWTManager(app)

  # API
  api = Api(app)
  register_resources(api)

  @app.get('/health')
  def health():
    return {'status': 'ok'}

  return app


app = create_app()

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=8000, debug=True)

