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
  Activity,
  QrCode,
  Printer,
  Eye
} from 'lucide-react';
import { Equipment, Reading, HealthStatus, ThresholdSettings } from '../types';
import { formatDisplayDate } from '../utils/reports';
import { supabase } from '../services/supabaseClient';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

interface EquipmentManagerProps {
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  readings: Reading[];
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  isAdmin: boolean;
  initialEditId?: string | null;
  currentUser?: any;
  settings: ThresholdSettings;
}

const EquipmentManager: React.FC<EquipmentManagerProps> = ({ equipments, setEquipments, readings, setReadings, isAdmin, initialEditId, settings }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentEquipment, setCurrentEquipment] = useState<Partial<Equipment>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [expandedId, setExpandedId] = useState<string | null>(initialEditId || null);
  
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

  const [editingReadingId, setEditingReadingId] = useState<string | null>(null);
  const [tempReadingData, setTempReadingData] = useState<Partial<Reading>>({});

  // QR Printing State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<{id: string, url: string, name: string, sub: string}[]>([]);


  const ratedVoltageOptions = useMemo(() => {
    const uniqueVoltages = Array.from(new Set(equipments.map(e => e.ratedVoltage))).sort((a: number, b: number) => a - b);
    return ['All', ...uniqueVoltages.map(String)]; 
  }, [equipments]);

  useEffect(() => {
    if (initialEditId) {
       const eq = equipments.find(e => e.id === initialEditId);
       if (eq) {
         setExpandedId(initialEditId);
         // If user has write access, automatically open the edit modal for the scanned item
         if (isAdmin) {
            setCurrentEquipment(eq);
            setIsEditing(true);
         }
       }
    }
  }, [initialEditId, equipments, isAdmin]);

  useEffect(() => {
    if (currentEquipment.ratedVoltage !== undefined) {
      const standardVoltages: Record<number, string> = { 
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
    if (!latest) return 'Satisfactory'; 
    const val = Number(latest.correctedResistiveCurrent); 
    if (val <= 0) return 'Probe Failure'; 
    if (val > settings.criticalLimit) return 'Critical';
    if (val > settings.poorLimit) return 'Poor';
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

  const filteredEquipmentsList = useMemo(() => {
    return equipments.filter(eq => {
      const matchSearch = eq.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          eq.substation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          eq.district.toLowerCase().includes(searchTerm.toLowerCase());
      
      const latest = readings.filter(r => r.equipmentId === eq.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const status = getStatus(eq, latest); 
      const matchStatus = statusFilter === 'All' || status === statusFilter;
      const matchRatedVoltage = ratedVoltageFilter === 'All' || eq.ratedVoltage === ratedVoltageFilter;

      return matchSearch && matchStatus && matchRatedVoltage;
    })
    .map(eq => { 
      const latest = readings.filter(r => r.equipmentId === eq.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      return {
        ...eq,
        calculatedStatus: getStatus(eq, latest),
        latestReading: latest
      };
    });
  }, [equipments, searchTerm, statusFilter, ratedVoltageFilter, readings, settings]);

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return alert("Admin login required.");
    
    const newEq = {
        ...currentEquipment,
        id: currentEquipment.id || `eq-${Date.now()}`,
        brand: currentEquipment.brand || '',
        model: currentEquipment.model || '',
        mcovRating: currentEquipment.mcovRating || 0,
        statusOverride: currentEquipment.statusOverride || null,
    } as Equipment;

    // Supabase Upsert
    const { error } = await supabase.from('equipment').upsert(newEq);

    if (error) {
        alert("Error saving equipment: " + error.message);
        return;
    }

    if (currentEquipment.id) {
      setEquipments(prev => prev.map(e => e.id === currentEquipment.id ? newEq : e));
      // Auto-sync local state for related readings (DB trigger handles this usually, but good for UI consistency)
      setReadings(prevReadings => prevReadings.map(r => {
        if (r.equipmentId === currentEquipment.id) {
          return {
            ...r,
            ratedVoltage: newEq.ratedVoltage, 
            mcovRating: newEq.mcovRating,   
          };
        }
        return r;
      }));
    } else {
      setEquipments(prev => [...prev, newEq]); 
    }
    setIsEditing(false);
    setCurrentEquipment({});
  };

  const handleDeleteEquipment = async (id: string) => {
    if (!isAdmin) return alert("Admin access required.");
    if (confirm("Delete this unit and ALL its child historical data? This action cannot be undone.")) {
      const { error } = await supabase.from('equipment').delete().eq('id', id);
      
      if (error) {
          alert("Error deleting equipment: " + error.message);
          return;
      }
      
      setEquipments(prev => prev.filter(e => e.id !== id));
      setReadings(prev => prev.filter(r => r.equipmentId !== id));
    }
  };

  // Reading CRUD
  const handleAddReading = async (eq: Equipment) => {
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

    const { error } = await supabase.from('readings').insert(reading);
    if (error) {
        alert("Error adding reading: " + error.message);
        return;
    }

    setReadings(prev => [reading, ...prev]);
    setIsAddingReading(null);
    setNewReadingData({ date: new Date().toISOString().split('T')[0], total: '', resistive: '', corrected: '' });
  };

  const handleEditReading = (reading: Reading) => {
    setEditingReadingId(reading.id);
    setTempReadingData({ ...reading });
  };

  const saveReadingEdit = async () => {
    const updatedReading = { ...tempReadingData, id: editingReadingId } as Reading;
    const { error } = await supabase.from('readings').upsert(updatedReading);
    
    if (error) {
        alert("Error updating reading: " + error.message);
        return;
    }

    setReadings(prev => prev.map(r => r.id === editingReadingId ? updatedReading : r));
    setEditingReadingId(null);
  };

  const handleDeleteReading = async (id: string) => {
    if (!isAdmin) return alert("Admin access required.");
    if (confirm("Permanently remove this historical entry?")) {
      const { error } = await supabase.from('readings').delete().eq('id', id);
      if (error) {
          alert("Error deleting reading: " + error.message);
          return;
      }
      setReadings(prev => prev.filter(r => r.id !== id));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const generatePreview = async () => {
    const idsToProcess = selectedIds.size > 0 ? Array.from(selectedIds) : filteredEquipmentsList.map(e => e.id);
    const itemsToProcess = equipments.filter(e => idsToProcess.includes(e.id));
    
    if (itemsToProcess.length === 0) return alert("No equipment selected.");

    const previews = await Promise.all(itemsToProcess.map(async (eq) => {
        const url = await QRCode.toDataURL(eq.id, { margin: 1, width: 200 });
        return { id: eq.id, url, name: eq.name, sub: eq.substation };
    }));
    
    setPreviewImages(previews);
    setShowPrintPreview(true);
  };

  const handlePrintQRs = async () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      
      // Configuration for 4x5 grid (20 items per page)
      const cols = 4;
      const rows = 5;
      const marginX = 10;
      const marginY = 15; // Top margin start
      const titleHeight = 15; // Space for title at top of each page
      
      const availableWidth = pageWidth - (2 * marginX);
      const availableHeight = pageHeight - (2 * marginY) - titleHeight;
      
      const colWidth = availableWidth / cols;
      const rowHeight = availableHeight / rows;
      
      // QR Size calculation to ensure fit with padding
      // Keep some padding for text (approx 20mm height reserved for text)
      const qrSize = Math.min(colWidth - 10, rowHeight - 25); 
      const itemsPerPage = cols * rows;
      
      for (let i = 0; i < previewImages.length; i++) {
        const item = previewImages[i];
        
        // Check if we need to add a new page
        if (i > 0 && i % itemsPerPage === 0) {
          doc.addPage();
        }
        
        // Calculate position
        const indexOnPage = i % itemsPerPage;
        const colIndex = indexOnPage % cols;
        const rowIndex = Math.floor(indexOnPage / cols);
        
        // Add Header on each page
        if (indexOnPage === 0) {
             doc.setFontSize(16);
             doc.setFont("helvetica", "bold");
             doc.text("Asset QR Tags", pageWidth / 2, marginY, { align: "center" });
        }

        // Calculate item slot position
        const slotX = marginX + (colIndex * colWidth);
        const slotY = marginY + titleHeight + (rowIndex * rowHeight);
        
        // Draw Border for cutting guide (light gray)
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.1);
        doc.rect(slotX + 1, slotY + 1, colWidth - 2, rowHeight - 2); 
        
        // Center content in slot
        const centerX = slotX + (colWidth / 2);
        const qrY = slotY + 5; // Top padding inside slot
        
        // Draw QR
        doc.addImage(item.url, 'PNG', centerX - (qrSize / 2), qrY, qrSize, qrSize);
        
        // Text positioning
        const textYStart = qrY + qrSize + 5;
        
        // Name (Bold)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const nameLines = doc.splitTextToSize(item.name, colWidth - 6);
        doc.text(nameLines, centerX, textYStart, { align: "center" });
        
        // Substation (Regular, smaller)
        const nameHeight = nameLines.length * 4; // approx line height
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(80);
        const subLines = doc.splitTextToSize(item.sub, colWidth - 6);
        doc.text(subLines, centerX, textYStart + nameHeight + 1, { align: "center" });
        
        // Reset color
        doc.setTextColor(0);
      }
      
      doc.save("ArresterGuard_Asset_Tags.pdf");
      setShowPrintPreview(false);
      
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF. Check console.");
    }
  };

  // Sync Metadata
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
                onClick={generatePreview}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all active:scale-95 text-xs"
              >
                <Printer size={16} /> Print QRs ({selectedIds.size > 0 ? selectedIds.size : 'All'})
              </button>
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
                <Plus size={18} /> New Asset
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

      {/* CREATE/EDIT MODAL */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-[95%] md:w-full max-w-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">{currentEquipment.id ? 'Modify Record' : 'Create New Asset'}</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Equipment Metadata Entry</p>
              </div>
              <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEquipment} className="p-6 md:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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

      {/* PRINT PREVIEW MODAL */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <div>
                   <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Eye size={20} className="text-blue-500"/> Print Preview</h3>
                   <p className="text-xs text-slate-400 font-bold uppercase">Showing {previewImages.length} tags</p>
                </div>
                <button onClick={() => setShowPrintPreview(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20} /></button>
             </div>
             <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                   {previewImages.map((img) => (
                      <div key={img.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
                         <img src={img.url} alt="QR Code" className="w-32 h-32 mb-2" />
                         <div className="font-bold text-xs text-slate-800 break-words w-full">{img.name}</div>
                         <div className="text-[10px] text-slate-500 uppercase font-bold mt-1 w-full truncate">{img.sub}</div>
                      </div>
                   ))}
                </div>
             </div>
             <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                <button onClick={() => setShowPrintPreview(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button onClick={handlePrintQRs} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2">
                   <Printer size={18} /> Print PDF
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Grid/List View mapping */}
      <div className={`max-h-[85vh] overflow-y-auto pr-2 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}`}>
        {filteredEquipmentsList.map(eq => {
          const isExpanded = expandedId === eq.id;
          const isSelected = selectedIds.has(eq.id);
          const allEqReadings = readings.filter(r => r.equipmentId === eq.id);
          const filteredEqReadings = allEqReadings
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          return (
            <div key={eq.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}>
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 relative">
                
                {/* Selection Checkbox */}
                {isAdmin && (
                  <div className="absolute top-4 left-4 md:static md:mr-2">
                     <input 
                       type="checkbox" 
                       checked={isSelected}
                       onChange={() => toggleSelect(eq.id)}
                       className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                     />
                  </div>
                )}

                <div className="flex items-start gap-4 ml-8 md:ml-0">
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

              {/* CHILD VIEW */}
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
                                  <input type="date" className="bg-white border rounded px-1 text-[10px]" value={tempReadingData.date || ''} onChange={e => setTempReadingData({...tempReadingData, date: e.target.value})} />
                                ) : formatDisplayDate(r.date)}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  <input type="number" step="0.01" className="w-12 text-center bg-white border rounded" value={tempReadingData.ratedVoltage || ''} onChange={e => setTempReadingData({...tempReadingData, ratedVoltage: parseFloat(e.target.value)})} />
                                ) : `${r.ratedVoltage}`}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  <input type="number" step="0.01" className="w-12 text-center bg-white border rounded" value={tempReadingData.mcovRating || ''} onChange={e => setTempReadingData({...tempReadingData, mcovRating: parseFloat(e.target.value)})} />
                                ) : `${r.mcovRating}`}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  <input type="number" className="w-16 text-center bg-white border rounded" value={tempReadingData.totalCurrent || ''} onChange={e => setTempReadingData({...tempReadingData, totalCurrent: parseFloat(e.target.value)})} />
                                ) : r.totalCurrent}
                              </td>
                              <td className="px-2 py-3 text-center font-mono">
                                {isEditingReading ? (
                                  <input type="number" className="w-16 text-center bg-white border rounded" value={tempReadingData.resistiveCurrent || ''} onChange={e => setTempReadingData({...tempReadingData, resistiveCurrent: parseFloat(e.target.value)})} />
                                ) : r.resistiveCurrent}
                              </td>
                              <td className="px-2 py-3 text-center font-mono font-bold text-blue-600">
                                {isEditingReading ? (
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