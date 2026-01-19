
import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart as ReLineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Search, 
  PowerOff, 
  Hammer, 
  ShieldAlert, 
  X, 
  History,
  Check,
  ShieldCheck,
  TrendingUp,
  Settings2,
  ChevronDown
} from 'lucide-react';
import { Equipment, Reading, ThresholdSettings, HealthStatus } from '../types';
import { formatDisplayDate } from '../utils/reports';
import { supabase } from '../services/supabaseClient';

interface DashboardProps {
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  settings: ThresholdSettings;
  searchTerm: string;
  isAdmin: boolean;
  initialTargetId?: string | null;
  initialStatusFilter?: 'All' | 'At Risk';
}

interface DashboardItem extends Equipment {
  latest?: Reading;
  status: HealthStatus;
}

const Dashboard: React.FC<DashboardProps> = ({ equipments, setEquipments, readings, setReadings, settings, searchTerm, isAdmin, initialTargetId, initialStatusFilter }) => {
  const [selectedTrendIds, setSelectedTrendIds] = useState<string[]>([]);
  const [trendSearch, setTrendSearch] = useState('');
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);
  const [activeResolutionId, setActiveResolutionId] = useState<string | null>(null);
  
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<HealthStatus | 'All' | 'At Risk'>('All');
  const [tableRatedKVFilter, setTableRatedKVFilter] = useState<number | 'All'>('All');

  const [chartOptions, setChartOptions] = useState({ 
    showTotal: false, 
    showResistive: true, 
    showCorrected: true 
  });

  // Handle Deep Linking / Auto-Filter for Equipment
  useEffect(() => {
    if (initialTargetId) {
       const eq = equipments.find(e => e.id === initialTargetId);
       if (eq) {
         setTableSearch(eq.name); // Filter table by name
         setTableStatusFilter('All');
         setTableRatedKVFilter('All');
         
         // Highlight in Trend Analysis
         setSelectedTrendIds([initialTargetId]);
         const element = document.getElementById('trend-analysis-section');
         if (element) {
           setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
         }
       }
    }
  }, [initialTargetId, equipments]);

  // Handle Initial Status Filter (e.g. from Header "Action Required" click)
  useEffect(() => {
    if (initialStatusFilter && initialStatusFilter !== 'All') {
        setTableStatusFilter(initialStatusFilter);
    } else {
        setTableStatusFilter('All');
    }
  }, [initialStatusFilter]);

  const getStatus = (eq: Equipment, latest?: Reading): HealthStatus => {
    if (eq.statusOverride) return eq.statusOverride as HealthStatus;
    if (!latest) return 'Satisfactory';
    const val = Number(latest.correctedResistiveCurrent); 
    if (val === 0) return 'Probe Failure'; 
    if (val > settings.criticalLimit) return 'Critical';
    if (val > settings.poorLimit) return 'Poor';
    return 'Satisfactory';
  };

  const getLatestReading = (eqId: string) => {
    return readings.filter(r => r.equipmentId === eqId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const dashboardData: DashboardItem[] = useMemo(() => {
    return equipments.map(eq => {
      const latest = getLatestReading(eq.id);
      const status = getStatus(eq, latest);
      return { ...eq, latest, status };
    });
  }, [equipments, readings, settings]);

  const statsByRatedKV = useMemo(() => {
    const uniqueRatings = Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: number, b: number) => a - b);
    
    const displayRatings = uniqueRatings.length > 0 ? uniqueRatings : [13.8, 69, 115, 230, 500];

    return displayRatings.map(kv => {
      const data = dashboardData.filter(d => d.ratedVoltage === kv);
      const satisfactoryCount = data.filter(d => d.status === 'Satisfactory').length;
      const poorCount = data.filter(d => d.status === 'Poor').length;
      const criticalCount = data.filter(d => d.status === 'Critical').length;
      const probeFailCount = data.filter(d => d.status === 'Probe Failure').length;
      
      return {
        ratedKV: kv,
        Satisfactory: satisfactoryCount,
        Poor: poorCount,
        Critical: criticalCount,
        AtRisk: poorCount + criticalCount + probeFailCount,
        total: data.length
      };
    });
  }, [dashboardData, equipments]);

  const stats = useMemo(() => {
    const atRiskCount = dashboardData.filter(d => ['Poor', 'Critical', 'Probe Failure'].includes(d.status)).length;
    return {
      total: dashboardData.length,
      satisfactory: dashboardData.filter(d => d.status === 'Satisfactory').length,
      poor: dashboardData.filter(d => d.status === 'Poor').length,
      critical: dashboardData.filter(d => d.status === 'Critical').length,
      probeFail: dashboardData.filter(d => d.status === 'Probe Failure').length,
      grounding: dashboardData.filter(d => d.status === 'Correction of Grounding').length,
      deEnergized: dashboardData.filter(d => d.status === 'De-energized').length,
      atRisk: atRiskCount,
    };
  }, [dashboardData]);

  const alarms = useMemo(() => {
    return dashboardData.filter(d => ['Poor', 'Critical', 'Probe Failure'].includes(d.status));
  }, [dashboardData]);

  const tableItems = useMemo(() => {
    return dashboardData
      .filter(item => {
        const matchesSearch = tableSearch === '' || 
          item.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
          item.substation.toLowerCase().includes(tableSearch.toLowerCase()) ||
          item.district.toLowerCase().includes(tableSearch.toLowerCase());
        
        let matchesStatus = true;
        if (tableStatusFilter === 'At Risk') {
          matchesStatus = ['Poor', 'Critical', 'Probe Failure'].includes(item.status);
        } else if (tableStatusFilter !== 'All') {
          matchesStatus = item.status === tableStatusFilter;
        }

        const matchesKV = tableRatedKVFilter === 'All' || item.ratedVoltage === tableRatedKVFilter;
        
        return matchesSearch && matchesStatus && matchesKV;
      })
      .slice(0, 6);
  }, [dashboardData, tableSearch, tableStatusFilter, tableRatedKVFilter]);

  const toggleTrendSelection = (id: string) => {
    setSelectedTrendIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 9) return prev;
      return [...prev, id];
    });
  };

  const handleTrendLink = (id: string) => {
    setSelectedTrendIds([id]);
    const element = document.getElementById('trend-analysis-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const statusColors: Record<HealthStatus | 'All' | 'At Risk' | string, string> = {
    Satisfactory: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    Poor: 'text-amber-600 bg-amber-50 border-amber-100',
    Critical: 'text-rose-600 bg-rose-50 border-rose-100',
    'Probe Failure': 'text-slate-600 bg-slate-100 border-slate-200',
    'Correction of Grounding': 'text-blue-600 bg-blue-50 border-blue-100',
    'De-energized': 'text-purple-600 bg-purple-50 border-purple-100',
    'At Risk': 'text-orange-600 bg-orange-50 border-orange-100'
  };

  const handleResolveAlarm = async (eqId: string, resolution: HealthStatus) => {
    if (!isAdmin) return alert("Admin access required to classify alarms.");
    
    // 1. Update Equipment Status Override in Supabase
    await supabase.from('equipment').update({ statusOverride: resolution }).eq('id', eqId);
    setEquipments(prev => prev.map(e => e.id === eqId ? { ...e, statusOverride: resolution } : e));
    
    // 2. Add History Record (Action Taken) to Supabase
    const eq = equipments.find(e => e.id === eqId);
    const latest = getLatestReading(eqId);
    
    if (eq) {
        const newReading: Reading = {
            id: `action-${Date.now()}`,
            equipmentId: eq.id,
            date: new Date().toISOString().split('T')[0],
            // If de-energized, we assume 0 current, otherwise keep latest measurement for record but note the override
            totalCurrent: resolution === 'De-energized' ? 0 : (latest?.totalCurrent || 0),
            resistiveCurrent: resolution === 'De-energized' ? 0 : (latest?.resistiveCurrent || 0),
            correctedResistiveCurrent: resolution === 'De-energized' ? 0 : (latest?.correctedResistiveCurrent || 0),
            mcovRating: eq.mcovRating,
            ratedVoltage: eq.ratedVoltage,
            notes: `Action Taken: Classified as ${resolution}`
        };

        const { error } = await supabase.from('readings').insert(newReading);
        if (!error) {
            setReadings(prev => [newReading, ...prev]);
        }
    }
    
    setActiveResolutionId(null);
  };

  const chartData = useMemo(() => {
    if (selectedTrendIds.length === 0) return [];
    const selectedReadings = readings.filter(r => selectedTrendIds.includes(r.equipmentId));
    const dates = Array.from(new Set(selectedReadings.map(r => r.date))).sort();
    
    return dates.map((date: string) => {
      const entry: Record<string, any> = { date: formatDisplayDate(date) }; 
      selectedTrendIds.forEach(id => {
        const r = readings.find(read => read.equipmentId === id && read.date === date);
        const eq = equipments.find(e => e.id === id);
        if (r && eq) {
          if (chartOptions.showTotal) entry[`${eq.name}_total`] = r.totalCurrent;
          if (chartOptions.showResistive) entry[`${eq.name}_resistive`] = r.resistiveCurrent;
          if (chartOptions.showCorrected) entry[`${eq.name}_corrected`] = r.correctedResistiveCurrent;
        }
      });
      return entry;
    });
  }, [readings, selectedTrendIds, equipments, chartOptions]);

  const statItems: { label: string; value: number; icon: React.ElementType; status: HealthStatus | 'At Risk' }[] = [
    { label: 'Satisfactory', value: stats.satisfactory, icon: CheckCircle2, status: 'Satisfactory' },
    { label: 'Poor', value: stats.poor, icon: AlertTriangle, status: 'Poor' },
    { label: 'Critical', value: stats.critical, icon: AlertCircle, status: 'Critical' },
    { label: 'At Risk', value: stats.atRisk, icon: ShieldAlert, status: 'At Risk' },
    { label: 'De-energized', value: stats.deEnergized, icon: PowerOff, status: 'De-energized' },
    { label: 'Grounding', value: stats.grounding, icon: Hammer, status: 'Correction of Grounding' },
    { label: 'Probe Fail', value: stats.probeFail, icon: Activity, status: 'Probe Failure' },
  ];

  return (
    <div className="space-y-6">
      {/* Rated kV Summary Cards */}
      <div className="flex overflow-x-auto gap-4 pb-2 no-scrollbar">
        {statsByRatedKV.map((v: { ratedKV: number; Satisfactory: number; Poor: number; Critical: number; AtRisk: number; total: number }) => {
          const satisfactoryPct = v.total > 0 ? (v.Satisfactory / v.total) * 100 : 0;
          const atRiskPct = v.total > 0 ? (v.AtRisk / v.total) * 100 : 0;
          return (
            <div key={v.ratedKV} className="flex-none w-56 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="font-extrabold text-slate-800">{v.ratedKV} kV</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Units: {v.total}</span>
              </div>
              <div className="flex gap-1 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div style={{width: `${satisfactoryPct}%`}} className="bg-emerald-500 h-full"></div>
                <div style={{width: `${atRiskPct}%`}} className="bg-orange-500 h-full"></div>
              </div>
              <div className="grid grid-cols-3 gap-1 border-t border-slate-50 pt-3 flex-1">
                <button 
                  onClick={() => { setTableRatedKVFilter(v.ratedKV); setTableStatusFilter('Poor'); }} 
                  className="text-center group transition-colors hover:bg-slate-50 rounded-lg p-1"
                >
                  <div className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-amber-500">Poor</div>
                  <div className="text-xs font-bold text-amber-600">{v.Poor}</div>
                </button>
                <button 
                  onClick={() => { setTableRatedKVFilter(v.ratedKV); setTableStatusFilter('Critical'); }} 
                  className="text-center group transition-colors hover:bg-slate-50 rounded-lg p-1"
                >
                  <div className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-rose-500">Critical</div>
                  <div className="text-xs font-bold text-rose-600">{v.Critical}</div>
                </button>
                <button 
                  onClick={() => { setTableRatedKVFilter(v.ratedKV); setTableStatusFilter('At Risk'); }} 
                  className="text-center group transition-colors hover:bg-slate-50 rounded-lg p-1"
                >
                  <div className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-orange-500">At Risk</div>
                  <div className="text-xs font-bold text-orange-600">{v.AtRisk}</div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global Status Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {statItems.map((stat) => (
          <button 
            key={stat.label}
            onClick={() => { setTableStatusFilter(stat.status); setTableRatedKVFilter('All'); }}
            className={`p-4 rounded-xl border transition-all text-left shadow-sm bg-white ${statusColors[stat.status]} ${tableStatusFilter === stat.status ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}
          >
            <div className="flex justify-between items-start mb-1">
              <stat.icon size={18} />
              <span className="text-xl font-extrabold">{stat.value}</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-tight opacity-80">{stat.label}</p>
          </button>
        ))}
      </div>
      
      {/* Active Alarms Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert size={14} className="text-rose-500" /> Active Alarms ({alarms.length})
          </h4>
        </div>
        <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar">
          {alarms.length > 0 ? alarms.map((a: DashboardItem) => (
            <div key={a.id} className="flex-none w-80 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow relative">
              <div className="flex justify-between items-start mb-2">
                <div className={`p-2 rounded-xl ${a.status === 'Critical' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                  <AlertCircle size={18} />
                </div>
                <div className="flex items-center gap-1">
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[a.status]}`}>
                     {a.status}
                   </span>
                </div>
              </div>
              <div className="mb-4">
                <button 
                  onClick={() => handleTrendLink(a.id)}
                  className="w-full text-left font-bold text-slate-800 text-sm truncate hover:text-blue-600 transition-colors flex items-center gap-2 group"
                  title="Click to view trend analysis"
                >
                  {a.name}
                  <TrendingUp size={14} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                </button>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{a.substation} • {a.district}</p>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-400 uppercase">Resistive Current</span>
                  <span className="text-rose-600 font-bold">{a.latest?.correctedResistiveCurrent || 0} uA</span>
                </div>
              </div>
              
              <div className="pt-3 border-t border-slate-100">
                <button 
                  onClick={() => setActiveResolutionId(activeResolutionId === a.id ? null : a.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-[10px] font-extrabold text-slate-600 transition-colors uppercase tracking-widest"
                >
                  <span className="flex items-center gap-2"><Settings2 size={12} /> Classify / Bypass</span>
                  <ChevronDown size={14} className={`transition-transform ${activeResolutionId === a.id ? 'rotate-180' : ''}`} />
                </button>
                
                {activeResolutionId === a.id && (
                  <div className="mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-1 shadow-inner">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5">Override Status / Action</label>
                    <select 
                      className="w-full p-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                      onChange={(e) => {
                          if (e.target.value) {
                             handleResolveAlarm(a.id, e.target.value as HealthStatus);
                          }
                      }}
                      defaultValue=""
                    >
                        <option value="" disabled>Select Classification...</option>
                        <option value="Satisfactory">Satisfactory (Bypass / False Alarm)</option>
                        <option value="Poor">Poor (Downgrade Critical)</option>
                        <option value="Correction of Grounding">Maintenance: Grounding Fix</option>
                        <option value="De-energized">Maintenance: De-energized</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )) : (
            <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-3 text-emerald-600 font-medium">
               <ShieldCheck size={20} />
               <span className="text-xs uppercase tracking-wider">All systems operational</span>
            </div>
          )}
        </div>
      </div>

      {/* Operational Health Overview Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-800">Operational Health Overview</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Search asset, substation, district..." 
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs w-48 outline-none focus:ring-2 focus:ring-blue-500"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
              />
            </div>
            <select 
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
              value={tableRatedKVFilter}
              onChange={e => setTableRatedKVFilter(e.target.value === 'All' ? 'All' : parseFloat(e.target.value))}
            >
              <option value="All">All Rated kV</option>
              {Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: number, b: number) => a - b).map(kv => (
                <option key={kv} value={kv}>{kv} kV</option>
              ))}
            </select>
            <select 
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
              value={tableStatusFilter}
              onChange={e => setTableStatusFilter(e.target.value as HealthStatus | 'All' | 'At Risk')} // Keep type assertion here as it's for enum-like string values
            >
              <option value="All">All Status</option>
              <option value="Satisfactory">Satisfactory</option>
              <option value="Poor">Poor</option>
              <option value="Critical">Critical</option>
              <option value="At Risk">At Risk</option>
              <option value="Probe Failure">Probe Failure</option>
              <option value="De-energized">De-energized</option>
              <option value="Correction of Grounding">Grounding Fix</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Current Status</th>
                <th className="px-6 py-4">Equipment Unit</th>
                <th className="px-6 py-4">Substation</th>
                <th className="px-6 py-4">Rated kV</th>
                <th className="px-6 py-4 text-center">Corrected uA</th>
                <th className="px-6 py-4 text-center">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${statusColors[item.status]}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleTrendLink(item.id)}
                      className="text-left group focus:outline-none"
                      title="Click to view trend analysis"
                    >
                      <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                        {item.name}
                        <TrendingUp size={14} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight group-hover:text-slate-500">{item.brand} • {item.model}</div>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-600 font-medium">{item.substation}</div>
                    <div className="text-[10px] text-blue-600 font-bold uppercase">{item.district}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="font-bold text-slate-700">{item.ratedVoltage} kV</div>
                  </td>
                  <td className="px-4 py-4 text-center font-mono font-bold text-blue-600">
                    {item.latest?.correctedResistiveCurrent || '--'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => setShowHistoryFor(item.id)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-100 rounded-lg transition-colors"><History size={16} /></button>
                  </td>
                </tr>
              ))}
              {tableItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 italic">No assets match the current filter criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-400">
           <span>Displaying top {tableItems.length} matching assets</span>
           <button onClick={() => { setTableSearch(''); setTableStatusFilter('All'); setTableRatedKVFilter('All'); }} className="text-blue-600 hover:underline transition-colors font-bold uppercase">Reset Filters</button>
        </div>
      </div>

      {/* History Modal */}
      {showHistoryFor && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">History: {dashboardData.find(e => e.id === showHistoryFor)?.name}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase">{dashboardData.find(e => e.id === showHistoryFor)?.substation}</p>
              </div>
              <button onClick={() => setShowHistoryFor(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400 font-bold uppercase text-[10px] border-b">
                  <tr>
                    <th className="py-3">Date</th>
                    <th className="py-3 text-center">Total (uA)</th>
                    <th className="py-3 text-center">Resistive (uA)</th>
                    <th className="py-3 text-center font-bold text-blue-600">Corrected (uA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {readings
                    .filter(r => r.equipmentId === showHistoryFor)
                    .sort((a: Reading, b: Reading) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-3 font-medium text-slate-600">{formatDisplayDate(r.date)}</td>
                        <td className="py-3 text-center font-mono">{r.totalCurrent}</td>
                        <td className="py-3 text-center font-mono">{r.resistiveCurrent}</td>
                        <td className="py-3 text-center font-mono font-bold text-blue-600">{r.correctedResistiveCurrent}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
