
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Save, Zap, ListPlus, CheckCircle2, Clipboard, X, Upload, FileSpreadsheet, Activity, Trash2, QrCode, Camera } from 'lucide-react';
import { Equipment, Reading } from '../types';
import { parseInputDate } from '../utils/reports';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabaseClient';
import { Html5Qrcode } from 'html5-qrcode';
import { extractReadingFromImage, extractBatchReadingsFromDocument } from '../services/geminiService';

interface DataEntryProps {
  equipments: Equipment[];
  setEquipments: React.Dispatch<React.SetStateAction<Equipment[]>>;
  addReading: (r: Reading) => void;
  setReadings: React.Dispatch<React.SetStateAction<Reading[]>>;
  isAdmin: boolean;
  currentUser?: any;
}

const DataEntry: React.FC<DataEntryProps> = ({ equipments, setEquipments, addReading, setReadings, isAdmin, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'individual' | 'bulk'>('individual');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterSubstation, setFilterSubstation] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordsImportInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    equipmentId: '',
    date: new Date().toISOString().split('T')[0],
    totalCurrent: '',
    resistiveCurrent: '',
    correctedResistiveCurrent: '',
  });

  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkSubstation, setBulkSubstation] = useState('');
  const [bulkInputs, setBulkInputs] = useState<Record<string, { total: string, resistive: string, corrected: string }>>({});
  
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedColumns, setPastedColumns] = useState({
    names: '',
    totals: '',
    resistive: '',
    corrected: ''
  });

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // OCR state
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const ocrCameraRef = useRef<HTMLInputElement>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  // Batch OCR State
  const batchOcrInputRef = useRef<HTMLInputElement>(null);
  const [isBatchOcrProcessing, setIsBatchOcrProcessing] = useState(false);
  const [showBatchVerification, setShowBatchVerification] = useState(false);
  const [batchOcrData, setBatchOcrData] = useState<any[]>([]);

  const [showAddAssetModal, setShowAddAssetModal] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: '',
    substation: '',
    district: '',
    voltageLevel: '230kV',
    ratedVoltage: '',
    brand: '',
    model: '',
    mcovRating: ''
  });


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


  // Scanner Effect
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    if (showScanner) {
       const timer = setTimeout(() => {
          if (!document.getElementById("reader")) return;
          
          html5QrCode = new Html5Qrcode("reader");
          html5QrCode.start(
            { facingMode: "environment" }, 
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
               // Success callback
               const eq = equipments.find(e => e.id === decodedText);
               if (eq) {
                 setFormData(prev => ({ ...prev, equipmentId: eq.id }));
                 // Auto set filters if needed to show context
                 setFilterDistrict(eq.district);
                 setFilterSubstation(eq.substation);
                 
                 setShowScanner(false);
                 html5QrCode?.stop().catch(console.error);
               } else {
                 console.warn("Scanned code not found in inventory:", decodedText);
                 // Optional: Toast or small alert
               }
            },
            (errorMessage) => {
               // parse error, ignore
            }
          ).catch(err => {
             console.error("Error starting scanner", err);
             setScannerError("Could not access camera. Ensure permissions are granted.");
          });
       }, 300); // small delay for modal transition
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => html5QrCode?.clear()).catch(console.error);
      }
    };
  }, [showScanner, equipments]);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const newEq: Equipment = {
      id: `eq-${Date.now()}`,
      name: newAsset.name,
      substation: newAsset.substation,
      district: newAsset.district,
      voltageLevel: newAsset.voltageLevel,
      ratedVoltage: parseFloat(newAsset.ratedVoltage) || 0,
      brand: newAsset.brand || 'N/A',
      model: newAsset.model || 'N/A',
      mcovRating: parseFloat(newAsset.mcovRating) || 0,
      statusOverride: null
    };

    let syncSuccess = false;
    try {
        const { error } = await supabase.from('equipment').insert(newEq);
        if (error) throw error;
        syncSuccess = true;
    } catch (error: any) {
        console.warn("Cloud sync failed:", error);
    }
    
    setEquipments(prev => [...prev, newEq]);
    setFormData({ ...formData, equipmentId: newEq.id });
    setShowAddAssetModal(false);
    
    // reset form
    setNewAsset({
        name: '', substation: '', district: '', voltageLevel: '230kV',
        ratedVoltage: '', brand: '', model: '', mcovRating: ''
    });
    alert(syncSuccess ? 'Asset created and selected (Synced to DB).' : 'Asset created locally (Network Error).');
  };

  const handleIndividualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eq = equipments.find(item => item.id === formData.equipmentId);
    if (!eq) return alert("Select an equipment unit.");

    const reading: Reading = {
      id: `rd-${Date.now()}`,
      equipmentId: formData.equipmentId,
      date: formData.date,
      totalCurrent: parseFloat(formData.totalCurrent) || 0,
      resistiveCurrent: parseFloat(formData.resistiveCurrent) || 0,
      correctedResistiveCurrent: parseFloat(formData.correctedResistiveCurrent) || 0,
      mcovRating: eq.mcovRating,
      ratedVoltage: eq.ratedVoltage || 0,
      notes: currentUser ? `Recorded by: ${currentUser.username}` : ''
    };

    let syncSuccess = false;
    try {
        const { error } = await supabase.from('readings').insert(reading);
        if (error) throw error;
        syncSuccess = true;
    } catch (error: any) {
        console.warn("Cloud sync failed:", error);
    }

    addReading(reading);
    alert(syncSuccess ? "Individual reading recorded to database." : "Network Error: Reading saved locally only.");
    setFormData({ ...formData, totalCurrent: '', resistiveCurrent: '', correctedResistiveCurrent: '' });
  };

  const handleOcrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrProcessing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result as string;
        const result = await extractReadingFromImage(base64Image, file.type);
        
        if (result) {
          setFormData(prev => ({
            ...prev,
            totalCurrent: result.totalLeakageCurrent !== null ? String(result.totalLeakageCurrent) : prev.totalCurrent,
            resistiveCurrent: result.resistiveCurrent !== null ? String(result.resistiveCurrent) : prev.resistiveCurrent,
            correctedResistiveCurrent: result.correctedResistiveCurrent !== null ? String(result.correctedResistiveCurrent) : prev.correctedResistiveCurrent,
          }));
          alert("OCR extraction complete. Please verify the filled values.");
        } else {
          alert("Failed to extract data from image. Please enter manually.");
        }
        setIsOcrProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert("Error processing image.");
      setIsOcrProcessing(false);
    }
    e.target.value = '';
  };

  const handleBatchOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBatchOcrProcessing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        const result = await extractBatchReadingsFromDocument(base64Data, file.type);
        
        if (result && Array.isArray(result) && result.length > 0) {
          setBatchOcrData(result);
          setShowBatchVerification(true);
        } else {
          alert("Failed to extract tabular data from document. Please verify the file contains clear readable data.");
        }
        setIsBatchOcrProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert("Error processing document.");
      setIsBatchOcrProcessing(false);
    }
    e.target.value = '';
  };

  const applyBatchOcrData = () => {
    const newBulkInputs = { ...bulkInputs };
    let matchCount = 0;

    batchOcrData.forEach(row => {
      if (!row.equipmentName) return;
      // Try to find matching equipment in current batch
      const eq = bulkEquipments.find(e => 
        e.name.toLowerCase() === row.equipmentName.toLowerCase() || 
        e.id === row.equipmentName
      );

      if (eq) {
        matchCount++;
        newBulkInputs[eq.id] = {
          total: row.totalLeakageCurrent !== null ? String(row.totalLeakageCurrent) : (newBulkInputs[eq.id]?.total || ''),
          resistive: row.resistiveCurrent !== null ? String(row.resistiveCurrent) : (newBulkInputs[eq.id]?.resistive || ''),
          corrected: row.correctedResistiveCurrent !== null ? String(row.correctedResistiveCurrent) : (newBulkInputs[eq.id]?.corrected || ''),
        };
      }
    });

    setBulkInputs(newBulkInputs);
    setShowBatchVerification(false);
    alert(`Applied ${matchCount} matching readings to the batch form.`);
  };

  const handleBulkInputChange = (eqId: string, field: 'total' | 'resistive' | 'corrected', value: string) => {
    setBulkInputs(prev => ({
      ...prev,
      [eqId]: { ...(prev[eqId] || { total: '', resistive: '', corrected: '' }), [field]: value }
    }));
  };

  const handleBulkSubmit = async () => {
    const entries = Object.entries(bulkInputs).filter(([_key, vals]: [string, { total: string, resistive: string, corrected: string }]) => vals.total || vals.resistive || vals.corrected);
    if (entries.length === 0) return alert("No measurement data entered.");

    const batchReadings: Reading[] = [];
    entries.forEach(([eqId, vals]: [string, { total: string, resistive: string, corrected: string }]) => {
      const eq = equipments.find(e => e.id === eqId);
      if (eq) {
        batchReadings.push({
          id: `rd-${Date.now()}-${eqId}-${Math.random().toString(36).substr(2, 4)}`,
          equipmentId: eqId,
          date: bulkDate,
          totalCurrent: parseFloat(vals.total) || 0,
          resistiveCurrent: parseFloat(vals.resistive) || 0,
          correctedResistiveCurrent: parseFloat(vals.corrected) || 0,
          mcovRating: eq.mcovRating,
          ratedVoltage: eq.ratedVoltage || 0,
          notes: currentUser ? `Recorded by: ${currentUser.username}` : ''
        });
      }
    });

    let syncSuccess = false;
    try {
        const { error } = await supabase.from('readings').insert(batchReadings);
        if (error) throw error;
        syncSuccess = true;
    } catch (error: any) {
        console.warn("Cloud sync failed:", error);
    }
    
    setReadings(prev => [...batchReadings, ...prev]);
    
    if (syncSuccess) {
        alert(`Batch Complete: Successfully recorded ${batchReadings.length} units to database.`);
    } else {
        alert(`Offline Mode: ${batchReadings.length} units saved locally. Check connection.`);
    }
    setBulkInputs({});
  };

  const applyColumnPaste = () => {
    const namesArr = pastedColumns.names.split(/\r?\n/).map(s => s.trim());
    const totalsArr = pastedColumns.totals.split(/\r?\n/).map(s => s.trim());
    const resArr = pastedColumns.resistive.split(/\r?\n/).map(s => s.trim());
    const corrArr = pastedColumns.corrected.split(/\r?\n/).map(s => s.trim());

    const newBulkInputs = { ...bulkInputs };
    let matchCount = 0;

    namesArr.forEach((name, i) => {
      if (!name) return;
      const eq = bulkEquipments.find(e => e.name.toLowerCase() === name.toLowerCase());
      if (eq) {
        if (!newBulkInputs[eq.id]) {
            newBulkInputs[eq.id] = { total: '', resistive: '', corrected: '' };
        }
        newBulkInputs[eq.id].total = totalsArr[i] || newBulkInputs[eq.id].total;
        newBulkInputs[eq.id].resistive = resArr[i] || newBulkInputs[eq.id].resistive;
        newBulkInputs[eq.id].corrected = corrArr[i] || newBulkInputs[eq.id].corrected;
        matchCount++;
      }
    });

    setBulkInputs(newBulkInputs);
    setShowPasteModal(false);
    setPastedColumns({ names: '', totals: '', resistive: '', corrected: '' });
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

            localBulkInputs[eq.id] = {
              total: total.toString(),
              resistive: res.toString(),
              corrected: corr.toString()
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
        let successCount = 0;
        let newAssetsCount = 0;

        // Process data locally first
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
              id: `eq-imp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: name,
              substation: substation,
              district: (row['District'] || 'General')?.toString().trim(),
              voltageLevel: (row['Voltage Level'] || row['Voltage'] || '230kV')?.toString().trim(),
              ratedVoltage: parseFloat(row['Rated kV'] || row['Rated (kV)'] || row['Rated'] || 0),
              brand: (row['Brand'] || 'N/A')?.toString().trim(),
              model: (row['Model'] || 'N/A')?.toString().trim(),
              mcovRating: parseFloat(row['MCOV Rating'] || row['MCOV'] || row['MCOV (kV)'] || 0),
              statusOverride: null
            };
            updatedEquipments.push(eq);
            newAssetsCount++;
          } else {
            eq = { ...updatedEquipments[eqIndex] };
            if (row['District']) eq.district = row['District'].toString().trim();
            if (row['Brand']) eq.brand = row['Brand'].toString().trim();
            if (row['Model']) eq.model = row['Model'].toString().trim();
            if (row['Rated kV'] || row['Rated (kV)'] || row['Rated']) {
                eq.ratedVoltage = parseFloat(row['Rated kV'] || row['Rated (kV)'] || row['Rated']);
            }
            if (row['MCOV Rating'] || row['MCOV'] || row['MCOV (kV)']) {
                eq.mcovRating = parseFloat(row['MCOV Rating'] || row['MCOV'] || row['MCOV (kV)']);
            }
            updatedEquipments[eqIndex] = eq;
          }

          newReadings.push({
            id: `rd-imp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            equipmentId: eq.id,
            date: parseInputDate(row['Date']),
            totalCurrent: parseFloat(row['Total (uA)'] || row['Total'] || 0),
            resistiveCurrent: parseFloat(row['Resistive (uA)'] || row['Resistive'] || 0),
            correctedResistiveCurrent: parseFloat(row['Corrected (uA)'] || row['Corrected'] || 0),
            mcovRating: eq.mcovRating,
            ratedVoltage: eq.ratedVoltage,
            notes: currentUser ? `Recorded by: ${currentUser.username}` : ''
          });
          successCount++;
        });

        if (successCount > 0) {
           let syncMsg = "Synchronized with database.";
           try {
               // Bulk Upsert Equipment
               const { error: eqError } = await supabase.from('equipment').upsert(updatedEquipments);
               if (eqError) throw eqError;

               // Bulk Insert Readings
               const { error: rdError } = await supabase.from('readings').insert(newReadings);
               if (rdError) throw rdError;
           } catch (err: any) {
               console.warn("Cloud sync failed:", err);
               syncMsg = "Cloud sync failed (Offline Mode). Data stored locally.";
           }

          setEquipments(updatedEquipments);
          setReadings(prev => [...newReadings, ...prev]);
          alert(`Integration Complete (${syncMsg}):\n- Added ${successCount} measurement records.\n- Processed ${updatedEquipments.length} inventory items.`);
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
                {isAdmin && (
                  <button type="button" onClick={() => setShowAddAssetModal(true)} className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[10px] font-bold transition-colors uppercase tracking-wider">
                    <ListPlus size={12} /> Add Asset
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select required className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={formData.equipmentId} onChange={e => setFormData({...formData, equipmentId: e.target.value})}>
                  <option value="">-- Select Asset --</option>
                  {equipments.filter(e => !filterSubstation || e.substation === filterSubstation).map(e => <option key={e.id} value={e.id}>{e.name} • {e.substation}</option>)}
                </select>
                <button 
                  type="button" 
                  onClick={() => setShowScanner(true)}
                  className="px-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100"
                  title="Scan QR Code"
                >
                  <QrCode size={24} />
                </button>
              </div>
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
            <div className="md:col-span-3 border-t border-slate-100 pt-8">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-sm font-extrabold text-slate-700 uppercase tracking-widest">Measurements</h4>
                {isAdmin && (
                  <div className="flex gap-2">
                    <input type="file" ref={ocrInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleOcrImageUpload} />
                    <input type="file" ref={ocrCameraRef} className="hidden" accept="image/*" capture="environment" onChange={handleOcrImageUpload} />
                    <button 
                      type="button" 
                      onClick={() => ocrInputRef.current?.click()}
                      disabled={isOcrProcessing}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-colors border border-purple-200 disabled:opacity-50"
                    >
                      <Upload size={14} /> 
                      {isOcrProcessing ? 'Analyzing...' : 'Upload Photo'}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => ocrCameraRef.current?.click()}
                      disabled={isOcrProcessing}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-colors border border-purple-200 disabled:opacity-50"
                    >
                      <Camera size={14} /> 
                      {isOcrProcessing ? 'Analyzing...' : 'Take Photo'}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <input type="file" ref={batchOcrInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleBatchOcrUpload} />
              <button 
                onClick={() => batchOcrInputRef.current?.click()}
                disabled={!bulkSubstation || isBatchOcrProcessing}
                className="flex-1 sm:flex-none bg-purple-50 text-purple-700 px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold border border-purple-100 hover:bg-purple-100 disabled:opacity-50 transition-all"
              >
                <Camera size={14} /> {isBatchOcrProcessing ? 'Extracting...' : 'Document OCR'}
              </button>
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

      {showBatchVerification && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 flex flex-col">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">Verify OCR Extraction</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Review tabular data before applying</p>
              </div>
              <button onClick={() => setShowBatchVerification(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-8">
              <table className="min-w-full text-sm text-left border border-slate-200 rounded-xl">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Equipment Name</th>
                    <th className="px-4 py-3 text-center">Total (uA)</th>
                    <th className="px-4 py-3 text-center">Resistive (uA)</th>
                    <th className="px-4 py-3 text-center font-bold text-blue-600">Corrected (uA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchOcrData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-700">{row.equipmentName || 'Unknown'}</td>
                      <td className="px-4 py-2 text-center font-mono">{row.totalLeakageCurrent !== null ? row.totalLeakageCurrent : '-'}</td>
                      <td className="px-4 py-2 text-center font-mono">{row.resistiveCurrent !== null ? row.resistiveCurrent : '-'}</td>
                      <td className="px-4 py-2 text-center font-mono font-bold text-blue-600">{row.correctedResistiveCurrent !== null ? row.correctedResistiveCurrent : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-8 border-t border-slate-100 bg-slate-50 flex gap-4 flex-shrink-0">
              <button onClick={applyBatchOcrData} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest">
                Apply to Batch
              </button>
              <button onClick={() => setShowBatchVerification(false)} className="px-10 bg-slate-200 text-slate-600 py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-slate-300">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
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
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Equipment Unit Names</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Paste equipment names, one per line"
                    value={pastedColumns.names}
                    onChange={e => setPastedColumns({...pastedColumns, names: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Current (uA)</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Paste total currents, one per line"
                    value={pastedColumns.totals}
                    onChange={e => setPastedColumns({...pastedColumns, totals: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Resistive Current (uA)</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Paste resistive currents, one per line"
                    value={pastedColumns.resistive}
                    onChange={e => setPastedColumns({...pastedColumns, resistive: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Corrected Resistive (uA)</label>
                  <textarea
                    className="w-full h-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Paste corrected resistive currents, one per line"
                    value={pastedColumns.corrected}
                    onChange={e => setPastedColumns({...pastedColumns, corrected: e.target.value})}
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

      {showAddAssetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">Quick Add Asset</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">Register new substation & equipment</p>
              </div>
              <button onClick={() => setShowAddAssetModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Equipment Name</label>
                  <input type="text" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={newAsset.name} onChange={e => setNewAsset({...newAsset, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Substation</label>
                  <input type="text" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={newAsset.substation} onChange={e => setNewAsset({...newAsset, substation: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">District</label>
                  <input type="text" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={newAsset.district} onChange={e => setNewAsset({...newAsset, district: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Brand</label>
                  <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={newAsset.brand} onChange={e => setNewAsset({...newAsset, brand: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Rated Voltage (kV)</label>
                  <input type="number" step="0.1" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={newAsset.ratedVoltage} onChange={e => setNewAsset({...newAsset, ratedVoltage: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">MCOV Rating (kV)</label>
                  <input type="number" step="0.1" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={newAsset.mcovRating} onChange={e => setNewAsset({...newAsset, mcovRating: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest">
                  Create Asset
                </button>
                <button type="button" onClick={() => setShowAddAssetModal(false)} className="px-10 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold uppercase tracking-widest">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
             <div className="p-4 bg-slate-800 text-white flex justify-between items-center relative z-20">
                <h3 className="font-bold flex items-center gap-2"><Camera size={18} /> Scan Asset Code</h3>
                <button onClick={() => setShowScanner(false)} className="p-1 hover:bg-slate-700 rounded"><X size={20} /></button>
             </div>
             <div className="p-4 bg-black relative">
                <div id="reader" className="w-full h-64 bg-slate-900 rounded overflow-hidden"></div>
                {scannerError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-10 p-4 text-center">
                    <p className="text-white text-sm">{scannerError}</p>
                  </div>
                )}
             </div>
             <div className="p-4 bg-white text-center text-xs text-slate-500">
                Align the QR code within the frame to automatically select the equipment.
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataEntry;
