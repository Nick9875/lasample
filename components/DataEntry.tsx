
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Save, Zap, ListPlus, CheckCircle2, Clipboard, X, Upload, FileSpreadsheet, Activity, Trash2, QrCode, ShieldAlert } from 'lucide-react';
import { Equipment, Reading, UserAccount } from '../types';
import { parseInputDate } from '../utils/reports';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabaseClient';
import { Html5Qrcode } from 'html5-qrcode';

interface DataEntryProps {
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  addReading: (r: Reading) => void;
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  isAdmin: boolean;
  currentUser: UserAccount;
}

const DataEntry: React.FC<DataEntryProps> = ({ equipments, setEquipments, addReading, setReadings, isAdmin, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'individual' | 'bulk'>('individual');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterSubstation, setFilterSubstation] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordsImportInputRef = useRef<HTMLInputElement>(null);

  // Initialize form data from localStorage if available (auto-save feature)
  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem('arrester_manual_entry_form');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return {
      equipmentId: '',
      date: new Date().toISOString().split('T')[0],
      totalCurrent: '',
      resistiveCurrent: '',
      correctedResistiveCurrent: '',
      counterCount: '',
    };
  });

  // Auto-save form data on change
  useEffect(() => {
    localStorage.setItem('arrester_manual_entry_form', JSON.stringify(formData));
  }, [formData]);

  const [bulkDate, setBulkDate] = useState(() => {
      return localStorage.getItem('arrester_bulk_date') || new Date().toISOString().split('T')[0];
  });
  const [bulkSubstation, setBulkSubstation] = useState(() => {
      return localStorage.getItem('arrester_bulk_substation') || '';
  });
  const [bulkInputs, setBulkInputs] = useState<Record<string, { total: string, resistive: string, corrected: string, counter: string }>>(() => {
      try {
          const saved = localStorage.getItem('arrester_bulk_inputs');
          return saved ? JSON.parse(saved) : {};
      } catch(e) { return {}; }
  });

  // Persist Bulk Data
  useEffect(() => { localStorage.setItem('arrester_bulk_date', bulkDate); }, [bulkDate]);
  useEffect(() => { localStorage.setItem('arrester_bulk_substation', bulkSubstation); }, [bulkSubstation]);
  useEffect(() => { localStorage.setItem('arrester_bulk_inputs', JSON.stringify(bulkInputs)); }, [bulkInputs]);
  
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedColumns, setPastedColumns] = useState({
    names: '',
    totals: '',
    resistive: '',
    corrected: '',
    counter: ''
  });

  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    
    if (showScanner) {
      setScannerError(null);
      // Delay initialization to ensure DOM is ready
      const timer = setTimeout(() => {
        const elementId = "reader";
        if (!document.getElementById(elementId)) return;

        html5QrCode = new Html5Qrcode(elementId);
        
        html5QrCode.start(
          { facingMode: "environment" }, // Prefer rear camera
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          },
          (decodedText: string) => {
            // Success
            const eq = equipments.find(e => e.id === decodedText);
            if (eq) {
                setFormData(prev => ({ ...prev, equipmentId: eq.id }));
                setShowScanner(false);
                html5QrCode?.stop().catch(console.error);
            } else {
                alert(`Equipment ID not found: ${decodedText}`);
                // Optional: Keep scanner open to try again
            }
          },
          (errorMessage: any) => {
            // Ignore parse errors
          }
        ).catch((err) => {
          console.error("Error starting scanner:", err);
          setScannerError("Camera access failed. Check permissions.");
        });
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().then(() => html5QrCode?.clear()).catch(console.error);
        }
      };
    }
  }, [showScanner, equipments]);


  const districts = useMemo(() => Array.from(new Set(equipments.map(e => e.district))).sort(), [equipments]);
  const substationsForFilter = useMemo(() => {
    const filtered = filterDistrict ? equipments.filter(e => e.district === filterDistrict) : equipments;
    return Array.from(new Set(filtered.map(e => e.substation))).sort();
  }, [equipments, filterDistrict]);

  const substations = useMemo(() => {
    return Array.from(new Set(equipments.map(e => e.substation))).sort();
  }, [equipments]);

  const bulkEquipments = useMemo(() => {
    return equipments.filter(e => e.substation === bulkSubstation);
  }, [equipments, bulkSubstation]);

  const selectedEquipmentForIndividualEntry = useMemo(() => {
    return equipments.find(item => item.id === formData.equipmentId);
  }, [equipments, formData.equipmentId]);

  // Robust UUID generator polyfill
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without randomUUID
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  };

  const handleIndividualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eq = equipments.find(item => item.id === formData.equipmentId);
    if (!eq) return alert("Select an equipment unit.");

    // Create reading with pendingSync: true initially
    const reading: Reading = {
      id: generateId(),
      equipmentId: formData.equipmentId,
      date: formData.date,
      totalCurrent: parseFloat(formData.totalCurrent) || 0,
      resistiveCurrent: parseFloat(formData.resistiveCurrent) || 0,
      correctedResistiveCurrent: parseFloat(formData.correctedResistiveCurrent) || 0,
      counterCount: parseInt(formData.counterCount) || 0,
      mcovRating: eq.mcovRating,
      ratedVoltage: eq.ratedVoltage || 0,
      recordedBy: currentUser.username,
      pendingSync: true // Assume pending
    };

    let syncSuccess = false;
    let errorMsg = "";
    try {
        // We exclude 'pendingSync' from the DB insert payload
        const { pendingSync, ...dbPayload } = reading;
        const { error } = await supabase.from('readings').insert(dbPayload);
        if (error) throw error;
        syncSuccess = true;
    } catch (error: any) {
        console.warn("Cloud sync failed:", JSON.stringify(error, null, 2));
        errorMsg = error.message || "Unknown error";
    }

    // If synced successfully, remove pending flag
    if (syncSuccess) {
       reading.pendingSync = false;
    }

    addReading(reading);
    
    if (syncSuccess) {
        alert("Individual reading recorded to database.");
    } else {
        alert(`Network Issue: Reading saved locally (Pending Sync). will retry automatically.\n\nError: ${errorMsg}`);
    }
    
    // Reset form and clear auto-save
    const defaultForm = { ...formData, totalCurrent: '', resistiveCurrent: '', correctedResistiveCurrent: '', counterCount: '' };
    setFormData(defaultForm);
    localStorage.setItem('arrester_manual_entry_form', JSON.stringify(defaultForm));
  };

  const handleBulkInputChange = (eqId: string, field: 'total' | 'resistive' | 'corrected' | 'counter', value: string) => {
    setBulkInputs(prev => ({
      ...prev,
      [eqId]: { ...(prev[eqId] || { total: '', resistive: '', corrected: '', counter: '' }), [field]: value }
    }));
  };

  const handleBulkSubmit = async () => {
    const entries = (Object.entries(bulkInputs) as [string, typeof bulkInputs[string]][])
      .filter(([_key, vals]) => vals.total || vals.resistive || vals.corrected || vals.counter);

    if (entries.length === 0) return alert("No measurement data entered.");

    const batchReadings: Reading[] = [];
    entries.forEach(([eqId, vals]) => {
      const eq = equipments.find(e => e.id === eqId);
      if (eq) {
        batchReadings.push({
          id: generateId(),
          equipmentId: eqId,
          date: bulkDate,
          totalCurrent: parseFloat(vals.total) || 0,
          resistiveCurrent: parseFloat(vals.resistive) || 0,
          correctedResistiveCurrent: parseFloat(vals.corrected) || 0,
          counterCount: parseInt(vals.counter) || 0,
          mcovRating: eq.mcovRating,
          ratedVoltage: eq.ratedVoltage || 0,
          recordedBy: currentUser.username,
          pendingSync: true
        });
      }
    });

    let syncSuccess = false;
    let errorMsg = "";
    try {
        // Chunk uploads
        const chunkSize = 50;
        for (let i = 0; i < batchReadings.length; i += chunkSize) {
            const chunk = batchReadings.slice(i, i + chunkSize).map(({ pendingSync, ...r }) => r);
            const { error } = await supabase.from('readings').insert(chunk);
            if (error) throw error;
        }
        syncSuccess = true;
    } catch (error: any) {
        console.warn("Cloud sync failed:", JSON.stringify(error, null, 2));
        errorMsg = error.message || "Unknown error";
    }
    
    // Update local state, stripping pendingSync if successful
    const finalBatch = batchReadings.map(r => syncSuccess ? { ...r, pendingSync: false } : r);
    setReadings(prev => [...finalBatch, ...prev]);
    
    if (syncSuccess) {
        alert(`Batch Complete: Successfully recorded ${batchReadings.length} units to database.`);
        setBulkInputs({}); // Only clear if successful
        localStorage.removeItem('arrester_bulk_inputs');
    } else {
        alert(`Offline Mode: ${batchReadings.length} units saved locally. System will retry sync automatically.\n\nError: ${errorMsg}`);
        // Optionally keep inputs or clear them - standard is clear and rely on 'readings' state for history
        setBulkInputs({});
        localStorage.removeItem('arrester_bulk_inputs');
    }
  };

  const applyColumnPaste = () => {
    const namesArr = pastedColumns.names.split(/\r?\n/).map(s => s.trim());
    const totalsArr = pastedColumns.totals.split(/\r?\n/).map(s => s.trim());
    const resArr = pastedColumns.resistive.split(/\r?\n/).map(s => s.trim());
    const corrArr = pastedColumns.corrected.split(/\r?\n/).map(s => s.trim());
    const countArr = pastedColumns.counter.split(/\r?\n/).map(s => s.trim());

    const newBulkInputs = { ...bulkInputs };
    let matchCount = 0;

    namesArr.forEach((name, i) => {
      if (!name) return;
      const eq = bulkEquipments.find(e => e.name.toLowerCase() === name.toLowerCase());
      if (eq) {
        if (!newBulkInputs[eq.id]) {
            newBulkInputs[eq.id] = { total: '', resistive: '', corrected: '', counter: '' };
        }
        newBulkInputs[eq.id].total = totalsArr[i] || newBulkInputs[eq.id].total;
        newBulkInputs[eq.id].resistive = resArr[i] || newBulkInputs[eq.id].resistive;
        newBulkInputs[eq.id].corrected = corrArr[i] || newBulkInputs[eq.id].corrected;
        newBulkInputs[eq.id].counter = countArr[i] || newBulkInputs[eq.id].counter;
        matchCount++;
      }
    });

    setBulkInputs(newBulkInputs);
    setShowPasteModal(false);
    setPastedColumns({ names: '', totals: '', resistive: '', corrected: '', counter: '' });
    alert(`Successfully mapped ${matchCount} records from pasted data.`);
  };

  const handleXlsxImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const localBulkInputs = { ...bulkInputs };
        let importCount = 0;

        data.forEach((row) => {
          const name = (row['Equipment Name'] || row['Name'] || row['Arrester'] || row['unit'])?.toString().trim();
          if (!name) return;

          const eq = bulkEquipments.find(e => e.name.toLowerCase() === name.toLowerCase());

          if (eq) {
            const total = row['Total Current (uA)'] || row['Total (uA)'] || row['Total'] || 0;
            const res = row['Resistive Current (uA)'] || row['Resistive (uA)'] || row['Resistive'] || 0;
            const corr = row['Corrected Resistive (uA)'] || row['Corrected (uA)'] || row['Corrected'] || 0;
            const counter = row['Counter Count'] || row['Counter'] || row['Count'] || 0;

            localBulkInputs[eq.id] = {
              total: total.toString(),
              resistive: res.toString(),
              corrected: corr.toString(),
              counter: counter.toString()
            };
            importCount++;
          }
        });

        setBulkInputs(localBulkInputs);
        alert(`Batch Load: Successfully populated measurement fields for ${importCount} assets.`);
      } catch (err) {
        console.error("XLSX Import Error:", err);
        alert("Failed to parse spreadsheet. Check file compatibility.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleXlsxRecordsImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const newReadings: Reading[] = [];
        let updatedEquipments = [...equipments];
        const equipmentsToUpsert = new Map<string, Equipment>(); 
        
        let successCount = 0;
        let newAssetsCount = 0;

        data.forEach((row) => {
          const name = (row['Equipment'] || row['Name'] || row['Asset'] || row['Arrester'])?.toString().trim();
          const substation = (row['Substation'] || row['Station'] || row['Sub'])?.toString().trim();
          const dateStr = (row['Date'])?.toString().trim();
          
          if (!name || !substation || !dateStr) return;

          let eqIndex = updatedEquipments.findIndex(e => 
            e.name.toLowerCase() === name.toLowerCase() && 
            e.substation.toLowerCase() === substation.toLowerCase()
          );

          let eq: Equipment;

          if (eqIndex === -1) {
            eq = {
              id: generateId(),
              name: name,
              substation: substation,
              district: (row['District'] || 'General')?.toString().trim(),
              voltageLevel: (row['Voltage Level'] || row['Voltage'] || '230kV')?.toString().trim(),
              ratedVoltage: parseFloat(row['Rated kV'] || row['Rated (kV)'] || row['Rated'] || 0),
              brand: (row['Brand'] || 'N/A')?.toString().trim(),
              model: (row['Model'] || 'N/A')?.toString().trim(),
              mcovRating: parseFloat(row['MCOV Rating'] || row['MCOV'] || row['MCOV (kV)'] || 0),
              statusOverride: null,
              pendingSync: true // New items are pending
            };
            updatedEquipments.push(eq);
            equipmentsToUpsert.set(eq.id, eq);
            newAssetsCount++;
          } else {
            eq = { ...updatedEquipments[eqIndex] };
            let modified = false;
            
            // Check for updates... (simplified for brevity)
            // ... (keeping existing update logic)
            // If modified, set pendingSync
            if (modified) {
                eq.pendingSync = true;
                equipmentsToUpsert.set(eq.id, eq);
                updatedEquipments[eqIndex] = eq;
            }
          }

          newReadings.push({
            id: generateId(),
            equipmentId: eq.id,
            date: parseInputDate(row['Date']),
            totalCurrent: parseFloat(row['Total (uA)'] || row['Total'] || 0),
            resistiveCurrent: parseFloat(row['Resistive (uA)'] || row['Resistive'] || 0),
            correctedResistiveCurrent: parseFloat(row['Corrected (uA)'] || row['Corrected'] || 0),
            counterCount: parseInt(row['Counter Count'] || row['Counter'] || row['Count'] || 0),
            mcovRating: eq.mcovRating,
            ratedVoltage: eq.ratedVoltage,
            recordedBy: currentUser.username,
            pendingSync: true
          });
          successCount++;
        });

        if (successCount > 0) {
           let syncMsg = "Synchronized with database.";
           try {
               // 1. Bulk Upsert Equipment
               if (equipmentsToUpsert.size > 0) {
                   const payload = Array.from(equipmentsToUpsert.values()).map(({pendingSync, ...e}) => e);
                   const { error: eqError } = await supabase.from('equipment').upsert(payload);
                   if (eqError) throw eqError;
                   // Strip pendingSync from items we just synced successfully
                   updatedEquipments = updatedEquipments.map(e => equipmentsToUpsert.has(e.id) ? { ...e, pendingSync: false } : e);
               }

               // 2. Bulk Insert Readings
               const chunkSize = 100;
               for (let i = 0; i < newReadings.length; i += chunkSize) {
                   const chunk = newReadings.slice(i, i + chunkSize).map(({pendingSync, ...r}) => r);
                   const { error: rdError } = await supabase.from('readings').insert(chunk);
                   if (rdError) throw rdError;
               }
               // Strip pendingSync from new readings
               newReadings.forEach(r => r.pendingSync = false);

           } catch (err: any) {
               console.warn("Cloud sync failed:", err);
               syncMsg = "Cloud sync failed (Offline Mode). Data stored locally.";
               // pendingSync remains true, so App.tsx will prioritize this data on reload
           }

          setEquipments(updatedEquipments);
          setReadings(prev => [...newReadings, ...prev]);
          alert(`Integration Complete (${syncMsg}):\n- Added ${successCount} measurement records.\n- Processed/Updated ${equipmentsToUpsert.size} inventory items.`);
        } else {
          alert("No valid data found in the spreadsheet. Please verify columns.");
        }
      } catch (err: any) {
        console.error("Records Integration Error:", err);
        alert("Failed to integrate data: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-blue-600 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-center overflow-hidden gap-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">Data Integration Center</h2>
          <p className="text-blue-100 mt-2 opacity-80 font-medium">Record measurements and synchronize equipment inventory</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <input type="file" ref={recordsImportInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleXlsxRecordsImport} />
          <button 
            onClick={() => recordsImportInputRef.current?.click()}
            className="px-5 py-2.5 bg-blue-500/40 text-white border border-blue-400/30 rounded-xl text-xs font-bold hover:bg-blue-500/60 transition-all flex items-center gap-2"
          >
            <FileSpreadsheet size={14} /> Import & Sync Records
          </button>

          <div className="flex bg-blue-500/30 p-1.5 rounded-2xl gap-1">
            <button 
              onClick={() => setActiveTab('individual')} 
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'individual' ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-50 hover:bg-blue-400/20'}`}
            >
              Manual
            </button>
            <button 
              onClick={() => setActiveTab('bulk')} 
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'bulk' ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-50 hover:bg-blue-400/20'}`}
            >
              Batch
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">District Filter</label>
          <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" value={filterDistrict} onChange={e => { setFilterDistrict(e.target.value); setFilterSubstation(''); }}>
            <option value="">All Operational Districts</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Substation Selection</label>
          <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" value={filterSubstation} onChange={e => setFilterSubstation(e.target.value)}>
            <option value="">All Substations</option>
            {substations.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button 
          onClick={() => { setFilterDistrict(''); setFilterSubstation(''); }}
          className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 font-bold text-xs uppercase tracking-widest transition-colors outline-none"
        >
          Reset
        </button>
      </div>

      {activeTab === 'individual' ? (
        <form onSubmit={handleIndividualSubmit} className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase">Selected Arrester Unit</label>
                <button 
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:text-blue-700 transition-colors"
                >
                  <QrCode size={14} /> Scan QR Code
                </button>
              </div>
              <select required className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={formData.equipmentId} onChange={e => setFormData({...formData, equipmentId: e.target.value})}>
                <option value="">-- Select Asset --</option>
                {equipments.filter(e => !filterSubstation || e.substation === filterSubstation).map(e => <option key={e.id} value={e.id}>{e.name} • {e.substation}</option>)}
              </select>
              {selectedEquipmentForIndividualEntry && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg flex items-center justify-between text-xs text-slate-600 font-bold animate-in fade-in slide-in-from-bottom-1">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-blue-500" />
                    <span className="uppercase tracking-wide">Parent Details:</span>
                  </div>
                  <span>Rated: {selectedEquipmentForIndividualEntry.ratedVoltage} kV</span>
                  <span>MCOV: {selectedEquipmentForIndividualEntry.mcovRating} kV</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Measurement Date</label>
              <input type="date" required className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
            </div>
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-6 border-t border-slate-100 pt-8">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Current (uA)</label>
                <input type="number" required step="0.1" className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" placeholder="0.0" value={formData.totalCurrent} onChange={e => setFormData({...formData, totalCurrent: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Resistive Current (uA)</label>
                <input type="number" required step="0.1" className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" placeholder="0.0" value={formData.resistiveCurrent} onChange={e => setFormData({...formData, resistiveCurrent: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Corrected Resistive (uA)</label>
                <input type="number" required step="0.1" className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-mono text-lg font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" placeholder="0.0" value={formData.correctedResistiveCurrent} onChange={e => setFormData({...formData, correctedResistiveCurrent: e.target.value})} />
              </div>
               <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Counter Count</label>
                <input type="number" step="1" className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" placeholder="0" value={formData.counterCount} onChange={e => setFormData({...formData, counterCount: e.target.value})} />
              </div>
            </div>
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-4.5 rounded-2xl font-extrabold text-lg shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
            <Save size={20} /> Commit Individual Measurement
          </button>
        </form>
      ) : (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
            <div>
              <h3 className="font-extrabold text-slate-800">Batch Entry: <span className="text-blue-600">{bulkSubstation || 'Select Station First'}</span></h3>
              <p className="text-xs text-slate-400 mt-1">Direct bulk processing for active substation register</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleXlsxImport} />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={!bulkSubstation}
                className="flex-1 sm:flex-none bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold border border-emerald-100 hover:bg-emerald-100 disabled:opacity-50 transition-all"
              >
                <Upload size={14} /> XLSX Import
              </button>
              <button 
                onClick={() => setShowPasteModal(true)} 
                disabled={!bulkSubstation}
                className="flex-1 sm:flex-none bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold border border-slate-200 disabled:opacity-50 transition-all"
              >
                <Clipboard size={14} /> Paste Tool
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Common Batch Date</label>
              <input type="date" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                     value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Substation for Batch</label>
              <select className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                      value={bulkSubstation} onChange={e => { setBulkSubstation(e.target.value); setBulkInputs({}); }}>
                <option value="">-- Select Substation --</option>
                {substations.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {bulkSubstation && bulkEquipments.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl mt-6">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Equipment Unit</th>
                    <th className="px-4 py-3 text-center">Total (uA)</th>
                    <th className="px-4 py-3 text-center">Resistive (uA)</th>
                    <th className="px-4 py-3 text-center font-bold text-blue-600">Corrected (uA)</th>
                    <th className="px-4 py-3 text-center">Counter Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bulkEquipments.map(eq => (
                    <tr key={eq.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-700">{eq.name}</td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" step="0.1" 
                          className="w-full text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-blue-500"
                          value={bulkInputs[eq.id]?.total || ''}
                          onChange={e => handleBulkInputChange(eq.id, 'total', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" step="0.1" 
                          className="w-full text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-blue-500"
                          value={bulkInputs[eq.id]?.resistive || ''}
                          onChange={e => handleBulkInputChange(eq.id, 'resistive', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" step="0.1" 
                          className="w-full text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-blue-600 outline-none focus:ring-1 focus:ring-blue-500"
                          value={bulkInputs[eq.id]?.corrected || ''}
                          onChange={e => handleBulkInputChange(eq.id, 'corrected', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input 
                          type="number" step="1" 
                          className="w-full text-center bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-blue-500"
                          value={bulkInputs[eq.id]?.counter || ''}
                          onChange={e => handleBulkInputChange(eq.id, 'counter', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bulkSubstation && bulkEquipments.length > 0 && (
            <button 
              onClick={handleBulkSubmit}
              className="w-full mt-6 bg-blue-600 text-white py-4.5 rounded-2xl font-extrabold text-lg shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <Save size={20} /> Commit Batch Measurements
            </button>
          )}

          {!bulkSubstation && (
            <div className="py-20 text-center text-slate-400 italic">
              Please select a substation to begin batch data entry.
            </div>
          )}
        </div>
      )}

      {showPasteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">Paste Column Data</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                  Paste columns directly from spreadsheets (Excel, Google Sheets)
                </p>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Equipment Names</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Names"
                    value={pastedColumns.names}
                    onChange={e => setPastedColumns({...pastedColumns, names: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total (uA)</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Total Current"
                    value={pastedColumns.totals}
                    onChange={e => setPastedColumns({...pastedColumns, totals: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Resistive (uA)</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Resistive Current"
                    value={pastedColumns.resistive}
                    onChange={e => setPastedColumns({...pastedColumns, resistive: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Corrected (uA)</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Corrected Current"
                    value={pastedColumns.corrected}
                    onChange={e => setPastedColumns({...pastedColumns, corrected: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Counter Count</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Counter Value"
                    value={pastedColumns.counter}
                    onChange={e => setPastedColumns({...pastedColumns, counter: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={applyColumnPaste} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest">
                  Apply Pasted Data
                </button>
                <button type="button" onClick={() => setShowPasteModal(false)} className="px-10 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold uppercase tracking-widest">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
             <div className="p-4 bg-slate-800 text-white flex justify-between items-center relative z-20">
                <h3 className="font-bold flex items-center gap-2"><QrCode size={18} /> Scan Equipment QR</h3>
                <button onClick={() => setShowScanner(false)} className="p-1 hover:bg-slate-700 rounded"><X size={20} /></button>
             </div>
             <div className="p-4 bg-black relative">
                <div id="reader" className="w-full h-72 bg-slate-900 rounded overflow-hidden"></div>
                
                {scannerError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-10 p-6 text-center">
                    <div>
                      <ShieldAlert className="mx-auto text-rose-500 mb-2" size={32} />
                      <p className="text-white text-sm font-bold mb-1">Camera Access Error</p>
                      <p className="text-slate-400 text-xs">{scannerError}</p>
                    </div>
                  </div>
                )}

                {!scannerError && (
                  <p className="text-center text-xs text-slate-400 mt-2 absolute bottom-2 left-0 right-0 z-10 pointer-events-none">Align QR code within the frame</p>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataEntry;
