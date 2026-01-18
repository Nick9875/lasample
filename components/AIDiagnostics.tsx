
import React, { useState, useMemo } from 'react';
import { ShieldAlert, Sparkles, Brain, Loader2, Thermometer, ShieldCheck, ArrowRightLeft, Search, CheckCircle2, X, Filter } from 'lucide-react';
import { Equipment, Reading, ThresholdSettings, HealthStatus } from '../types';
import { performAIDiagnostic, performAIComparison } from '../services/geminiService';
import { calculateHealthStatus } from '../utils/health';

interface AIDiagnosticsProps {
  equipments: Equipment[];
  readings: Reading[];
  settings: ThresholdSettings;
}

const AIDiagnostics: React.FC<AIDiagnosticsProps> = ({ equipments, readings, settings }) => {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [selectedId, setSelectedId] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareSearch, setCompareSearch] = useState('');
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // New Filter States
  const [filterVoltage, setFilterVoltage] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const statusColors: Record<HealthStatus | string, string> = {
    Satisfactory: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    Poor: 'text-amber-600 bg-amber-50 border-amber-100',
    Critical: 'text-rose-600 bg-rose-50 border-rose-100',
    'Probe Failure': 'text-slate-600 bg-slate-100 border-slate-200',
    'Correction of Grounding': 'text-blue-600 bg-blue-50 border-blue-100',
    'De-energized': 'text-purple-600 bg-purple-50 border-purple-100',
    'Unknown': 'text-slate-400 bg-slate-50 border-slate-200'
  };

  const equipmentsWithStatus = useMemo(() => {
    return equipments.map(eq => {
      const latest = readings.filter(r => r.equipmentId === eq.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const status = calculateHealthStatus(eq, latest, settings);
      return { ...eq, status, latestVal: latest?.correctedResistiveCurrent };
    });
  }, [equipments, readings, settings]);

  const unhealthyEquipments = useMemo(() => {
    return equipmentsWithStatus.filter(eq => 
      eq.status === 'Poor' || eq.status === 'Critical' || eq.status === 'Probe Failure'
    );
  }, [equipmentsWithStatus]);

  const availableForComparison = useMemo(() => {
    let list = equipmentsWithStatus;
    
    // 1. Filter by Search
    if (compareSearch) {
      const lower = compareSearch.toLowerCase();
      list = list.filter(e => 
        e.name.toLowerCase().includes(lower) || 
        e.substation.toLowerCase().includes(lower) ||
        e.district.toLowerCase().includes(lower)
      );
    }

    // 2. Filter by Voltage
    if (compareIds.length > 0) {
      // Lock to first selected item's voltage
      const firstEq = equipments.find(e => e.id === compareIds[0]);
      if (firstEq) {
        list = list.filter(e => e.ratedVoltage === firstEq.ratedVoltage);
      }
    } else if (filterVoltage !== 'All') {
      // Apply manual filter if no selection yet
      const v = parseFloat(filterVoltage);
      list = list.filter(e => !isNaN(v) && e.ratedVoltage === v);
    }

    // 3. Filter by Status
    if (filterStatus !== 'All') {
      list = list.filter(e => e.status === filterStatus);
    }
    
    // Sort by name
    return list.sort((a,b) => a.name.localeCompare(b.name));
  }, [equipmentsWithStatus, compareSearch, compareIds, filterVoltage, filterStatus]);

  const voltageStats = useMemo(() => {
    const uniqueRatedVoltages = Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: any, b: any) => a - b);
    
    return uniqueRatedVoltages.map(ratedKV => {
      const eqAtRatedKV = equipmentsWithStatus.filter(e => e.ratedVoltage === ratedKV);
      
      return {
        ratedKV,
        total: eqAtRatedKV.length,
        satisfactory: eqAtRatedKV.filter(e => e.status === 'Satisfactory').length,
        poor: eqAtRatedKV.filter(e => e.status === 'Poor').length,
        critical: eqAtRatedKV.filter(e => e.status === 'Critical').length,
      };
    });
  }, [equipments, equipmentsWithStatus]);

  const uniqueVoltages = useMemo(() => {
    return Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: any, b: any) => a - b);
  }, [equipments]);

  const handleRunDiagnostic = async () => {
    if (mode === 'single') {
      if (!selectedId) return;
      setIsLoading(true);
      setDiagnostic(null);
      const eq = equipments.find(e => e.id === selectedId);
      if (!eq) {
        setIsLoading(false);
        return;
      }
      const history = readings.filter(r => r.equipmentId === selectedId);
      const result = await performAIDiagnostic(eq, history, settings);
      setDiagnostic(result);
      setIsLoading(false);
    } else {
      if (compareIds.length < 2) return alert("Select at least 2 units to compare.");
      setIsLoading(true);
      setDiagnostic(null);
      
      const items = compareIds.map(id => {
        const equipment = equipments.find(e => e.id === id)!;
        const history = readings.filter(r => r.equipmentId === id);
        return { equipment, readings: history };
      });
      
      const result = await performAIComparison(items, settings);
      setDiagnostic(result);
      setIsLoading(false);
    }
  };

  const toggleCompareId = (id: string) => {
    if (compareIds.includes(id)) {
      setCompareIds(prev => prev.filter(i => i !== id));
    } else {
      if (compareIds.length >= 3) return alert("Maximum 3 units allowed for comparison.");
      setCompareIds(prev => [...prev, id]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Brain size={140} />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-bold uppercase mb-4 border border-blue-500/30">
            <Sparkles size={14} /> AI Engine Powered
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">Diagnostic Center</h2>
          <p className="text-slate-400 mt-2 max-w-xl">Deep learning analysis for high-risk equipment showing abnormal leakage trends.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {voltageStats.map(stat => (
          <div key={stat.ratedKV} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-50">{stat.ratedKV} kV Rated</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Satisfactory</span>
                <span className="font-bold text-emerald-600">{stat.satisfactory}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Poor</span>
                <span className="font-bold text-amber-600">{stat.poor}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Critical</span>
                <span className="font-bold text-rose-600">{stat.critical}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
               <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden flex">
                  <div style={{width: `${Number(stat.total) > 0 ? (Number(stat.satisfactory)/Number(stat.total))*100 : 0}%`}} className="bg-emerald-500 h-full"></div>
                  <div style={{width: `${Number(stat.total) > 0 ? (Number(stat.poor)/Number(stat.total))*100 : 0}%`}} className="bg-amber-500 h-full"></div>
                  <div style={{width: `${Number(stat.total) > 0 ? (Number(stat.critical)/Number(stat.total))*100 : 0}%`}} className="bg-rose-500 h-full"></div>
               </div>
               <span className="ml-2 text-[10px] font-bold text-slate-400">{stat.total} Total</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col h-[700px]">
          <div className="flex items-center gap-2 mb-2 p-1 bg-slate-100 rounded-xl">
            <button 
              onClick={() => { setMode('single'); setDiagnostic(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'single' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Thermometer size={14} /> Single Unit
            </button>
            <button 
              onClick={() => { setMode('compare'); setDiagnostic(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'compare' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ArrowRightLeft size={14} /> Compare (Max 3)
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {mode === 'single' ? (
              <>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">Vulnerable Equipment</h3>
                <p className="text-xs text-slate-500 mb-4">Select an arrester identified as 'Poor' or 'Critical' for deep AI diagnostic.</p>
                <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar pr-1">
                  {unhealthyEquipments.map(eq => (
                    <button 
                      key={eq.id}
                      onClick={() => setSelectedId(eq.id)}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${selectedId === eq.id ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/20' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className={`font-bold text-sm ${selectedId === eq.id ? 'text-white' : 'text-slate-800'}`}>{eq.name}</div>
                          <div className={`text-[10px] uppercase font-bold tracking-widest mt-1 ${selectedId === eq.id ? 'text-blue-200' : 'text-slate-400'}`}>{eq.substation}</div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${selectedId === eq.id ? 'bg-white/20 text-white' : statusColors[eq.status]}`}>
                          {eq.status}
                        </span>
                      </div>
                    </button>
                  ))}
                  {unhealthyEquipments.length === 0 && (
                    <div className="text-center py-10">
                      <ShieldCheck size={40} className="mx-auto text-emerald-200 mb-2" />
                      <p className="text-xs text-emerald-600 font-medium italic">All equipment operating within satisfactory limits.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">Select Units to Compare</h3>
                <div className="space-y-3 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Search equipment..." 
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                      value={compareSearch}
                      onChange={e => setCompareSearch(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                      value={filterVoltage}
                      onChange={e => setFilterVoltage(e.target.value)}
                      disabled={compareIds.length > 0}
                    >
                      <option value="All">All Voltages</option>
                      {uniqueVoltages.map(v => <option key={v} value={v}>{v} kV</option>)}
                    </select>
                    <select 
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none"
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="All">All Status</option>
                      <option value="Satisfactory">Satisfactory</option>
                      <option value="Poor">Poor</option>
                      <option value="Critical">Critical</option>
                      <option value="Probe Failure">Probe Failure</option>
                    </select>
                  </div>
                </div>
                {compareIds.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-3 bg-blue-50 p-2 rounded-xl border border-blue-100 animate-in fade-in zoom-in-95">
                      {compareIds.map(id => {
                        const eq = equipments.find(e => e.id === id);
                        return (
                          <span key={id} className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded-lg text-[10px] font-bold text-blue-700 shadow-sm border border-blue-100">
                            {eq?.name} <button onClick={() => toggleCompareId(id)}><X size={10} /></button>
                          </span>
                        );
                      })}
                      <div className="w-full text-[9px] text-blue-400 font-bold text-center mt-1 flex items-center justify-center gap-1">
                        <ArrowRightLeft size={10} /> Comparison set locked to {equipments.find(e => e.id === compareIds[0])?.ratedVoltage}kV
                      </div>
                   </div>
                )}
                <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar pr-1">
                  {availableForComparison.map(eq => {
                    const isSelected = compareIds.includes(eq.id);
                    return (
                      <button 
                        key={eq.id}
                        onClick={() => toggleCompareId(eq.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                      >
                        <div className="min-w-0 flex-1 mr-2">
                          <div className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>{eq.name}</div>
                          <div className={`text-[9px] uppercase font-bold tracking-widest mt-0.5 ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>{eq.substation}</div>
                        </div>
                        <div className="flex items-center gap-2">
                           {!isSelected && (
                             <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${statusColors[eq.status]}`}>
                               {eq.status}
                             </span>
                           )}
                           {isSelected && <CheckCircle2 size={16} className="text-white shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <button 
            disabled={isLoading || (mode === 'single' ? !selectedId : compareIds.length < 2)}
            onClick={handleRunDiagnostic}
            className="w-full mt-4 bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black transition-all"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            {mode === 'single' ? 'Generate AI Report' : `Compare ${compareIds.length} Units`}
          </button>
        </div>

        <div className="lg:col-span-2 bg-slate-50 rounded-2xl border border-slate-200 border-dashed p-8 relative min-h-[500px] flex flex-col items-center justify-center text-center">
          {isLoading ? (
            <div className="space-y-4">
              <div className="animate-spin-slow bg-blue-100 p-6 rounded-full inline-block">
                <Sparkles size={48} className="text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Processing Diagnostic Data...</h3>
              <p className="text-slate-500 max-w-sm">Gemini is analyzing historical trends, resistive patterns, and system voltage correlations.</p>
            </div>
          ) : diagnostic ? (
            <div className="w-full text-left bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-900">
                  {mode === 'single' ? 'AI Diagnostic Report' : 'Comparative Analysis Report'}
                </h3>
                <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full uppercase tracking-tighter">Verified Engine Output</span>
              </div>
              <div className="prose prose-slate max-w-none whitespace-pre-wrap text-slate-600 leading-relaxed font-medium">
                {diagnostic}
              </div>
              <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-between">
                 <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">End of Automated Diagnostic</div>
                 <button className="text-blue-600 text-xs font-bold hover:underline">Download Analysis (PDF)</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Brain size={64} className="mx-auto text-slate-300" />
              <h3 className="text-xl font-bold text-slate-400">Ready for Analysis</h3>
              <p className="text-slate-400 max-w-sm">
                {mode === 'single' 
                  ? "Select an equipment from the left to start the engineering health assessment." 
                  : "Select up to 3 units of the same voltage rating to generate a comparative performance report."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIDiagnostics;
