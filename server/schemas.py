from marshmallow import Schema, fields, validate


class StudentSchema(Schema):
  id = fields.Int(dump_only=True)
  class_name = fields.Str(required=True)
  number = fields.Int(required=True)
  first_name = fields.Str(required=True)
  last_name = fields.Str(required=True)
  gender = fields.Str(load_default=None)
  updated_at = fields.Int()


class ScaleSchema(Schema):
  id = fields.Str(required=True)
  left_label = fields.Str(required=True)
  right_label = fields.Str(required=True)
  min = fields.Int(load_default=None)
  max = fields.Int(load_default=None)
  sort_index = fields.Int(load_default=None)
  updated_at = fields.Int()


class RatingSchema(Schema):
  id = fields.Str(required=True)
  student_id = fields.Int(required=True)
  scale_id = fields.Str(required=True)
  value = fields.Float(required=True)
  recorded_at = fields.Int(required=True)
  updated_at = fields.Int()


class NoteSchema(Schema):
  id = fields.Str(required=True)
  student_id = fields.Int(required=True)
  text = fields.Str(required=True)
  tags = fields.List(fields.Str(), load_default=None)
  recorded_at = fields.Int(required=True)
  updated_at = fields.Int()


class SyncPullQuery(Schema):
  since = fields.Int(required=True, description='Timestamp (ms)')


class SyncPayload(Schema):
  students = fields.List(fields.Nested(StudentSchema), load_default=list)
  scales = fields.List(fields.Nested(ScaleSchema), load_default=list)
  ratings = fields.List(fields.Nested(RatingSchema), load_default=list)
  notes = fields.List(fields.Nested(NoteSchema), load_default=list)


class SyncResult(Schema):
  inserted = fields.Int()
  updated = fields.Int()


class SyncResponse(Schema):
  students = fields.List(fields.Nested(StudentSchema))
  scales = fields.List(fields.Nested(ScaleSchema))
  ratings = fields.List(fields.Nested(RatingSchema))
  notes = fields.List(fields.Nested(NoteSchema))

