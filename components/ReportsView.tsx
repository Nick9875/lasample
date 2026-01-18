
import React, { useState, useMemo } from 'react';
import { FileText, FileSpreadsheet, Search, Check, Filter } from 'lucide-react';
import { Equipment, Reading, ThresholdSettings } from '../types';
import { exportToExcel, exportToPDF, formatDisplayDate } from '../utils/reports';

interface ReportsViewProps {
  equipments: Equipment[];
  readings: Reading[];
  setEquipments: (e: Equipment[]) => void;
  setReadings: (r: Reading[]) => void;
  settings: ThresholdSettings;
}

const ReportsView: React.FC<ReportsViewProps> = ({ equipments, readings, settings }) => {
  const [filters, setFilters] = useState({
    district: 'All',
    substation: 'All',
    brand: 'All',
    model: 'All'
  });

  const [selectedReadingIds, setSelectedReadingIds] = useState<Set<string>>(new Set());

  const districts = useMemo(() => ['All', ...Array.from(new Set(equipments.map(e => e.district))).sort()], [equipments]);
  const substations = useMemo(() => ['All', ...Array.from(new Set(equipments.map(e => e.substation))).sort()], [equipments]);
  const brands = useMemo(() => ['All', ...Array.from(new Set(equipments.map(e => e.brand))).sort()], [equipments]);
  const models = useMemo(() => ['All', ...Array.from(new Set(equipments.map(e => e.model))).sort()], [equipments]);

  const filteredReadings = useMemo(() => {
    return readings.filter(r => {
      const eq = equipments.find(e => e.id === r.equipmentId);
      if (!eq) return false;
      return (
        (filters.district === 'All' || eq.district === filters.district) &&
        (filters.substation === 'All' || eq.substation === filters.substation) &&
        (filters.brand === 'All' || eq.brand === filters.brand) &&
        (filters.model === 'All' || eq.model === filters.model)
      );
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [readings, equipments, filters]);

  const toggleAll = () => {
    if (selectedReadingIds.size === filteredReadings.length && filteredReadings.length > 0) {
      setSelectedReadingIds(new Set());
    } else {
      setSelectedReadingIds(new Set(filteredReadings.map(r => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedReadingIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedReadingIds(next);
  };

  const selectedData = useMemo(() => {
    return readings.filter(r => selectedReadingIds.has(r.id)).map(r => {
      const eq = equipments.find(e => e.id === r.equipmentId);
      const status = r.correctedResistiveCurrent > settings.criticalLimit ? 'Critical' : r.correctedResistiveCurrent > settings.poorLimit ? 'Poor' : 'Satisfactory';
      return {
        Date: formatDisplayDate(r.date),
        Equipment: eq?.name,
        Substation: eq?.substation,
        District: eq?.district,
        Brand: eq?.brand,
        Model: eq?.model,
        'Rated kV': r.ratedVoltage || eq?.ratedVoltage || 0,
        'Total (uA)': r.totalCurrent,
        'Resistive (uA)': r.resistiveCurrent,
        'Corrected (uA)': r.correctedResistiveCurrent,
        Status: status
      };
    });
  }, [selectedReadingIds, readings, equipments, settings]);

  const handleExportXLSX = () => {
    if (selectedData.length === 0) return alert("Select at least one record to export.");
    exportToExcel(selectedData, `Arrester_Health_Report_${Date.now()}`);
  };

  const handleExportPDF = () => {
    if (selectedData.length === 0) return alert("Select at least one record to export.");
    const headers = ["Date", "Asset", "Substation", "Corrected", "Status"];
    const rows = selectedData.map(d => [d.Date, d.Equipment || 'N/A', d.Substation || 'N/A', `${d['Corrected (uA)']} uA`, d.Status]);
    exportToPDF(headers, rows, "Arrester Leakage Health Report", `LA_Report_${Date.now()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Report Engine</h2>
          <p className="text-slate-500">Generate formatted official health documentation</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">District</label>
          <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-blue-500" value={filters.district} onChange={e => setFilters({...filters, district: e.target.value})}>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Substation</label>
          <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-blue-500" value={filters.substation} onChange={e => setFilters({...filters, substation: e.target.value})}>
            {substations.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Brand</label>
          <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-blue-500" value={filters.brand} onChange={e => setFilters({...filters, brand: e.target.value})}>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Model</label>
          <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-blue-500" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})}>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 bg-slate-50 border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors">
              <div className={`w-5 h-5 rounded border transition-colors flex items-center justify-center ${selectedReadingIds.size > 0 && selectedReadingIds.size === filteredReadings.length ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-300'}`}>
                {selectedReadingIds.size > 0 && selectedReadingIds.size === filteredReadings.length && <Check size={12} />}
              </div>
              Select All ({filteredReadings.length})
            </button>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedReadingIds.size} Ready for Export</span>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExportXLSX} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all uppercase tracking-wide"><FileSpreadsheet size={16} /> XLSX</button>
            <button onClick={handleExportPDF} className="bg-blue-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:bg-black transition-all uppercase tracking-wide"><FileText size={16} /> PDF</button>
          </div>
        </div>
        <div className="overflow-auto flex-1 no-scrollbar">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="bg-white sticky top-0 z-10 text-[10px] font-bold uppercase text-slate-400 border-b shadow-sm">
              <tr>
                <th className="px-6 py-4 bg-white">Select</th>
                <th className="px-6 py-4 bg-white">Date</th>
                <th className="px-6 py-4 bg-white">Equipment Unit</th>
                <th className="px-6 py-4 bg-white">Substation</th>
                <th className="px-6 py-4 bg-white font-bold text-blue-600">Corrected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReadings.length > 0 ? filteredReadings.map(r => {
                const eq = equipments.find(e => e.id === r.equipmentId);
                const isSelected = selectedReadingIds.has(r.id);
                return (
                  <tr key={r.id} className={`${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'} transition-colors cursor-pointer`} onClick={() => toggleOne(r.id)}>
                    <td className="px-6 py-4">
                      <div className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200'}`}>
                        {isSelected && <Check size={12} />}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">{formatDisplayDate(r.date)}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{eq?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-slate-500">{eq?.substation || 'N/A'}</td>
                    <td className="px-6 py-4 font-mono font-bold text-blue-600">{r.correctedResistiveCurrent} uA</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-24 text-center">
                    <Filter className="mx-auto text-slate-200 mb-4" size={48} />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No records matching active filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;
