
import React, { useState } from 'react';
import { Settings as SettingsIcon, Save, ShieldAlert, Lock } from 'lucide-react';
import { ThresholdSettings } from '../types';

interface SettingsViewProps {
  settings: ThresholdSettings;
  setSettings: (s: ThresholdSettings) => void;
  isAdmin: boolean;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, setSettings, isAdmin }) => {
  const [local, setLocal] = useState(settings);

  const handleSave = () => {
    if (!isAdmin) return alert("Admin login required to change system limits.");
    
    // Defensive check to ensure we don't save NaN
    const poor = parseFloat(String(local.poorLimit));
    const critical = parseFloat(String(local.criticalLimit));
    
    if (isNaN(poor) || isNaN(critical)) {
      alert("Invalid threshold values. Please enter valid numbers.");
      return;
    }

    setSettings({
      poorLimit: poor,
      criticalLimit: critical
    });
    alert("Settings updated successfully!");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-slate-800 text-white rounded-xl">
          <SettingsIcon size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">System Configuration</h2>
          <p className="text-slate-500">Global limits for leakage current diagnostic</p>
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4 text-amber-800">
          <Lock size={20} className="shrink-0" />
          <p className="text-sm font-medium">Configuration is locked. Please login as Admin to modify thresholds.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-500" />
            Health Thresholds (&micro;A)
          </h3>
        </div>
        <div className="p-8 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-600 uppercase">Poor Condition Limit</label>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">WARNING LEVEL</span>
            </div>
            <input 
              disabled={!isAdmin}
              type="number"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all disabled:opacity-50"
              value={isNaN(local.poorLimit) ? '' : local.poorLimit}
              onChange={e => setLocal({...local, poorLimit: parseFloat(e.target.value)})}
            />
            <p className="text-xs text-slate-400 mt-2 italic">Readings above this but below critical will be flagged as 'Poor'.</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-600 uppercase">Critical Condition Limit</label>
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">ALARM LEVEL</span>
            </div>
            <input 
              disabled={!isAdmin}
              type="number"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all disabled:opacity-50"
              value={isNaN(local.criticalLimit) ? '' : local.criticalLimit}
              onChange={e => setLocal({...local, criticalLimit: parseFloat(e.target.value)})}
            />
            <p className="text-xs text-slate-400 mt-2 italic">Readings above this value indicate severe leakage or potential failure.</p>
          </div>

          <button 
            disabled={!isAdmin}
            onClick={handleSave}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={20} /> Apply Configurations
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
           <div className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Satisfactory</div>
           <div className="text-xs text-emerald-800">Below {isNaN(local.poorLimit) ? settings.poorLimit : local.poorLimit} uA</div>
        </div>
        <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100">
           <div className="text-[10px] font-bold text-amber-600 uppercase mb-1">Poor</div>
           <div className="text-xs text-amber-800">{isNaN(local.poorLimit) ? settings.poorLimit : local.poorLimit} - {isNaN(local.criticalLimit) ? settings.criticalLimit : local.criticalLimit} uA</div>
        </div>
        <div className="text-center p-4 bg-rose-50 rounded-xl border border-rose-100">
           <div className="text-[10px] font-bold text-rose-600 uppercase mb-1">Critical</div>
           <div className="text-xs text-rose-800">Above {isNaN(local.criticalLimit) ? settings.criticalLimit : local.criticalLimit} uA</div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
