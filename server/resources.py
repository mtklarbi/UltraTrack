from flask import Blueprint
from flask_smorest import Api, Blueprint as SmorestBlueprint, abort
from flask.views import MethodView
from flask import request
from flask_jwt_extended import jwt_required, create_access_token
from marshmallow import ValidationError
from sqlalchemy import select

from .models import db, Student, Scale, Rating, Note, stamp_updated_at
from .schemas import StudentSchema, ScaleSchema, RatingSchema, NoteSchema, SyncPullQuery, SyncPayload, SyncResponse, SyncResult


def register_resources(api: Api):
  # Auth
  auth_blp = SmorestBlueprint('auth', __name__, url_prefix='/api/auth')

  @auth_blp.route('/login')
  class LoginView(MethodView):
    @auth_blp.arguments({'username': {'type': 'string'}, 'password': {'type': 'string'}})
    @auth_blp.response(200)
    def post(self, args):
      username = args.get('username')
      password = args.get('password')
      # Very simple dev auth: accept any non-empty or env-set pair
      from os import getenv
      expected_user = getenv('API_USER')
      expected_pass = getenv('API_PASS')
      if expected_user and expected_pass:
        ok = (username == expected_user and password == expected_pass)
      else:
        ok = bool(username and password)
      if not ok:
        abort(401, message='Invalid credentials')
      token = create_access_token(identity=username)
      return { 'access_token': token }

  api.register_blueprint(auth_blp)

  # Students
  students_blp = SmorestBlueprint('students', __name__, url_prefix='/api/students')

  @students_blp.route('/')
  class StudentsList(MethodView):
    @students_blp.response(200, StudentSchema(many=True))
    def get(self):
      return db.session.scalars(select(Student)).all()

    @jwt_required()
    @students_blp.arguments(StudentSchema)
    @students_blp.response(201, StudentSchema)
    def post(self, data):
      s = Student(**data)
      stamp_updated_at(s)
      db.session.add(s)
      db.session.commit()
      return s

  @students_blp.route('/<int:student_id>')
  class StudentItem(MethodView):
    @students_blp.response(200, StudentSchema)
    def get(self, student_id: int):
      return db.get_or_404(Student, student_id)

    @jwt_required()
    @students_blp.arguments(StudentSchema(partial=True))
    @students_blp.response(200, StudentSchema)
    def put(self, data, student_id: int):
      s = db.get_or_404(Student, student_id)
      for k, v in data.items():
        setattr(s, k, v)
      stamp_updated_at(s)
      db.session.commit()
      return s

  api.register_blueprint(students_blp)

  # Scales
  scales_blp = SmorestBlueprint('scales', __name__, url_prefix='/api/scales')

  @scales_blp.route('/')
  class ScalesList(MethodView):
    @scales_blp.response(200, ScaleSchema(many=True))
    def get(self):
      return db.session.scalars(select(Scale)).all()

    @jwt_required()
    @scales_blp.arguments(ScaleSchema)
    @scales_blp.response(201, ScaleSchema)
    def post(self, data):
      s = db.session.get(Scale, data['id'])
      if s:
        for k, v in data.items(): setattr(s, k, v)
      else:
        s = Scale(**data)
        db.session.add(s)
      stamp_updated_at(s)
      db.session.commit()
      return s

  @scales_blp.route('/<string:scale_id>')
  class ScaleItem(MethodView):
    @scales_blp.response(200, ScaleSchema)
    def get(self, scale_id: str):
      return db.get_or_404(Scale, scale_id)

    @jwt_required()
    @scales_blp.arguments(ScaleSchema(partial=True))
    @scales_blp.response(200, ScaleSchema)
    def put(self, data, scale_id: str):
      s = db.get_or_404(Scale, scale_id)
      for k, v in data.items(): setattr(s, k, v)
      stamp_updated_at(s)
      db.session.commit()
      return s

  api.register_blueprint(scales_blp)

  # Ratings
  ratings_blp = SmorestBlueprint('ratings', __name__, url_prefix='/api/ratings')

  @ratings_blp.route('/')
  class RatingsList(MethodView):
    @ratings_blp.response(200, RatingSchema(many=True))
    def get(self):
      return db.session.scalars(select(Rating)).all()

    @jwt_required()
    @ratings_blp.arguments(RatingSchema)
    @ratings_blp.response(201, RatingSchema)
    def post(self, data):
      r = db.session.get(Rating, data['id'])
      if r:
        for k, v in data.items(): setattr(r, k, v)
      else:
        r = Rating(**data)
        db.session.add(r)
      stamp_updated_at(r)
      db.session.commit()
      return r

  @ratings_blp.route('/<string:rating_id>')
  class RatingItem(MethodView):
    @ratings_blp.response(200, RatingSchema)
    def get(self, rating_id: str):
      return db.get_or_404(Rating, rating_id)

    @jwt_required()
    @ratings_blp.arguments(RatingSchema(partial=True))
    @ratings_blp.response(200, RatingSchema)
    def put(self, data, rating_id: str):
      r = db.get_or_404(Rating, rating_id)
      for k, v in data.items(): setattr(r, k, v)
      stamp_updated_at(r)
      db.session.commit()
      return r

  api.register_blueprint(ratings_blp)

  # Notes
  notes_blp = SmorestBlueprint('notes', __name__, url_prefix='/api/notes')

  @notes_blp.route('/')
  class NotesList(MethodView):
    @notes_blp.response(200, NoteSchema(many=True))
    def get(self):
      return db.session.scalars(select(Note)).all()

    @jwt_required()
    @notes_blp.arguments(NoteSchema)
    @notes_blp.response(201, NoteSchema)
    def post(self, data):
      n = db.session.get(Note, data['id'])
      if n:
        for k, v in data.items(): setattr(n, k, v)
      else:
        n = Note(**data)
        db.session.add(n)
      stamp_updated_at(n)
      db.session.commit()
      return n

  @notes_blp.route('/<string:note_id>')
  class NoteItem(MethodView):
    @notes_blp.response(200, NoteSchema)
    def get(self, note_id: str):
      return db.get_or_404(Note, note_id)

    @jwt_required()
    @notes_blp.arguments(NoteSchema(partial=True))
    @notes_blp.response(200, NoteSchema)
    def put(self, data, note_id: str):
      n = db.get_or_404(Note, note_id)
      for k, v in data.items(): setattr(n, k, v)
      stamp_updated_at(n)
      db.session.commit()
      return n

  api.register_blueprint(notes_blp)

  # Sync endpoints
  sync_blp = SmorestBlueprint('sync', __name__, url_prefix='/api')

  @sync_blp.route('/sync')
  class SyncView(MethodView):
    @sync_blp.arguments(SyncPullQuery, location='query')
    @sync_blp.response(200, SyncResponse)
    def get(self, args):
      since = args['since']
      students = db.session.scalars(select(Student).where(Student.updated_at > since)).all()
      scales = db.session.scalars(select(Scale).where(Scale.updated_at > since)).all()
      ratings = db.session.scalars(select(Rating).where(Rating.updated_at > since)).all()
      notes = db.session.scalars(select(Note).where(Note.updated_at > since)).all()
      return { 'students': students, 'scales': scales, 'ratings': ratings, 'notes': notes }

    @jwt_required()
    @sync_blp.arguments(SyncPayload)
    @sync_blp.response(200, SyncResult)
    def post(self, payload):
      ins = 0; upd = 0
      def upsert(model, rows):
        nonlocal ins, upd
        for data in rows:
          pk = data.get('id')
          obj = db.session.get(model, pk)
          if obj:
            for k, v in data.items(): setattr(obj, k, v)
            upd += 1
            stamp_updated_at(obj)
          else:
            obj = model(**data)
            stamp_updated_at(obj)
            db.session.add(obj)
            ins += 1

      upsert(Student, payload.get('students', []))
      upsert(Scale, payload.get('scales', []))
      upsert(Rating, payload.get('ratings', []))
      upsert(Note, payload.get('notes', []))
      db.session.commit()
      return { 'inserted': ins, 'updated': upd }

  api.register_blueprint(sync_blp)

