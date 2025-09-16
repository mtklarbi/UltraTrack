import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/app';
import { exportRatingsCSV, exportStudentsCSV, importRatingsCSV, importStudentsCSV } from '../csv';
import { getApiBase, setApiBase, login, getToken, setToken } from '../api';
import { syncNow } from '../syncClient';
import { useTranslation } from 'react-i18next';
import { tScaleLabels } from '../utils/scaleLabels';
import React from 'react';

type FormState = { id: string; left_label: string; right_label: string; min: number; max: number };

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'scale';
}

export default function Settings() {
  const { t } = useTranslation();
  const scales = useAppStore((s) => s.scales);
  const loadScales = useAppStore((s) => s.loadScales);
  const students = useAppStore((s) => s.students);
  const loadStudents = useAppStore((s) => s.loadStudents);
  const upsertScale = useAppStore((s) => s.upsertScale);
  const deleteScale = useAppStore((s) => s.deleteScale);
  const reorderScales = useAppStore((s) => s.reorderScales);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>({ id: '', left_label: '', right_label: '', min: -3, max: 3 });
  const [error, setError] = useState<string | null>(null);

  // Backend sync settings
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(getApiBase());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setTokenState] = useState<string | null>(getToken());

  const doLogin = async () => {
    try {
      const tok = await login(username, password);
      setTokenState(tok);
      alert('Logged in');
    } catch (e) {
      alert('Login failed');
    }
  };

  useEffect(() => { if (!scales.length) void loadScales(); }, [scales.length, loadScales]);
  useEffect(() => { setOrderIds(scales.map((s) => s.id)); }, [scales]);
  useEffect(() => { if (!students.length) void loadStudents(); }, [students.length, loadStudents]);

  const onSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.min >= form.max) { setError('Min must be less than Max'); return; }
    const id = form.id || slugify(form.left_label || form.right_label);
    await upsertScale({ id, left_label: form.left_label, right_label: form.right_label, min: form.min, max: form.max });
    setForm({ id: '', left_label: '', right_label: '', min: -3, max: 3 });
  };

  const editState = useMemo(() => scales.find((s) => s.id === editingId), [editingId, scales]);

  const onSaveEdit = async () => {
    if (!editState) return;
    const min = Number((document.getElementById('edit-min') as HTMLInputElement).value);
    const max = Number((document.getElementById('edit-max') as HTMLInputElement).value);
    const left = (document.getElementById('edit-left') as HTMLInputElement).value;
    const right = (document.getElementById('edit-right') as HTMLInputElement).value;
    if (min >= max) { setError('Min must be less than Max'); return; }
    await upsertScale({ id: editState.id, left_label: left, right_label: right, min, max });
    setEditingId(null);
  };

  // Drag & drop ordering
  const [dragId, setDragId] = useState<string | null>(null);
  const onDragStart = (id: string) => (e: React.DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (overId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const ids = [...orderIds];
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setOrderIds(ids);
  };
  const onDrop = async () => {
    if (dragId) {
      await reorderScales(orderIds);
      setDragId(null);
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('nav.settings')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Students</h2>
          <StudentAdmin />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-2">{t('settings.scales')}</h2>
          <ul className="space-y-2">
            {orderIds.map((id) => {
              const s = scales.find((x) => x.id === id)!;
              const isEditing = editingId === id;
              return (
                <li key={id}
                    draggable
                    onDragStart={onDragStart(id)}
                    onDragOver={onDragOver(id)}
                    onDrop={onDrop}
                    className={`rounded-md border bg-white shadow-sm ${dragId===id? 'opacity-70':''}`}>
                  <div className="p-3 flex items-center justify-between gap-2">
                    {!isEditing ? (
                      <>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{tScaleLabels(s, t).left} ↔ {tScaleLabels(s, t).right}</div>
                          <div className="text-xs text-gray-600">{t('settings.range')}: {s.min ?? -3} {t('settings.to') ?? 'to'} {s.max ?? 3}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50" onClick={() => setEditingId(id)}>{t('common.edit')}</button>
                          <button className="rounded-md border px-2 py-1 text-sm hover:bg-red-50 text-red-700" onClick={() => deleteScale(id)}>{t('common.delete')}</button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <input id="edit-left" defaultValue={s.left_label} className="col-span-2 rounded border px-2 py-1 text-sm" />
                        <input id="edit-right" defaultValue={s.right_label} className="col-span-2 rounded border px-2 py-1 text-sm" />
                        <div className="col-span-1 flex items-center gap-2">
                          <input id="edit-min" type="number" defaultValue={s.min ?? -3} className="w-20 rounded border px-2 py-1 text-sm" />
                          <input id="edit-max" type="number" defaultValue={s.max ?? 3} className="w-20 rounded border px-2 py-1 text-sm" />
                        </div>
                        <div className="col-span-5 flex items-center justify-end gap-2">
                          <button className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50" onClick={() => setEditingId(null)}>Cancel</button>
                          <button className="rounded-md bg-brand text-white px-2 py-1 text-sm hover:bg-brand-dark" onClick={onSaveEdit}>Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">{t('settings.add_scale')}</h2>
          <form onSubmit={onSubmitNew} className="space-y-3 rounded-md border bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={form.left_label} onChange={(e)=>setForm(f=>({...f,left_label:e.target.value}))} placeholder={t('settings.left_label')} className="rounded border px-2 py-1 text-sm" />
              <input value={form.right_label} onChange={(e)=>setForm(f=>({...f,right_label:e.target.value}))} placeholder={t('settings.right_label')} className="rounded border px-2 py-1 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <input type="number" value={form.min} onChange={(e)=>setForm(f=>({...f,min:Number(e.target.value)}))} className="w-24 rounded border px-2 py-1 text-sm" placeholder={t('settings.min')} />
              <input type="number" value={form.max} onChange={(e)=>setForm(f=>({...f,max:Number(e.target.value)}))} className="w-24 rounded border px-2 py-1 text-sm" placeholder={t('settings.max')} />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex items-center gap-2">
              <input value={form.id} onChange={(e)=>setForm(f=>({...f,id:e.target.value}))} placeholder={t('settings.optional_id')} className="flex-1 rounded border px-2 py-1 text-sm" />
              <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark">{t('common.add')}</button>
            </div>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Backend Sync</h2>
          <div className="rounded-md border bg-white shadow-sm p-3 space-y-2">
            <label className="text-sm text-gray-700">API Base URL
              <input
                value={apiBaseUrl}
                onChange={(e)=> { setApiBaseUrl(e.target.value); setApiBase(e.target.value); }}
                className="ml-2 rounded border px-2 py-1 text-sm w-full"
              />
            </label>
            <div className="flex items-center gap-2">
              <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username" className="rounded border px-2 py-1 text-sm" />
              <input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="Password" className="rounded border px-2 py-1 text-sm" />
              <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={doLogin}>Login</button>
              {token && <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={()=>{ setToken(null); setTokenState(null); }}>Logout</button>}
              <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={()=> syncNow()}>Sync Now</button>
            </div>
            {token && <div className="text-xs text-gray-600 break-all">Token: {token.slice(0,16)}…</div>}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('settings.csv_export')}</h2>
          <div className="rounded-md border bg-white shadow-sm p-3 flex items-center gap-2">
            <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={async()=>{
              const csv = await exportStudentsCSV();
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'students.csv'; a.click();
              URL.revokeObjectURL(url);
            }}>{t('settings.import_students').replace('Importer','Exporter')}</button>
            <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={async()=>{
              const csv = await exportRatingsCSV();
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'ratings.csv'; a.click();
              URL.revokeObjectURL(url);
            }}>{t('settings.import_ratings').replace('Importer','Exporter')}</button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('settings.csv_import')}</h2>
          <div className="rounded-md border bg-white shadow-sm p-3 space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">{t('settings.import_students')}</div>
              <div className="flex items-center gap-2">
                <select id="dup-strategy" className="rounded border px-2 py-1 text-sm">
                  <option value="merge">{t('settings.merge_duplicates')}</option>
                  <option value="skip">{t('settings.skip_duplicates')}</option>
                </select>
                <input id="students-file" type="file" accept=".csv,text/csv" className="text-sm" />
                <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={async()=>{
                  const input = document.getElementById('students-file') as HTMLInputElement;
                  if (!input.files || !input.files[0]) return;
                  const dup = (document.getElementById('dup-strategy') as HTMLSelectElement).value as 'merge'|'skip';
                  const text = await input.files[0].text();
                  const res = await importStudentsCSV(text, { duplicateStrategy: dup });
                  // reload students to reflect changes
                  await useAppStore.getState().loadStudents();
                  alert(`Students imported: inserted ${res.inserted}, merged ${res.merged}, skipped ${res.skipped}`);
                }}>Import</button>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">{t('settings.import_ratings')}</div>
              <div className="flex items-center gap-2">
                <select id="ratings-class" className="rounded border px-2 py-1 text-sm">
                  <option value="">Auto</option>
                  {Array.from(new Set(useAppStore.getState().students.map(s=>s.class_name))).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input id="ratings-file" type="file" accept=".csv,text/csv" className="text-sm" />
                <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={async()=>{
                  const input = document.getElementById('ratings-file') as HTMLInputElement;
                  if (!input.files || !input.files[0]) return;
                  const className = (document.getElementById('ratings-class') as HTMLSelectElement).value || undefined;
                  const text = await input.files[0].text();
                  const res = await importRatingsCSV(text, { defaultClassName: className });
                  // Reload ratings for all students to reflect new values
                  const st = useAppStore.getState().students;
                  await Promise.all(st.map(s=>useAppStore.getState().loadRatingsForStudent(s.id!)));
                  alert(`Ratings imported: inserted ${res.inserted}, skipped ${res.skipped}`);
                }}>Import</button>
              </div>
            </div>
            <div className="text-xs text-gray-600">Schemas:
              <div>students.csv: class_name, year, number, first_name, last_name</div>
              <div>ratings.csv: student_number, scale_id, value, recorded_at[, class_name]</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudentAdmin() {
  const students = useAppStore((s) => s.students);
  const addStudent = useAppStore((s) => s.addStudent);
  const deleteStudent = useAppStore((s) => s.deleteStudent);
  const deleteClass = useAppStore((s) => s.deleteClass);

  const classes = React.useMemo(() => Array.from(new Set(students.map(s=>s.class_name))).sort(), [students]);
  const [selectedClass, setSelectedClass] = React.useState<string>('');
  React.useEffect(() => { if (!selectedClass && classes.length) setSelectedClass(classes[0]); }, [classes, selectedClass]);

  const classStudents = React.useMemo(() => students.filter(s=>!selectedClass || s.class_name===selectedClass).sort((a,b)=>a.number-b.number), [students, selectedClass]);

  const [form, setForm] = React.useState({ class_name: '', number: 1, first_name: '', last_name: '', gender: '' });
  React.useEffect(()=>{ setForm(f=>({...f, class_name: selectedClass || f.class_name})); }, [selectedClass]);

  return (
    <div className="space-y-3 rounded-md border bg-white shadow-sm p-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-700">Class
          <select value={selectedClass} onChange={(e)=>setSelectedClass(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm">
            {classes.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {selectedClass && (
          <button className="ml-auto rounded-md border px-2 py-1 text-sm hover:bg-red-50 text-red-700" onClick={async ()=>{
            if (confirm(`Delete class ${selectedClass} and all its students/ratings/notes?`)) {
              await deleteClass(selectedClass);
              alert('Class deleted');
            }
          }}>Delete Class</button>
        )}
      </div>

      <div className="max-h-64 overflow-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">First</th>
              <th className="text-left px-3 py-2">Last</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {classStudents.map(s => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">{s.number}</td>
                <td className="px-3 py-2">{s.first_name}</td>
                <td className="px-3 py-2">{s.last_name}</td>
                <td className="px-3 py-2 text-right">
                  <button className="rounded-md border px-2 py-1 text-xs hover:bg-red-50 text-red-700" onClick={async ()=>{
                    if (confirm(`Delete student #${s.number} ${s.first_name} ${s.last_name}?`)) {
                      await deleteStudent(s.id!);
                    }
                  }}>Delete</button>
                </td>
              </tr>
            ))}
            {classStudents.length===0 && (
              <tr><td className="px-3 py-2 text-gray-600" colSpan={4}>No students in this class.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
        <input value={form.class_name} onChange={(e)=>setForm(f=>({...f, class_name: e.target.value}))} placeholder="Class" className="rounded border px-2 py-1 text-sm" />
        <input type="number" value={form.number} onChange={(e)=>setForm(f=>({...f, number: Number(e.target.value)}))} placeholder="#" className="rounded border px-2 py-1 text-sm" />
        <input value={form.first_name} onChange={(e)=>setForm(f=>({...f, first_name: e.target.value}))} placeholder="First name" className="rounded border px-2 py-1 text-sm" />
        <input value={form.last_name} onChange={(e)=>setForm(f=>({...f, last_name: e.target.value}))} placeholder="Last name" className="rounded border px-2 py-1 text-sm" />
        <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={async ()=>{
          if (!form.class_name || !form.first_name || !form.last_name) { alert('Fill class, first and last name'); return; }
          await addStudent({ class_name: form.class_name, number: form.number, first_name: form.first_name, last_name: form.last_name, gender: undefined });
          setForm(f=>({...f, first_name: '', last_name: ''}));
        }}>Add Student</button>
      </div>
    </div>
  );
}
