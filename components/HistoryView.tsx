
import React, { useState, useMemo } from 'react';
import { Search, Edit3, Trash2, X, Check, Filter, AlertCircle, History, ChevronDown, ChevronUp, Zap, Activity, CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Reading, Equipment, HealthStatus, ThresholdSettings } from '../types';
import { formatDisplayDate } from '../utils/reports';
import { calculateHealthStatus } from '../utils/health';

interface HistoryViewProps {
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  settings: ThresholdSettings;
  isAdmin: boolean;
}

const HistoryView: React.FC<HistoryViewProps> = ({ readings, setReadings, equipments, setEquipments, settings, isAdmin }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [ratedKVFilter, setRatedKVFilter] = useState<number | 'All'>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempData, setTempData] = useState<Partial<Reading>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ratedVoltageOptions = useMemo(() => {
    const uniqueVoltages = Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a, b) => Number(a) - Number(b));
    return ['All', ...uniqueVoltages.map(String)];
  }, [equipments]);

  const statusColors: Record<string, string> = {
    Satisfactory: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    Poor: 'text-amber-600 bg-amber-50 border-amber-100',
    Critical: 'text-rose-600 bg-rose-50 border-rose-100',
    'Probe Failure': 'text-slate-600 bg-slate-100 border-slate-200',
    'Correction of Grounding': 'text-blue-600 bg-blue-50 border-blue-100',
    'De-energized': 'text-purple-600 bg-purple-50 border-purple-100',
    'All': 'text-slate-600 bg-slate-50 border-slate-200'
  };

  const getLatestReading = (eqId: string) => {
    return readings.filter(r => r.equipmentId === eqId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const filteredEquipments = useMemo(() => {
    return equipments.filter(eq => {
      const latest = getLatestReading(eq.id);
      const eqStatus = calculateHealthStatus(eq, latest, settings);
      const searchString = `${eq.name} ${eq.substation} ${eq.district} ${eq.voltageLevel}`.toLowerCase();
      const matchesSearch = searchString.includes(searchTerm.toLowerCase());
      
      let matchesStatus;
      switch (statusFilter) {
        case 'All':
          matchesStatus = true;
          break;
        case 'Overridden':
          matchesStatus = !!eq.statusOverride;
          break;
        case 'Action Log':
          matchesStatus = readings.some(r => r.equipmentId === eq.id && r.notes?.startsWith('Action Taken:'));
          break;
        default:
          matchesStatus = eqStatus === statusFilter;
      }

      const matchesRatedKV = ratedKVFilter === 'All' || eq.ratedVoltage === ratedKVFilter;
      return matchesSearch && matchesStatus && matchesRatedKV;
    })
    .map(eq => {
      const latest = getLatestReading(eq.id);
      return { ...eq, calculatedStatus: calculateHealthStatus(eq, latest, settings), latestReading: latest };
    })
    .sort((a, b) => b.ratedVoltage - a.ratedVoltage || a.name.localeCompare(b.name));
  }, [equipments, readings, searchTerm, statusFilter, ratedKVFilter, settings]);

  const handleResetOverride = (eqId: string) => {
    if (!isAdmin) return alert("Unauthorized access.");
    if (confirm("Reset override to automatic detection? This action will be logged.")) {
        // Collapse the card to provide a visual refresh effect
        setExpandedId(null);

        setEquipments(prev => prev.map(e => e.id === eqId ? { ...e, statusOverride: null } : e));
        
        const eq = equipments.find(e => e.id === eqId);
        if (eq) {
            const newActionReading: Reading = {
                id: `action-${Date.now()}`,
                equipmentId: eq.id,
                date: new Date().toISOString().split('T')[0],
                totalCurrent: 0,
                resistiveCurrent: 0,
                correctedResistiveCurrent: -1, 
                mcovRating: eq.mcovRating,
                ratedVoltage: eq.ratedVoltage,
                notes: `Action Taken: Override reset to automatic detection.`
            };
            setReadings(prev => [newActionReading, ...prev]);
        }
        
        // Re-expand the card after a short delay so user sees the updated state
        setTimeout(() => setExpandedId(eqId), 100);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search archive..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select className="flex-1 md:flex-none bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">All Status</option>
            <option value="Satisfactory">Satisfactory</option>
            <option value="Poor">Poor</option>
            <option value="Critical">Critical</option>
            <option value="Probe Failure">Probe Failure</option>
            <option value="Overridden">Overridden</option>
            <option value="Action Log">Classification &amp; Override Events</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredEquipments.map(eq => {
          const isExpanded = expandedId === eq.id;
          const eqReadings = readings.filter(r => r.equipmentId === eq.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return (
            <div key={eq.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isExpanded ? 'ring-2 ring-blue-500' : ''}`}>
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}><Zap size={24} /></div>
                  <div><h4 className="font-extrabold text-slate-800 leading-tight">{eq.name}</h4><p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">{eq.substation} • {eq.voltageLevel}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${statusColors[eq.calculatedStatus] || statusColors['All']}`}>{eq.calculatedStatus}</span>
                  <button onClick={() => setExpandedId(isExpanded ? null : eq.id)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Archive
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100 p-6 space-y-4">
                  {eq.statusOverride && (
                    <div className="bg-blue-100 border border-blue-200 text-blue-800 text-xs font-bold p-3 rounded-xl flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2">
                        <ShieldAlert size={16} />
                        <span>Status is manually overridden to: {eq.statusOverride}</span>
                        </div>
                        {isAdmin && (
                        <button onClick={() => handleResetOverride(eq.id)} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50 shadow-sm border border-blue-200">
                            <RotateCcw size={12} /> Reset to Automatic
                        </button>
                        )}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[9px]">
                        <tr><th className="px-3 py-3">Date</th><th className="px-2 py-3 text-center">Rated kV</th><th className="px-2 py-3 text-center">Corrected</th><th className="px-3 py-3 text-center">Status</th><th className="px-3 py-3 text-right">Actions</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {eqReadings.map(r => {
                          const isActionLog = r.notes?.startsWith('Action Taken:');
                          
                          if (isActionLog) {
                            return (
                              <tr key={r.id} className="bg-blue-50/50 hover:bg-blue-100/50 transition-colors">
                                <td className="px-3 py-3 font-medium text-slate-500">{formatDisplayDate(r.date)}</td>
                                <td colSpan={3} className="px-3 py-3 text-blue-800 font-medium">
                                  <div className="flex items-center gap-2">
                                    <ShieldAlert size={14} />
                                    <span>{r.notes}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {isAdmin && <button onClick={() => { if(confirm("Delete this log entry?")) setReadings(prev => prev.filter(rd => rd.id !== r.id)); }} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={12} /></button>}
                                </td>
                              </tr>
                            );
                          }
                          
                          const readingStatus = calculateHealthStatus(eq, r, settings);
                          return (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-3 font-medium">{formatDisplayDate(r.date)}</td>
                              <td className="px-2 py-3 text-center font-mono">{r.ratedVoltage}</td>
                              <td className="px-2 py-3 text-center font-mono font-bold text-blue-600">{r.correctedResistiveCurrent} uA</td>
                              <td className="px-3 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusColors[readingStatus]}`}>{readingStatus}</span></td>
                              <td className="px-3 py-3 text-right">
                                {isAdmin && <button onClick={() => { if(confirm("Delete record?")) setReadings(prev => prev.filter(rd => rd.id !== r.id)); }} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={12} /></button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryView;
