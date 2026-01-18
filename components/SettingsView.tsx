
import React, { useState, useRef } from 'react';
import { Settings as SettingsIcon, Save, ShieldAlert, Lock, Download, Upload, Database, HardDrive, RefreshCcw } from 'lucide-react';
import { ThresholdSettings, Equipment, Reading, UserAccount } from '../types';
import { supabase } from '../services/supabaseClient';

interface SettingsViewProps {
  settings: ThresholdSettings;
  setSettings: (s: ThresholdSettings) => void;
  isAdmin: boolean;
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  users: UserAccount[];
  setUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
}

const SettingsView: React.FC<SettingsViewProps> = ({ 
  settings, 
  setSettings, 
  isAdmin,
  equipments,
  setEquipments,
  readings,
  setReadings,
  users,
  setUsers
}) => {
  const [local, setLocal] = useState(settings);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!isAdmin) return alert("Admin login required to change system limits.");
    
    // Update Supabase
    const { error } = await supabase.from('settings').upsert({
        id: 1, // Singleton row
        poorLimit: local.poorLimit,
        criticalLimit: local.criticalLimit
    });

    if (error) {
        alert("Failed to save settings: " + error.message);
        return;
    }

    setSettings(local);
    alert("Settings updated successfully!");
  };

  const handleCreateRestorePoint = () => {
    if (!isAdmin) return alert("Admin login required to export system data.");
    
    const backupData = {
        metadata: {
            version: "1.0",
            exportDate: new Date().toISOString(),
            exportedBy: "admin", // Assuming admin since check passed
            recordCounts: {
                equipments: equipments.length,
                readings: readings.length,
                users: users.length
            }
        },
        data: {
            equipments,
            readings,
            users,
            settings: local
        }
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `arresterguard_restore_point_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRestoreSystem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAdmin) return alert("Admin login required to restore system data.");

    if (!confirm("WARNING: This will overwrite ALL current system data (Equipment, Readings, Users, Settings) with the selected backup.\n\nAre you sure you want to proceed?")) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const json = JSON.parse(evt.target?.result as string);
            
            // Basic validation
            if (!json.data || !Array.isArray(json.data.equipments) || !Array.isArray(json.data.readings)) {
                throw new Error("Invalid backup file structure.");
            }
            
            // Note: Restore logic for a DB is complex. For this example, we update local state 
            // and warn the user that this is a client-side restore visualization.
            // A full DB restore would require deleting all rows and re-inserting, which is risky to do client-side.
            // For now, we will assume this feature is for "Viewing" a backup or requires a manual DB reset.
            
            alert("NOTE: Restore Point loaded into Local View. To permanently restore this to the database, utilize the Database Reset tool in User Management and re-import.");

            setEquipments(json.data.equipments);
            setReadings(json.data.readings);
            setUsers(json.data.users || users); // Fallback to current users if missing
            if (json.data.settings) {
                setSettings(json.data.settings);
                setLocal(json.data.settings);
            }

        } catch (err) {
            console.error("Restore Error:", err);
            alert("Failed to restore system. The file appears to be corrupt or incompatible.");
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };


  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-slate-800 text-white rounded-xl">
          <SettingsIcon size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">System Configuration</h2>
          <p className="text-slate-500">Global limits and data lifecycle management</p>
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4 text-amber-800">
          <Lock size={20} className="shrink-0" />
          <p className="text-sm font-medium">Configuration is locked. Please login as Admin to modify thresholds or manage backups.</p>
        </div>
      )}

      {/* Thresholds Card */}
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
              value={local.poorLimit}
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
              value={local.criticalLimit}
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
           <div className="text-xs text-emerald-800">Below {local.poorLimit} uA</div>
        </div>
        <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100">
           <div className="text-[10px] font-bold text-amber-600 uppercase mb-1">Poor</div>
           <div className="text-xs text-amber-800">{local.poorLimit} - {local.criticalLimit} uA</div>
        </div>
        <div className="text-center p-4 bg-rose-50 rounded-xl border border-rose-100">
           <div className="text-[10px] font-bold text-rose-600 uppercase mb-1">Critical</div>
           <div className="text-xs text-rose-800">Above {local.criticalLimit} uA</div>
        </div>
      </div>

      {/* Data Backup & Restore Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <HardDrive size={18} className="text-blue-500" />
             System Data & Recovery
           </h3>
        </div>
        <div className="p-8">
            <p className="text-sm text-slate-600 mb-6">
                Manage full system backups. Create a restore point to safeguard your data or restore the system to a previous state from a backup file.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                    disabled={!isAdmin}
                    onClick={handleCreateRestorePoint}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-blue-100 bg-blue-50/50 hover:bg-blue-100 hover:border-blue-300 transition-all text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                    <div className="bg-white p-3 rounded-full shadow-sm text-blue-600 group-hover:scale-110 transition-transform">
                        <Download size={24} />
                    </div>
                    <div className="text-center">
                        <div className="font-bold text-sm">Create Restore Point</div>
                        <div className="text-xs opacity-70 mt-1">Download Backup (.json)</div>
                    </div>
                </button>

                <div className="relative">
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        accept=".json"
                        onChange={handleRestoreSystem}
                        disabled={!isAdmin}
                        className="hidden"
                    />
                    <button
                        disabled={!isAdmin}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-slate-100 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300 transition-all text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        <div className="bg-white p-3 rounded-full shadow-sm text-slate-600 group-hover:scale-110 transition-transform">
                            <Upload size={24} />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-sm">Restore System</div>
                            <div className="text-xs opacity-70 mt-1">Upload Backup File</div>
                        </div>
                    </button>
                </div>
            </div>
            
            <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-medium bg-slate-50 p-2 rounded-lg">
                <Database size={12} />
                <span>Current Database Status: {equipments.length} Assets • {readings.length} Records</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
