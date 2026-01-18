
import React, { useState, useMemo } from 'react';
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
import { calculateHealthStatus, isAtRisk } from '../utils/health';

interface DashboardProps {
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  settings: ThresholdSettings;
  searchTerm: string;
  isAdmin: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ equipments, setEquipments, readings, setReadings, settings, searchTerm, isAdmin }) => {
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

  const getLatestReading = (eqId: string) => {
    return readings.filter(r => r.equipmentId === eqId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const dashboardData = useMemo(() => {
    return equipments.map(eq => {
      const latest = getLatestReading(eq.id);
      const status = calculateHealthStatus(eq, latest, settings);
      return { ...eq, latest, status };
    });
  }, [equipments, readings, settings]);

  const statsByRatedKV = useMemo(() => {
    const uniqueRatings = Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: any, b: any) => a - b);
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
    return {
      total: dashboardData.length,
      satisfactory: dashboardData.filter(d => d.status === 'Satisfactory').length,
      poor: dashboardData.filter(d => d.status === 'Poor').length,
      critical: dashboardData.filter(d => d.status === 'Critical').length,
      probeFail: dashboardData.filter(d => d.status === 'Probe Failure').length,
      grounding: dashboardData.filter(d => d.status === 'Correction of Grounding').length,
      deEnergized: dashboardData.filter(d => d.status === 'De-energized').length,
      atRisk: dashboardData.filter(d => isAtRisk(d.status)).length,
    };
  }, [dashboardData]);

  const alarms = useMemo(() => {
    return dashboardData.filter(d => isAtRisk(d.status));
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
          matchesStatus = isAtRisk(item.status);
        } else if (tableStatusFilter !== 'All') {
          matchesStatus = item.status === tableStatusFilter;
        }

        const matchesKV = tableRatedKVFilter === 'All' || item.ratedVoltage === tableRatedKVFilter;
        return matchesSearch && matchesStatus && matchesKV;
      })
      .slice(0, 10);
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
    document.getElementById('trend-analysis-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  const handleResolveAlarm = (eqId: string, resolution: HealthStatus) => {
    if (!isAdmin) return alert("Admin access required.");
    setEquipments(prev => prev.map(e => e.id === eqId ? { ...e, statusOverride: resolution } : e));
    const eq = equipments.find(e => e.id === eqId);
    const latest = getLatestReading(eqId);
    if (eq) {
        const newReading: Reading = {
            id: `action-${Date.now()}`,
            equipmentId: eq.id,
            date: new Date().toISOString().split('T')[0],
            totalCurrent: resolution === 'De-energized' ? 0 : (latest?.totalCurrent || 0),
            resistiveCurrent: resolution === 'De-energized' ? 0 : (latest?.resistiveCurrent || 0),
            correctedResistiveCurrent: resolution === 'De-energized' ? 0 : (latest?.correctedResistiveCurrent || 0),
            mcovRating: eq.mcovRating,
            ratedVoltage: eq.ratedVoltage,
            notes: `Action Taken: Classified as ${resolution}`
        };
        setReadings(prev => [newReading, ...prev]);
    }
    setActiveResolutionId(null);
  };

  const chartData = useMemo(() => {
    if (selectedTrendIds.length === 0) return [];
    const selectedReadings = readings.filter(r => selectedTrendIds.includes(r.equipmentId));
    const dates = Array.from(new Set(selectedReadings.map(r => r.date))).sort() as string[];
    return dates.map(date => {
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
      <div className="flex overflow-x-auto gap-4 pb-2 no-scrollbar">
        {statsByRatedKV.map(v => (
          <div key={v.ratedKV} className="flex-none w-56 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <span className="font-extrabold text-slate-800">{v.ratedKV} kV</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Units: {v.total}</span>
            </div>
            <div className="flex gap-1 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div style={{width: `${Number(v.total) > 0 ? (Number(v.Satisfactory)/Number(v.total))*100 : 0}%`}} className="bg-emerald-500 h-full"></div>
              <div style={{width: `${Number(v.total) > 0 ? (Number(v.AtRisk)/Number(v.total))*100 : 0}%`}} className="bg-orange-500 h-full"></div>
            </div>
            <div className="grid grid-cols-3 gap-1 border-t border-slate-50 pt-3 flex-1">
              <button onClick={() => { setTableRatedKVFilter(v.ratedKV); setTableStatusFilter('Poor'); }} className="text-center group transition-colors hover:bg-slate-50 rounded-lg p-1">
                <div className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-amber-500">Poor</div>
                <div className="text-xs font-bold text-amber-600">{v.Poor}</div>
              </button>
              <button onClick={() => { setTableRatedKVFilter(v.ratedKV); setTableStatusFilter('Critical'); }} className="text-center group transition-colors hover:bg-slate-50 rounded-lg p-1">
                <div className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-rose-500">Critical</div>
                <div className="text-xs font-bold text-rose-600">{v.Critical}</div>
              </button>
              <button onClick={() => { setTableRatedKVFilter(v.ratedKV); setTableStatusFilter('At Risk'); }} className="text-center group transition-colors hover:bg-slate-50 rounded-lg p-1">
                <div className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-orange-500">At Risk</div>
                <div className="text-xs font-bold text-orange-600">{v.AtRisk}</div>
              </button>
            </div>
          </div>
        ))}
      </div>

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
      
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert size={14} className="text-rose-500" /> Active Alarms ({alarms.length})
          </h4>
        </div>
        <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar">
          {alarms.length > 0 ? alarms.map(a => (
            <div key={a.id} className="flex-none w-80 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow relative">
              <div className="flex justify-between items-start mb-2">
                <div className={`p-2 rounded-xl ${a.status === 'Critical' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                  <AlertCircle size={18} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[a.status]}`}>
                  {a.status}
                </span>
              </div>
              <div className="mb-4">
                <button onClick={() => handleTrendLink(a.id)} className="w-full text-left font-bold text-slate-800 text-sm truncate hover:text-blue-600 transition-colors flex items-center gap-2 group">
                  {a.name} <TrendingUp size={14} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                </button>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{a.substation} • {a.district}</p>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-400 uppercase">Resistive Current</span>
                  <span className="text-rose-600 font-bold">{a.latest?.correctedResistiveCurrent || 0} uA</span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <button onClick={() => setActiveResolutionId(activeResolutionId === a.id ? null : a.id)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-[10px] font-extrabold text-slate-600 transition-colors uppercase tracking-widest">
                  <span className="flex items-center gap-2"><Settings2 size={12} /> Classify / Bypass</span>
                  <ChevronDown size={14} className={`transition-transform ${activeResolutionId === a.id ? 'rotate-180' : ''}`} />
                </button>
                {activeResolutionId === a.id && (
                  <div className="mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-1 shadow-inner">
                    <select className="w-full p-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" onChange={(e) => e.target.value && handleResolveAlarm(a.id, e.target.value as HealthStatus)} defaultValue="">
                        <option value="" disabled>Select Classification...</option>
                        <option value="Satisfactory">Satisfactory (Bypass)</option>
                        <option value="Correction of Grounding">Grounding Fix Required</option>
                        <option value="De-energized">Unit De-energized</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )) : (
            <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-3 text-emerald-600 font-medium">
               <ShieldCheck size={20} /> <span className="text-xs uppercase tracking-wider">All systems operational</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-800">Operational Health Overview</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs w-48 outline-none focus:ring-2 focus:ring-blue-500" value={tableSearch} onChange={e => setTableSearch(e.target.value)} />
            </div>
            <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" value={tableRatedKVFilter} onChange={e => setTableRatedKVFilter(e.target.value === 'All' ? 'All' : parseFloat(e.target.value))}>
              <option value="All">All Rated kV</option>
              {Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: any, b: any) => a - b).map(kv => <option key={kv} value={kv}>{kv} kV</option>)}
            </select>
            <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none" value={tableStatusFilter} onChange={e => setTableStatusFilter(e.target.value as any)}>
              <option value="All">All Status</option>
              <option value="Satisfactory">Satisfactory</option>
              <option value="Poor">Poor</option>
              <option value="Critical">Critical</option>
              <option value="At Risk">At Risk</option>
              <option value="Probe Failure">Probe Failure</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Status</th>
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
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold border ${statusColors[item.status]}`}>{item.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleTrendLink(item.id)} className="text-left group focus:outline-none">
                      <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors flex items-center gap-2">{item.name} <TrendingUp size={14} className="opacity-0 group-hover:opacity-100 text-blue-500" /></div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{item.brand} • {item.model}</div>
                    </button>
                  </td>
                  <td className="px-6 py-4"><div className="text-slate-600 font-medium">{item.substation}</div><div className="text-[10px] text-blue-600 font-bold uppercase">{item.district}</div></td>
                  <td className="px-6 py-4 text-center"><div className="font-bold text-slate-700">{item.ratedVoltage} kV</div></td>
                  <td className="px-4 py-4 text-center font-mono font-bold text-blue-600">{item.latest?.correctedResistiveCurrent || '--'}</td>
                  <td className="px-6 py-4 text-center"><button onClick={() => setShowHistoryFor(item.id)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-100 rounded-lg transition-colors"><History size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div id="trend-analysis-section" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={18} className="text-blue-500" /> Trend Analysis</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search..." className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none" value={trendSearch} onChange={e => setTrendSearch(e.target.value)} />
          </div>
          <div className="flex-1 max-h-48 overflow-y-auto no-scrollbar border border-slate-100 rounded-xl p-2 bg-slate-50/50">
            {equipments.filter(e => e.name.toLowerCase().includes(trendSearch.toLowerCase())).map(eq => (
              <button key={eq.id} onClick={() => toggleTrendSelection(eq.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex justify-between items-center ${selectedTrendIds.includes(eq.id) ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-white text-slate-600'}`}>
                <span className="truncate">{eq.name}</span> {selectedTrendIds.includes(eq.id) && <Check size={12} />}
              </button>
            ))}
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-50">
             <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer"><input type="checkbox" checked={chartOptions.showTotal} onChange={e => setChartOptions({...chartOptions, showTotal: e.target.checked})} className="rounded text-blue-600" /> Total Leakage (uA)</label>
             <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer"><input type="checkbox" checked={chartOptions.showResistive} onChange={e => setChartOptions({...chartOptions, showResistive: e.target.checked})} className="rounded text-blue-600" /> Resistive Base (uA)</label>
             <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer"><input type="checkbox" checked={chartOptions.showCorrected} onChange={e => setChartOptions({...chartOptions, showCorrected: e.target.checked})} className="rounded text-blue-600" /> Corrected Resistive (uA)</label>
          </div>
        </div>
        <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px]">
          {selectedTrendIds.length > 0 ? (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" fontSize={10} tick={{fill: '#64748b'}} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tick={{fill: '#64748b'}} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }} />
                  {selectedTrendIds.map((id, index) => {
                    const eq = equipments.find(e => e.id === id);
                    if (!eq) return null;
                    const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];
                    const color = colors[index % colors.length];
                    return (
                      <React.Fragment key={id}>
                        {chartOptions.showTotal && <Line type="monotone" dataKey={`${eq.name}_total`} name={`${eq.name} (Tot)`} stroke={color} strokeDasharray="5 5" strokeWidth={1} dot={{r: 2}} />}
                        {chartOptions.showResistive && <Line type="monotone" dataKey={`${eq.name}_resistive`} name={`${eq.name} (Res)`} stroke={color} strokeWidth={1} dot={{r: 2}} />}
                        {chartOptions.showCorrected && <Line type="monotone" dataKey={`${eq.name}_corrected`} name={`${eq.name} (Corr)`} stroke={color} strokeWidth={3} dot={{r: 4, strokeWidth: 2, fill: 'white'}} />}
                      </React.Fragment>
                    );
                  })}
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-24 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
              <TrendingUp size={64} className="opacity-10 mb-4" /><p className="font-bold text-xs uppercase tracking-widest text-slate-400">Select units to visualize trends</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
