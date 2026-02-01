import { useEffect, useState } from 'react';
import type { IncidentType } from '../db';
import { listIncidentTypes, ensureDefaultIncidentTypes } from '../repository';

export type IncidentButtonsProps = {
  onIncident: (incidentType: IncidentType, customPoints?: number, customNote?: string) => void;
  disabled?: boolean;
};

export default function IncidentButtons({ onIncident, disabled }: IncidentButtonsProps) {
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customPoints, setCustomPoints] = useState(1);
  const [customNote, setCustomNote] = useState('');

  useEffect(() => {
    const load = async () => {
      await ensureDefaultIncidentTypes();
      const types = await listIncidentTypes();
      setIncidentTypes(types);
    };
    load();
  }, []);

  const handleQuickIncident = (type: IncidentType) => {
    onIncident(type);
  };

  const handleCustomIncident = () => {
    if (!customNote.trim()) return;
    const customType: IncidentType = {
      id: 'custom',
      label: 'Custom',
      points: customPoints,
      updated_at: Date.now(),
    };
    onIncident(customType, customPoints, customNote.trim());
    setCustomNote('');
    setCustomPoints(1);
    setShowCustom(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {incidentTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            disabled={disabled}
            onClick={() => handleQuickIncident(type)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span>{type.label}</span>
            <span className="text-xs font-medium text-red-500">-{type.points}</span>
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowCustom(!showCustom)}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {showCustom ? 'Cancel' : 'Custom...'}
        </button>
      </div>

      {showCustom && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">
              Points:
              <input
                type="number"
                min={1}
                max={20}
                value={customPoints}
                onChange={(e) => setCustomPoints(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="ml-2 w-16 rounded border px-2 py-1 text-sm"
              />
            </label>
          </div>
          <div>
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Describe the incident..."
              className="w-full rounded border px-2 py-1 text-sm h-20"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!customNote.trim() || disabled}
              onClick={handleCustomIncident}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Record Incident (-{customPoints})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
