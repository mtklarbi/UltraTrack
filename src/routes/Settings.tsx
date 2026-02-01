import { useEffect, useState } from 'react';
import { useAppStore } from '../store/app';
import { exportStudentsCSV, importStudentsCSV } from '../csv';
import { getApiBase, setApiBase, login, getToken, setToken } from '../api';
import { syncNow } from '../syncClient';
import { useTranslation } from 'react-i18next';
import React from 'react';
import {
  listIncidentTypes,
  upsertIncidentType,
  deleteIncidentType,
  getBehaviorSettings,
  updateBehaviorSettings,
  ensureDefaultIncidentTypes,
  getGradeScale,
  updateGradeScale,
  DEFAULT_GRADE_THRESHOLDS,
} from '../repository';
import type { IncidentType, BehaviorSettings, GradeScale, GradeThreshold } from '../db';

export default function Settings() {
  const { t } = useTranslation();
  const students = useAppStore((s) => s.students);
  const loadStudents = useAppStore((s) => s.loadStudents);

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

  useEffect(() => { if (!students.length) void loadStudents(); }, [students.length, loadStudents]);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('nav.settings')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Behavior Grades</h2>
          <BehaviorSettingsAdmin />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-2">Grade Scale</h2>
          <GradeScaleAdmin />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Students</h2>
          <StudentAdmin />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Backend Sync</h2>
          <div className="rounded-md border bg-white shadow-sm p-3 space-y-2">
            <label className="text-sm text-gray-700">API Base URL
              <input
                value={apiBaseUrl}
                onChange={(e) => { setApiBaseUrl(e.target.value); setApiBase(e.target.value); }}
                className="ml-2 rounded border px-2 py-1 text-sm w-full"
              />
            </label>
            <div className="flex items-center gap-2">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="rounded border px-2 py-1 text-sm" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="rounded border px-2 py-1 text-sm" />
              <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={doLogin}>Login</button>
              {token && <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => { setToken(null); setTokenState(null); }}>Logout</button>}
              <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => syncNow()}>Sync Now</button>
            </div>
            {token && <div className="text-xs text-gray-600 break-all">Token: {token.slice(0, 16)}...</div>}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('settings.csv_export')}</h2>
          <div className="rounded-md border bg-white shadow-sm p-3 flex items-center gap-2">
            <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={async () => {
              const csv = await exportStudentsCSV();
              // Add UTF-8 BOM for proper Arabic character support in Excel
              const BOM = '\uFEFF';
              const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'students.csv'; a.click();
              URL.revokeObjectURL(url);
            }}>Export Students</button>
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
                <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={async () => {
                  const input = document.getElementById('students-file') as HTMLInputElement;
                  if (!input.files || !input.files[0]) return;
                  const dup = (document.getElementById('dup-strategy') as HTMLSelectElement).value as 'merge' | 'skip';
                  const text = await input.files[0].text();
                  const res = await importStudentsCSV(text, { duplicateStrategy: dup });
                  // reload students to reflect changes
                  await useAppStore.getState().loadStudents();
                  alert(`Students imported: inserted ${res.inserted}, merged ${res.merged}, skipped ${res.skipped}`);
                }}>Import</button>
              </div>
            </div>
            <div className="text-xs text-gray-600">Schema: class_name, year, number, first_name, last_name</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BehaviorSettingsAdmin() {
  const [settings, setSettings] = React.useState<BehaviorSettings | null>(null);
  const [incidentTypes, setIncidentTypes] = React.useState<IncidentType[]>([]);
  const [newType, setNewType] = React.useState({ label: '', points: 1 });
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  React.useEffect(() => {
    const load = async () => {
      await ensureDefaultIncidentTypes();
      const s = await getBehaviorSettings();
      setSettings(s);
      const types = await listIncidentTypes();
      setIncidentTypes(types);
    };
    load();
  }, []);

  const handleSettingsChange = async (updates: Partial<Omit<BehaviorSettings, 'id' | 'updated_at'>>) => {
    const updated = await updateBehaviorSettings(updates);
    setSettings(updated);
  };

  const handleAddType = async () => {
    if (!newType.label.trim()) return;
    const id = newType.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    await upsertIncidentType({ id, label: newType.label.trim(), points: newType.points });
    const types = await listIncidentTypes();
    setIncidentTypes(types);
    setNewType({ label: '', points: 1 });
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('Delete this incident type?')) return;
    await deleteIncidentType(id);
    const types = await listIncidentTypes();
    setIncidentTypes(types);
  };

  const handleUpdateType = async (id: string, label: string, points: number) => {
    await upsertIncidentType({ id, label, points });
    const types = await listIncidentTypes();
    setIncidentTypes(types);
    setEditingId(null);
  };

  if (!settings) return <div className="text-sm text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-white shadow-sm p-3 space-y-3">
        <h3 className="text-sm font-medium">Grade Settings</h3>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-700">
            Initial Grade:
            <input
              type="number"
              min={1}
              max={100}
              value={settings.initial_grade}
              onChange={(e) => handleSettingsChange({ initial_grade: Math.max(1, Number(e.target.value)) })}
              className="ml-2 w-20 rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm text-gray-700">
            Reset Day:
            <select
              value={settings.reset_day}
              onChange={(e) => handleSettingsChange({ reset_day: Number(e.target.value) })}
              className="ml-2 rounded border px-2 py-1 text-sm"
            >
              {DAYS.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm p-3 space-y-3">
        <h3 className="text-sm font-medium">Incident Types</h3>
        <ul className="space-y-2">
          {incidentTypes.map((type) => (
            <li key={type.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
              {editingId === type.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    id={`edit-label-${type.id}`}
                    defaultValue={type.label}
                    className="rounded border px-2 py-1 text-sm flex-1"
                  />
                  <input
                    id={`edit-points-${type.id}`}
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={type.points}
                    className="w-16 rounded border px-2 py-1 text-sm"
                  />
                  <button
                    className="rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark"
                    onClick={() => {
                      const label = (document.getElementById(`edit-label-${type.id}`) as HTMLInputElement).value;
                      const points = Number((document.getElementById(`edit-points-${type.id}`) as HTMLInputElement).value);
                      handleUpdateType(type.id, label, points);
                    }}
                  >Save</button>
                  <button
                    className="rounded-md border px-2 py-1 text-xs hover:bg-gray-100"
                    onClick={() => setEditingId(null)}
                  >Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{type.label}</span>
                    <span className="text-xs text-red-600 bg-red-50 rounded px-1.5 py-0.5">-{type.points} pts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-md border px-2 py-1 text-xs hover:bg-gray-100"
                      onClick={() => setEditingId(type.id)}
                    >Edit</button>
                    <button
                      className="rounded-md border px-2 py-1 text-xs hover:bg-red-50 text-red-700"
                      onClick={() => handleDeleteType(type.id)}
                    >Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 pt-2 border-t">
          <input
            value={newType.label}
            onChange={(e) => setNewType(n => ({ ...n, label: e.target.value }))}
            placeholder="New incident type"
            className="flex-1 rounded border px-2 py-1 text-sm"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={newType.points}
            onChange={(e) => setNewType(n => ({ ...n, points: Math.max(1, Number(e.target.value)) }))}
            className="w-16 rounded border px-2 py-1 text-sm"
            placeholder="Pts"
          />
          <button
            className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark"
            onClick={handleAddType}
            disabled={!newType.label.trim()}
          >Add</button>
        </div>
      </div>
    </div>
  );
}

function GradeScaleAdmin() {
  const [gradeScale, setGradeScale] = React.useState<GradeScale | null>(null);
  const [thresholds, setThresholds] = React.useState<GradeThreshold[]>([]);

  const PRESETS = {
    letter: [
      { label: 'A', minPercent: 90 },
      { label: 'B', minPercent: 80 },
      { label: 'C', minPercent: 70 },
      { label: 'D', minPercent: 60 },
      { label: 'F', minPercent: 0 },
    ],
    numeric20: [
      { label: '20', minPercent: 95 },
      { label: '18', minPercent: 85 },
      { label: '16', minPercent: 75 },
      { label: '14', minPercent: 65 },
      { label: '12', minPercent: 55 },
      { label: '10', minPercent: 45 },
      { label: '8', minPercent: 35 },
      { label: '6', minPercent: 25 },
      { label: '4', minPercent: 15 },
      { label: '2', minPercent: 0 },
    ],
    numeric10: [
      { label: '10', minPercent: 90 },
      { label: '9', minPercent: 80 },
      { label: '8', minPercent: 70 },
      { label: '7', minPercent: 60 },
      { label: '6', minPercent: 50 },
      { label: '5', minPercent: 40 },
      { label: '4', minPercent: 30 },
      { label: '3', minPercent: 20 },
      { label: '2', minPercent: 10 },
      { label: '1', minPercent: 0 },
    ],
  };

  React.useEffect(() => {
    const load = async () => {
      const scale = await getGradeScale();
      setGradeScale(scale);
      setThresholds(scale.thresholds);
    };
    load();
  }, []);

  const handlePresetChange = async (preset: 'letter' | 'numeric20' | 'numeric10') => {
    const newThresholds = PRESETS[preset];
    setThresholds(newThresholds);
    const updated = await updateGradeScale({ thresholds: newThresholds, type: preset === 'letter' ? 'letter' : 'numeric' });
    setGradeScale(updated);
  };

  const handleThresholdChange = async (index: number, field: 'label' | 'minPercent', value: string | number) => {
    const newThresholds = [...thresholds];
    if (field === 'label') {
      newThresholds[index] = { ...newThresholds[index], label: String(value) };
    } else {
      newThresholds[index] = { ...newThresholds[index], minPercent: Math.max(0, Math.min(100, Number(value))) };
    }
    setThresholds(newThresholds);
    const updated = await updateGradeScale({ thresholds: newThresholds });
    setGradeScale(updated);
  };

  const handleAddThreshold = async () => {
    const newThresholds = [...thresholds, { label: 'New', minPercent: 0 }];
    setThresholds(newThresholds);
    const updated = await updateGradeScale({ thresholds: newThresholds });
    setGradeScale(updated);
  };

  const handleRemoveThreshold = async (index: number) => {
    const newThresholds = thresholds.filter((_, i) => i !== index);
    setThresholds(newThresholds);
    const updated = await updateGradeScale({ thresholds: newThresholds });
    setGradeScale(updated);
  };

  if (!gradeScale) return <div className="text-sm text-gray-500">Loading...</div>;

  // Sort for display (highest first)
  const sortedThresholds = [...thresholds].sort((a, b) => b.minPercent - a.minPercent);

  return (
    <div className="rounded-md border bg-white shadow-sm p-3 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Preset Scales</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handlePresetChange('letter')}
            className="px-3 py-1 text-xs rounded border hover:bg-gray-50"
          >
            A-F (Letter)
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('numeric20')}
            className="px-3 py-1 text-xs rounded border hover:bg-gray-50"
          >
            0-20 (French)
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('numeric10')}
            className="px-3 py-1 text-xs rounded border hover:bg-gray-50"
          >
            1-10 (Numeric)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Grade Thresholds</h3>
        <div className="text-xs text-gray-500 mb-2">Set the minimum percentage for each grade</div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sortedThresholds.map((t, displayIndex) => {
            const actualIndex = thresholds.findIndex(th => th.label === t.label && th.minPercent === t.minPercent);
            return (
              <div key={displayIndex} className="flex items-center gap-2">
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) => handleThresholdChange(actualIndex, 'label', e.target.value)}
                  className="w-16 rounded border px-2 py-1 text-sm text-center font-medium"
                />
                <span className="text-sm text-gray-500">≥</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.minPercent}
                  onChange={(e) => handleThresholdChange(actualIndex, 'minPercent', Number(e.target.value))}
                  className="w-16 rounded border px-2 py-1 text-sm text-center"
                />
                <span className="text-sm text-gray-500">%</span>
                <button
                  type="button"
                  onClick={() => handleRemoveThreshold(actualIndex)}
                  className="text-red-600 hover:text-red-800 text-sm px-2"
                  disabled={thresholds.length <= 1}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleAddThreshold}
          className="text-sm text-brand hover:underline"
        >
          + Add Grade Level
        </button>
      </div>

      <div className="pt-2 border-t text-xs text-gray-500">
        <div className="font-medium mb-1">Preview:</div>
        <div className="flex flex-wrap gap-1">
          {[100, 85, 70, 55, 40, 20].map(pct => {
            const sorted = [...thresholds].sort((a, b) => b.minPercent - a.minPercent);
            let grade = sorted[sorted.length - 1]?.label ?? '?';
            for (const t of sorted) {
              if (pct >= t.minPercent) {
                grade = t.label;
                break;
              }
            }
            return (
              <span key={pct} className="inline-block bg-gray-100 rounded px-2 py-0.5">
                {pct}% → <strong>{grade}</strong>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StudentAdmin() {
  const students = useAppStore((s) => s.students);
  const addStudent = useAppStore((s) => s.addStudent);
  const deleteStudent = useAppStore((s) => s.deleteStudent);
  const deleteClass = useAppStore((s) => s.deleteClass);

  const classes = React.useMemo(() => Array.from(new Set(students.map(s => s.class_name))).sort(), [students]);
  const [selectedClass, setSelectedClass] = React.useState<string>('');
  React.useEffect(() => { if (!selectedClass && classes.length) setSelectedClass(classes[0]); }, [classes, selectedClass]);

  const classStudents = React.useMemo(() => students.filter(s => !selectedClass || s.class_name === selectedClass).sort((a, b) => a.number - b.number), [students, selectedClass]);

  const [form, setForm] = React.useState({ class_name: '', number: 1, first_name: '', last_name: '', gender: '' });
  React.useEffect(() => { setForm(f => ({ ...f, class_name: selectedClass || f.class_name })); }, [selectedClass]);

  return (
    <div className="space-y-3 rounded-md border bg-white shadow-sm p-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-700">Class
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm">
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {selectedClass && (
          <button className="ml-auto rounded-md border px-2 py-1 text-sm hover:bg-red-50 text-red-700" onClick={async () => {
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
                  <button className="rounded-md border px-2 py-1 text-xs hover:bg-red-50 text-red-700" onClick={async () => {
                    if (confirm(`Delete student #${s.number} ${s.first_name} ${s.last_name}?`)) {
                      await deleteStudent(s.id!);
                    }
                  }}>Delete</button>
                </td>
              </tr>
            ))}
            {classStudents.length === 0 && (
              <tr><td className="px-3 py-2 text-gray-600" colSpan={4}>No students in this class.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
        <input value={form.class_name} onChange={(e) => setForm(f => ({ ...f, class_name: e.target.value }))} placeholder="Class" className="rounded border px-2 py-1 text-sm" />
        <input type="number" value={form.number} onChange={(e) => setForm(f => ({ ...f, number: Number(e.target.value) }))} placeholder="#" className="rounded border px-2 py-1 text-sm" />
        <input value={form.first_name} onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First name" className="rounded border px-2 py-1 text-sm" />
        <input value={form.last_name} onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last name" className="rounded border px-2 py-1 text-sm" />
        <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={async () => {
          if (!form.class_name || !form.first_name || !form.last_name) { alert('Fill class, first and last name'); return; }
          await addStudent({ class_name: form.class_name, number: form.number, first_name: form.first_name, last_name: form.last_name, gender: undefined });
          setForm(f => ({ ...f, first_name: '', last_name: '' }));
        }}>Add Student</button>
      </div>
    </div>
  );
}
