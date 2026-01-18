import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Zap, 
  X, 
  LayoutGrid, 
  List, 
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Save,
  Check,
  Calendar,
  Activity
} from 'lucide-react';
import { Equipment, Reading, HealthStatus } from '../types';
import { formatDisplayDate } from '../utils/reports';

interface EquipmentManagerProps {
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  isAdmin: boolean;
}

const EquipmentManager: React.FC<EquipmentManagerProps> = ({ equipments, setEquipments, readings, setReadings, isAdmin }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentEquipment, setCurrentEquipment] = useState<Partial<Equipment>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [ratedVoltageFilter, setRatedVoltageFilter] = useState<number | 'All'>('All');

  // Declare state for adding new readings
  const [isAddingReading, setIsAddingReading] = useState<string | null>(null);
  const [newReadingData, setNewReadingData] = useState({ 
    date: new Date().toISOString().split('T')[0], 
    total: '', 
    resistive: '', 
    corrected: '' 
  });

  // Declare state for editing existing readings
  const [editingReadingId, setEditingReadingId] = useState<string | null>(null);
  // Fix: Corrected state variable name from `tempData` to `tempReadingData`
  const [tempReadingData, setTempReadingData] = useState<Partial<Reading>>({});


  const ratedVoltageOptions = useMemo(() => {
    const uniqueVoltages = Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a, b) => a - b);
    return ['All', ...uniqueVoltages.map(String)]; // Convert to string for select value
  }, [equipments]);

  // Effect to sync ratedVoltage with voltageLevel when currentEquipment changes
  useEffect(() => {
    if (currentEquipment.ratedVoltage !== undefined) {
      const standardVoltages: Record<number, string> = { // Fix: Added explicit type annotation
        13.8: '13.8kV',
        69: '69kV',
        115: '115kV',
        230: '230kV',
        500: '500kV',
      };
      const matchingVoltageLevel = standardVoltages[currentEquipment.ratedVoltage];
      if (matchingVoltageLevel && currentEquipment.voltageLevel !== matchingVoltageLevel) {
        setCurrentEquipment(prev => ({ ...prev, voltageLevel: matchingVoltageLevel }));
      }
    }
  }, [currentEquipment.ratedVoltage]);

  // Effect to sync voltageLevel with ratedVoltage when currentEquipment changes
  useEffect(() => {
    if (currentEquipment.voltageLevel) {
      const ratedValue = parseFloat(currentEquipment.voltageLevel.replace('kV', ''));
      if (!isNaN(ratedValue) && currentEquipment.ratedVoltage !== ratedValue) {
        setCurrentEquipment(prev => ({ ...prev, ratedVoltage: ratedValue }));
      }
    }
  }, [currentEquipment.voltageLevel]);

  const getStatus = (eq: Equipment, latest?: Reading): HealthStatus => {
    if (eq.statusOverride) return eq.statusOverride as HealthStatus;
    if (!latest) return 'Satisfactory'; // Default for equipment with no readings
    // Fix: Explicitly ensure val is treated as a number for arithmetic comparisons.
    // The `correctedResistiveCurrent` is typed as number, but parsing issues can occur from local storage.
    const val = Number(latest.correctedResistiveCurrent); 
    if (val === 0) return 'Probe Failure'; // Assuming 0 implies failure
    if (val > 500) return 'Critical';
    if (val > 300) return 'Poor';
    return 'Satisfactory';
  };

  // Fix: Added explicit type for statusColors
  const statusColors: Record<HealthStatus | string, string> = {
    Satisfactory: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    Poor: 'text-amber-600 bg-amber-50 border-amber-100',
    Critical: 'text-rose-600 bg-rose-50 border-rose-100',
    'Probe Failure': 'text-slate-600 bg-slate-100 border-slate-200',
    'Correction of Grounding': 'text-blue-600 bg-blue-50 border-blue-100',
    'De-energized': 'text-purple-600 bg-purple-50 border-purple-100',
    'All': 'text-slate-600 bg-slate-50 border-slate-200'
  };


  const filteredEquipmentsList = useMemo(() => {
    return equipments.filter(eq => {
      const matchSearch = eq.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          eq.substation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          eq.district.toLowerCase().includes(searchTerm.toLowerCase());
      
      const latest = readings.filter(r => r.equipmentId === eq.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const status = getStatus(eq, latest); // Use consistent getStatus function
      const matchStatus = statusFilter === 'All' || status === statusFilter;
      const matchRatedVoltage = ratedVoltageFilter === 'All' || eq.ratedVoltage === ratedVoltageFilter;

      return matchSearch && matchStatus && matchRatedVoltage;
    })
    .map(eq => { // Add status to equipment object for easier rendering
      const latest = readings.filter(r => r.equipmentId === eq.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return {
        ...eq,
        calculatedStatus: getStatus(eq, latest),
        latestReading: latest
      };
    });
  }, [equipments, searchTerm, statusFilter, ratedVoltageFilter, readings]);

  const handleSaveEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert("Admin login required.");
    
    if (currentEquipment.id) {
      setEquipments(prev => prev.map(e => e.id === currentEquipment.id ? (currentEquipment as Equipment) : e));
      // Auto-sync related readings when equipment is updated
      setReadings(prevReadings => prevReadings.map(r => {
        if (r.equipmentId === currentEquipment.id) {
          return {
            ...r,
            // Fix: Add non-null assertion as ratedVoltage and mcovRating are required fields in Equipment
            ratedVoltage: currentEquipment.ratedVoltage!, 
            mcovRating: currentEquipment.mcovRating!,   
          };
        }
        return r;
      }));
    } else {
      // Fix: Add explicit type annotation for newEq
      const newEq: Equipment = { 
        ...currentEquipment as Equipment, // Fix: Added 'as Equipment' assertion
        id: `eq-${Date.now()}`,
        brand: currentEquipment.brand || '', // Ensure default value if not provided
        model: currentEquipment.model || '', // Ensure default value if not provided
        mcovRating: currentEquipment.mcovRating || 0, // Ensure default value if not provided
        statusOverride: null, // Always start new equipment with no override
      };
      setEquipments(prev => [...prev, newEq]); // Removed 'as Equipment' assertion for newEq
    }
    setIsEditing(false);
    setCurrentEquipment({});
  };

  const handleDeleteEquipment = (id: string) => {
    if (!isAdmin) return alert("Admin access required.");
    if (confirm("Delete this unit and ALL its child historical data? This action cannot be undone.")) {
      setEquipments(prev => prev.filter(e => e.id !== id));
      setReadings(prev => prev.filter(r => r.equipmentId !== id));
    }
  };

  // Reading CRUD
  const handleAddReading = (eq: Equipment) => {
    if (!newReadingData.total || !newReadingData.resistive || !newReadingData.corrected) {
      return alert("Please fill all measurement fields.");
    }

    const reading: Reading = {
      id: `rd-${Date.now()}`,
      equipmentId: eq.id,
      date: newReadingData.date,
      totalCurrent: parseFloat(newReadingData.total),
      resistiveCurrent: parseFloat(newReadingData.resistive),
      correctedResistiveCurrent: parseFloat(newReadingData.corrected),
      mcovRating: eq.mcovRating,
      ratedVoltage: eq.ratedVoltage
    };

    setReadings(prev => [reading, ...prev]);
    setIsAddingReading(null);
    setNewReadingData({ date: new Date().toISOString().split('T')[0], total: '', resistive: '', corrected: '' });
  };

  const handleEditReading = (reading: Reading) => {
    setEditingReadingId(reading.id);
    // Fix: Use correct state variable name
    setTempReadingData({ ...reading });
  };

  const saveReadingEdit = () => {
    // Fix: Use correct state variable name
    setReadings(prev => prev.map(r => r.id === editingReadingId ? { ...r, ...tempReadingData } as Reading : r));
    setEditingReadingId(null);
  };

  const handleDeleteReading = (id: string) => {
    if (!isAdmin) return alert("Admin access required.");
    if (confirm("Permanently remove this historical entry?")) {
      setReadings(prev => prev.filter(r => r.id !== id));
    }
  };

  // Function to synchronize mcovRating and ratedVoltage for all readings
  const handleSyncReadingsMetadata = () => {
    const updatedReadings = readings.map(reading => {
      const parentEquipment = equipments.find(eq => eq.id === reading.equipmentId);
      if (parentEquipment) {
        return {
          ...reading,
          ratedVoltage: parentEquipment.ratedVoltage,
          mcovRating: parentEquipment.mcovRating,
        };
      }
      return reading;
    });

    setReadings(updatedReadings);
  };

  // Perform an initial sync when the component mounts
  useEffect(() => {
    if (equipments.length > 0 && readings.length > 0) {
      handleSyncReadingsMetadata(); 
    }
  }, [equipments.length, readings.length]);


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Equipment Inventory</h2>
          <p className="text-slate-500 text-sm">Consolidated parent-child asset management</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button 
                onClick={() => { setCurrentEquipment({ 
                  statusOverride: null, 
                  voltageLevel: '230kV', 
                  ratedVoltage: 230,
                  brand: '',
                  model: '',
                  mcovRating: 0
                }); setIsEditing(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                <Plus size={18} /> New Asset Unit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search by name, station, or district..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-slate-400" />
          <select 
            className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Satisfactory">Satisfactory</option>
            <option value="Poor">Poor</option>
            <option value="Critical">Critical</option>
            <option value="De-energized">De-energized</option>
            <option value="Correction of Grounding">Grounding Fix</option>
            <option value="Probe Failure">Probe Failure</option>
          </select>
          <select 
            className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none"
            value={ratedVoltageFilter}
            onChange={e => setRatedVoltageFilter(e.target.value === 'All' ? 'All' : parseFloat(e.target.value))}
          >
            {ratedVoltageOptions.map(v => <option key={v} value={v}>{v} kV</option>)}
          </select>
          <div className="bg-slate-100 p-1 rounded-xl flex">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}><List size={18} /></button>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">{currentEquipment.id ? 'Modify Record' : 'Create New Asset'}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Equipment Metadata Entry</p>
              </div>
              <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEquipment} className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Equipment Unit Name</label>
                  <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={currentEquipment.name || ''} onChange={e => setCurrentEquipment({...currentEquipment, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Substation</label>
                  <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={currentEquipment.substation || ''} onChange={e => setCurrentEquipment({...currentEquipment, substation: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">District</label>
                  <input required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={currentEquipment.district || ''} onChange={e => setCurrentEquipment({...currentEquipment, district: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Voltage Class</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" 
                    value={currentEquipment.voltageLevel || ''} 
                    onChange={e => setCurrentEquipment({...currentEquipment, voltageLevel: e.target.value})}
                  >
                    <option value="13.8kV">13.8kV</option>
                    <option value="69kV">69kV</option>
                    <option value="115kV">115kV</option>
                    <option value="230kV">230kV</option>
                    <option value="500kV">500kV</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Rated Voltage (kV)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    required 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                    value={currentEquipment.ratedVoltage || ''} 
                    onChange={e => setCurrentEquipment({...currentEquipment, ratedVoltage: parseFloat(e.target.value)})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Brand</label>
                  <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={currentEquipment.brand || ''} onChange={e => setCurrentEquipment({...currentEquipment, brand: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Model</label>
                  <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={currentEquipment.model || ''} onChange={e => setCurrentEquipment({...currentEquipment, model: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">MCOV Rating</label>
                  <input type="number" step="0.01" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none" value={currentEquipment.mcovRating || ''} onChange={e => setCurrentEquipment({...currentEquipment, mcovRating: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest">Commit Asset</button>
                <button type="button" onClick={() => setIsEditing(false)} className="px-10 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold uppercase tracking-widest">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}`}>
        {filteredEquipmentsList.map(eq => {
          const isExpanded = expandedId === eq.id;
          const allEqReadings = readings.filter(r => r.equipmentId === eq.id);
          const filteredEqReadings = allEqReadings
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
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
                    onClick={() => {
                      setExpandedId(isExpanded ? null : eq.id);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isExpanded ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {isExpanded ? 'Hide History' : `History (${allEqReadings.length})`}
                  </button>
                  {isAdmin && (
                    <div className="flex gap-1 border-l border-slate-100 pl-2">
                      <button onClick={() => { setCurrentEquipment(eq); setIsEditing(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => handleDeleteEquipment(eq.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* CHILD VIEW: Historical measurements and data entry */}
              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100 p-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <History size={14} className="text-blue-500" /> Measurement Archive & Child Records
                    </h5>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsAddingReading(isAddingReading === eq.id ? null : eq.id)}
                        className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition-colors uppercase tracking-tight flex items-center gap-1.5"
                      >
                        {isAddingReading === eq.id ? <X size={12} /> : <Plus size={12} />}
                        {isAddingReading === eq.id ? 'Cancel entry' : 'New Measurement'}
                      </button>
                    </div>
                  </div>

                  {/* Inline New Measurement Form */}
                  {isAddingReading === eq.id && (
                    <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-600/20 animate-in zoom-in-95">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                        <div className="col-span-1">
                          <label className="block text-[10px] font-bold text-blue-100 uppercase mb-1">Date</label>
                          <input type="date" className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:bg-white/20" value={newReadingData.date} onChange={e => setNewReadingData({...newReadingData, date: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-blue-100 uppercase mb-1">Total (uA)</label>
                          <input type="number" step="0.1" className="w-full bg-white text-blue-900 rounded-xl px-3 py-2 text-xs font-bold outline-none" placeholder="0.0" value={newReadingData.total} onChange={e => setNewReadingData({...newReadingData, total: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-blue-100 uppercase mb-1">Resistive (uA)</label>
                          <input type="number" step="0.1" className="w-full bg-white text-blue-900 rounded-xl px-3 py-2 text-xs font-bold outline-none" placeholder="0.0" value={newReadingData.resistive} onChange={e => setNewReadingData({...newReadingData, resistive: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-blue-100 uppercase mb-1">Corrected (uA)</label>
                          <input type="number" step="0.1" className="w-full bg-white text-emerald-600 rounded-xl px-3 py-2 text-xs font-bold outline-none" placeholder="0.0" value={newReadingData.corrected} onChange={e => setNewReadingData({...newReadingData, corrected: e.target.value})} />
                        </div>
                        <div className="md:col-start-4">
                          <button onClick={() => handleAddReading(eq)} className="w-full bg-white text-blue-600 font-extrabold py-2 rounded-xl text-xs hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                            <Save size={14} /> Commit Entry
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

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
                          <th className="px-3 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredEqReadings.map(r => {
                          const isEditingReading = editingReadingId === r.id;
                          return (
                            <tr key={r.id} className={`${isEditingReading ? 'bg-blue-50' : 'hover:bg-slate-50/50'} transition-colors`}>
                              <td className="px-3 py-3">
                                {isEditingReading ? (
                                  // Fix: Use correct state variable name
                                  <input type="date" className="bg-white border rounded px-1 text-[10px]" value={tempReadingData.date || ''} onChange={e => setTempReadingData({...tempReadingData, date: e.target.value})} />
                                ) : formatDisplayDate(r.date)}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  // Fix: Use correct state variable name
                                  <input type="number" step="0.01" className="w-12 text-center bg-white border rounded" value={tempReadingData.ratedVoltage || ''} onChange={e => setTempReadingData({...tempReadingData, ratedVoltage: parseFloat(e.target.value)})} />
                                ) : `${r.ratedVoltage}`}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  // Fix: Use correct state variable name
                                  <input type="number" step="0.01" className="w-12 text-center bg-white border rounded" value={tempReadingData.mcovRating || ''} onChange={e => setTempReadingData({...tempReadingData, mcovRating: parseFloat(e.target.value)})} />
                                ) : `${r.mcovRating}`}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  // Fix: Use correct state variable name
                                  <input type="number" className="w-16 text-center bg-white border rounded" value={tempReadingData.totalCurrent || ''} onChange={e => setTempReadingData({...tempReadingData, totalCurrent: parseFloat(e.target.value)})} />
                                ) : r.totalCurrent}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  // Fix: Use correct state variable name
                                  <input type="number" className="w-16 text-center bg-white border rounded" value={tempReadingData.resistiveCurrent || ''} onChange={e => setTempReadingData({...tempReadingData, resistiveCurrent: parseFloat(e.target.value)})} />
                                ) : r.resistiveCurrent}
                              </td>
                              <td className="px-2 py-3 text-center font-mono font-bold text-blue-600">
                                {isEditingReading ? (
                                  // Fix: Use correct state variable name
                                  <input type="number" className="w-16 text-center bg-white border rounded font-bold text-blue-600" value={tempReadingData.correctedResistiveCurrent || ''} onChange={e => setTempReadingData({...tempReadingData, correctedResistiveCurrent: parseFloat(e.target.value)})} />
                                ) : r.correctedResistiveCurrent}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {isEditingReading ? (
                                  <div className="flex justify-end gap-1">
                                    <button onClick={saveReadingEdit} className="p-1 bg-emerald-500 text-white rounded hover:bg-emerald-600"><Check size={12} /></button>
                                    <button onClick={() => setEditingReadingId(null)} className="p-1 bg-slate-300 text-white rounded hover:bg-slate-400"><X size={12} /></button>
                                  </div>
                                ) : (
                                  <div className="flex justify-end gap-1">
                                    <button onClick={() => handleEditReading(r)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded transition-colors"><Edit2 size={12} /></button>
                                    <button onClick={() => handleDeleteReading(r.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition-colors"><Trash2 size={12} /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredEqReadings.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-slate-400 italic">No measurement history found for this child asset.</td>
                          </tr>
                        )}
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

export default EquipmentManager;