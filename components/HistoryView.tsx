
import React, { useState, useMemo } from 'react';
import { Search, Edit3, Trash2, X, Check, Filter, AlertCircle, History, ChevronDown, ChevronUp, Zap, Activity, CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Reading, Equipment, HealthStatus } from '../types';
import { formatDisplayDate } from '../utils/reports';
import { supabase } from '../services/supabaseClient';

interface HistoryViewProps {
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  isAdmin: boolean;
}

const HistoryView: React.FC<HistoryViewProps> = ({ readings, setReadings, equipments, setEquipments, isAdmin }) => {
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

  const getStatusForReading = (reading: Reading): 'Satisfactory' | 'Poor' | 'Critical' => {
    const val = Number(reading.correctedResistiveCurrent);
    if (val > 500) return 'Critical';
    if (val > 300) return 'Poor';
    return 'Satisfactory';
  };

  const getStatusForEquipment = (eq: Equipment, latest?: Reading): HealthStatus => {
    if (eq.statusOverride) return eq.statusOverride as HealthStatus;
    if (!latest) return 'Satisfactory'; 
    const val = Number(latest.correctedResistiveCurrent);
    if (val === 0) return 'Probe Failure'; 
    if (val > 500) return 'Critical';
    if (val > 300) return 'Poor';
    return 'Satisfactory';
  };

  const statusColors: Record<HealthStatus | string, string> = {
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
      const eqStatus = getStatusForEquipment(eq, latest); 

      const searchString = `${eq.name} ${eq.substation} ${eq.district} ${eq.voltageLevel}`.toLowerCase();
      const matchesSearch = searchString.includes(searchTerm.toLowerCase());
      
      let matchesStatus = true;
      if (statusFilter === 'Overridden') {
         matchesStatus = (eq.statusOverride !== null && eq.statusOverride !== undefined);
      } else if (statusFilter !== 'All') {
         matchesStatus = eqStatus === statusFilter;
      }
      
      const matchesRatedKV = ratedKVFilter === 'All' || eq.ratedVoltage === ratedKVFilter;

      return matchesSearch && matchesStatus && matchesRatedKV;
    })
    .map(eq => { 
      const latest = getLatestReading(eq.id);
      return {
        ...eq,
        calculatedStatus: getStatusForEquipment(eq, latest),
        latestReading: latest
      };
    })
    .sort((a, b) => { 
      if (a.ratedVoltage !== b.ratedVoltage) {
        return b.ratedVoltage - a.ratedVoltage; 
      }
      return a.name.localeCompare(b.name);
    });
  }, [equipments, readings, searchTerm, statusFilter, ratedKVFilter]);


  const handleDelete = async (id: string) => {
    if (!isAdmin) return alert("Admin access required.");

    const readingToDelete = readings.find(r => r.id === id);
    if (!readingToDelete) return;

    const isActionLog = readingToDelete.notes?.includes('Action Taken');

    let confirmMessage = isActionLog
      ? "This is a classification event. Deleting it will also reset the equipment's status to be automatically calculated. Are you sure you want to delete this event log?"
      : "Permanently delete this measurement record from the history log?";
      
    if (confirm(confirmMessage)) {
      // If it's an action log, first reset the equipment override
      if (isActionLog) {
        const equipmentId = readingToDelete.equipmentId;
        const { error: eqError } = await supabase
          .from('equipment')
          .update({ statusOverride: null })
          .eq('id', equipmentId);

        if (eqError) {
          alert("Failed to reset equipment status override: " + eqError.message);
          return;
        }
        
        // Update local state for equipment to trigger UI refresh
        setEquipments(prev => prev.map(e => 
          e.id === equipmentId ? { ...e, statusOverride: null } : e
        ));
      }

      // Then, delete the reading record itself
      const { error: readingError } = await supabase.from('readings').delete().eq('id', id);

      if (readingError) {
        alert("Error deleting record: " + readingError.message);
        return;
      }

      // Update local readings state
      setReadings(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleEdit = (reading: Reading) => {
    if (!isAdmin) return alert("Admin access required.");
    setEditingId(reading.id);
    setTempData({ ...reading });
  };

  const saveEdit = async () => {
    const updatedReading = { ...tempData, id: editingId } as Reading;
    const { error } = await supabase.from('readings').upsert(updatedReading);
    
    if (error) {
        alert("Error updating record: " + error.message);
        return;
    }

    setReadings(prev => prev.map(r => r.id === editingId ? updatedReading : r));
    setEditingId(null);
  };

  const handleResetOverride = async (eqId: string) => {
    if (!isAdmin) return alert("Admin access required.");
    if (confirm("Are you sure you want to reset the classification override to automatic detection?")) {
        
        // 1. Reset Equipment Override
        await supabase.from('equipment').update({ statusOverride: null }).eq('id', eqId);
        
        setEquipments(prev => prev.map(e => e.id === eqId ? { ...e, statusOverride: null } : e));
        
        // 2. Add Log
        const eq = equipments.find(e => e.id === eqId);
        if (eq) {
             const resetLog: Reading = {
                id: `action-reset-${Date.now()}`,
                equipmentId: eq.id,
                date: new Date().toISOString().split('T')[0],
                totalCurrent: 0,
                resistiveCurrent: 0,
                correctedResistiveCurrent: 0,
                mcovRating: eq.mcovRating,
                ratedVoltage: eq.ratedVoltage,
                notes: 'Action Taken: Override Reset / Auto-mode restored'
             };
             
             await supabase.from('readings').insert(resetLog);
             setReadings(prev => [resetLog, ...prev]);
        }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">History Log</h2>
          <p className="text-slate-500">Centralized measurement archives and data correction per asset</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search equipment by name, substation, or district..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select 
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Overridden">Active Classification / Override</option>
            <option value="Satisfactory">Satisfactory</option>
            <option value="Poor">Poor</option>
            <option value="Critical">Critical</option>
            <option value="De-energized">De-energized</option>
            <option value="Correction of Grounding">Grounding Fix</option>
            <option value="Probe Failure">Probe Failure</option>
          </select>
          <select 
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none"
            value={ratedKVFilter}
            onChange={e => setRatedKVFilter(e.target.value === 'All' ? 'All' : parseFloat(e.target.value))}
          >
            {ratedVoltageOptions.map(v => <option key={v} value={v}>{v} kV</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredEquipments.length > 0 ? filteredEquipments.map(eq => {
          const isExpanded = expandedId === eq.id;
          const allEqReadings = readings.filter(r => r.equipmentId === eq.id);
          const sortedEqReadings = allEqReadings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          // Separate actions (overrides/classifications) from measurements
          const actionReadings = sortedEqReadings.filter(r => r.notes?.includes('Action Taken'));
          // Limit measurement history to 20 items
          const measurementReadings = sortedEqReadings.filter(r => !r.notes?.includes('Action Taken')).slice(0, 20);

          return (
            <div key={eq.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}>
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
                    <Zap size={24} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-800 leading-tight">{eq.name}</h4>
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mt-0.5">{eq.substation} • {eq.voltageLevel}</p>
                    {eq.latestReading && (
                      <div className="mt-2 flex items-center gap-2">
                        <Activity size={12} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Last Corrected: <span className="text-blue-600">{eq.latestReading.correctedResistiveCurrent} uA</span></span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end md:self-auto">
                   <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${statusColors[eq.calculatedStatus]}`}>
                     {eq.calculatedStatus}
                   </span>
                  <button 
                    onClick={() => setExpandedId(isExpanded ? null : eq.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {isExpanded ? 'Hide History' : `Show History (${allEqReadings.length})`}
                  </button>
                  {isAdmin && (
                    <div className="flex gap-1 border-l border-slate-100 pl-2">
                      {/* Edit/Delete Equipment buttons are not directly in HistoryView,
                          as this view focuses on reading history. */}
                    </div>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100 p-6 space-y-8 animate-in slide-in-from-top-4 duration-300">
                  
                  {/* Action / Classification History Section */}
                  {actionReadings.length > 0 && (
                    <div className="space-y-3">
                       <div className="flex items-center justify-between">
                         <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                           <ShieldAlert size={14} className="text-amber-500" /> Classification & Override Events
                         </h5>
                         {eq.statusOverride && (
                           <button 
                             onClick={() => handleResetOverride(eq.id)}
                             className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-100 text-rose-600 rounded-lg text-[10px] font-bold uppercase hover:bg-rose-50 transition-colors shadow-sm"
                           >
                             <RotateCcw size={12} /> Reset to Auto Status
                           </button>
                         )}
                       </div>
                       <div className="overflow-x-auto rounded-xl border border-amber-100/50 shadow-sm">
                          <table className="w-full text-left text-xs bg-white">
                            <thead className="bg-amber-50 text-amber-600 font-bold uppercase text-[9px]">
                               <tr>
                                  <th className="px-4 py-2">Date</th>
                                  <th className="px-4 py-2">Event / Action Taken</th>
                                  <th className="px-4 py-2 text-right">Actions</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-50/50">
                               {actionReadings.map(r => (
                                 <tr key={r.id} className="hover:bg-amber-50/20">
                                   <td className="px-4 py-2.5 font-medium text-slate-600">{formatDisplayDate(r.date)}</td>
                                   <td className="px-4 py-2.5">
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 size={12} className="text-amber-500" />
                                        <span className="font-bold text-slate-700">{r.notes?.replace('Action Taken: ', '')}</span>
                                      </div>
                                   </td>
                                   <td className="px-4 py-2.5 text-right">
                                     {isAdmin && (
                                       <button
                                         onClick={() => handleDelete(r.id)}
                                         className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors"
                                         title="Delete Event Log"
                                       >
                                         <Trash2 size={12} />
                                       </button>
                                     )}
                                   </td>
                                 </tr>
                               ))}
                            </tbody>
                          </table>
                       </div>
                    </div>
                  )}

                  {/* Measurement History Section */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <History size={14} className="text-blue-500" /> Historical Measurements (Last 20)
                    </h5>

                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs bg-white">
                        <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-[9px]">
                          <tr>
                            <th className="px-3 py-3">Date</th>
                            <th className="px-2 py-3 text-center">Rated kV</th>
                            <th className="px-2 py-3 text-center">MCOV (kV)</th>
                            <th className="px-2 py-3 text-center">Total (uA)</th>
                            <th className="px-2 py-3 text-center">Resistive (uA)</th>
                            <th className="px-2 py-3 text-center font-bold text-blue-600">Corrected (uA)</th>
                            <th className="px-3 py-3 text-center">Status</th> 
                            <th className="px-3 py-3 text-left">Notes</th>
                            <th className="px-3 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {measurementReadings.map(r => {
                            const isEditing = editingId === r.id;
                            const readingStatus = getStatusForReading(r);
                            return (
                              <tr key={r.id} className={`${isEditing ? 'bg-blue-50' : 'hover:bg-slate-50/50'} transition-colors`}>
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <input type="date" className="bg-white border rounded px-1 text-[10px]" value={tempData.date || ''} onChange={e => setTempData({...tempData, date: e.target.value})} />
                                  ) : formatDisplayDate(r.date)}
                                </td>
                                <td className="px-2 py-3 text-center font-mono">
                                  {isEditing ? (
                                    <input type="number" step="0.01" className="w-12 text-center bg-white border rounded" value={tempData.ratedVoltage || ''} onChange={e => setTempData({...tempData, ratedVoltage: parseFloat(e.target.value)})} />
                                  ) : `${r.ratedVoltage}`}
                                </td>
                                <td className="px-2 py-3 text-center font-mono">
                                  {isEditing ? (
                                    <input type="number" step="0.01" className="w-12 text-center bg-white border rounded" value={tempData.mcovRating || ''} onChange={e => setTempData({...tempData, mcovRating: parseFloat(e.target.value)})} />
                                  ) : `${r.mcovRating}`}
                                </td>
                                <td className="px-2 py-3 text-center font-mono">
                                  {isEditing ? (
                                    <input type="number" className="w-16 text-center bg-white border rounded" value={tempData.totalCurrent || ''} onChange={e => setTempData({...tempData, totalCurrent: parseFloat(e.target.value)})} />
                                  ) : r.totalCurrent}
                                </td>
                                <td className="px-2 py-3 text-center font-mono">
                                  {isEditing ? (
                                    <input type="number" className="w-16 text-center bg-white border rounded" value={tempData.resistiveCurrent || ''} onChange={e => setTempData({...tempData, resistiveCurrent: parseFloat(e.target.value)})} />
                                  ) : r.resistiveCurrent}
                                </td>
                                <td className="px-2 py-3 text-center font-mono font-bold text-blue-600">
                                  {isEditing ? (
                                    <input type="number" className="w-16 text-center bg-white border rounded font-bold text-blue-600" value={tempData.correctedResistiveCurrent || ''} onChange={e => setTempData({...tempData, correctedResistiveCurrent: parseFloat(e.target.value)})} />
                                  ) : r.correctedResistiveCurrent}
                                </td>
                                <td className="px-3 py-3 text-center"> 
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusColors[readingStatus]}`}>
                                    {readingStatus}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-left">
                                  {isEditing ? (
                                    <input type="text" className="w-full bg-white border rounded px-1 text-[10px]" value={tempData.notes || ''} onChange={e => setTempData({...tempData, notes: e.target.value})} placeholder="Notes" />
                                  ) : (
                                    r.notes && (
                                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                        {r.notes}
                                      </div>
                                    )
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {isAdmin && (isEditing ? (
                                    <div className="flex justify-end gap-1">
                                      <button onClick={saveEdit} className="p-1 bg-emerald-500 text-white rounded hover:bg-emerald-600"><Check size={12} /></button>
                                      <button onClick={() => setEditingId(null)} className="p-1 bg-slate-300 text-white rounded hover:bg-slate-400"><X size={12} /></button>
                                    </div>
                                  ) : (
                                    <div className="flex justify-end gap-1">
                                      <button onClick={() => handleEdit(r)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded transition-colors"><Edit3 size={12} /></button>
                                      <button onClick={() => handleDelete(r.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition-colors"><Trash2 size={12} /></button>
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            );
                          })}
                          {measurementReadings.length === 0 && (
                            <tr>
                              <td colSpan={9} className="py-10 text-center text-slate-400 italic">No measurement history found for this asset.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }) : (
          <div className="py-20 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
            <AlertCircle className="mx-auto text-slate-200 mb-4" size={48} />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No matching equipment or records found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryView;
