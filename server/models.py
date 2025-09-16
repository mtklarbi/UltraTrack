from __future__ import annotations
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON

db = SQLAlchemy()


def now_ms():
  return func.cast(func.strftime('%s', 'now') * 1000, db.Integer) if db.engine.url.drivername.startswith('sqlite') else (func.extract('epoch', func.now()) * 1000)


class Student(db.Model):
  __tablename__ = 'students'
  id = db.Column(db.Integer, primary_key=True)
  class_name = db.Column(db.String(64), nullable=False, index=True)
  number = db.Column(db.Integer, nullable=False, index=True)
  first_name = db.Column(db.String(128), nullable=False)
  last_name = db.Column(db.String(128), nullable=False)
  gender = db.Column(db.String(8))
  updated_at = db.Column(db.BigInteger, nullable=False, default=0)

  __table_args__ = (
    db.UniqueConstraint('class_name', 'number', name='uq_student_class_number'),
  )


class Scale(db.Model):
  __tablename__ = 'scales'
  id = db.Column(db.String(64), primary_key=True)
  left_label = db.Column(db.String(128), nullable=False)
  right_label = db.Column(db.String(128), nullable=False)
  min = db.Column(db.Integer, nullable=True)
  max = db.Column(db.Integer, nullable=True)
  sort_index = db.Column(db.Integer, nullable=True)
  updated_at = db.Column(db.BigInteger, nullable=False, default=0)


class Rating(db.Model):
  __tablename__ = 'ratings'
  id = db.Column(db.String(64), primary_key=True)
  student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False, index=True)
  scale_id = db.Column(db.String(64), db.ForeignKey('scales.id'), nullable=False, index=True)
  value = db.Column(db.Float, nullable=False)
  recorded_at = db.Column(db.BigInteger, nullable=False)
  updated_at = db.Column(db.BigInteger, nullable=False, default=0)


class Note(db.Model):
  __tablename__ = 'notes'
  id = db.Column(db.String(64), primary_key=True)
  student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False, index=True)
  text = db.Column(db.Text, nullable=False)
  tags = db.Column(JSONB if db.engine and db.engine.url.drivername.startswith('postgres') else JSON, nullable=True)
  recorded_at = db.Column(db.BigInteger, nullable=False)
  updated_at = db.Column(db.BigInteger, nullable=False, default=0)


def stamp_updated_at(obj):
  from time import time
  obj.updated_at = int(time() * 1000)

