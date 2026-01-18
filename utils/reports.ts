
import { Equipment, Reading } from "../types";
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Helper to format date for display: YYYY-MM-DD -> DD/MM/YYYY
export const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

// Helper to parse DD/MM/YYYY or XLSX serial back to YYYY-MM-DD for storage
export const parseInputDate = (input: any): string => {
  if (!input) return new Date().toISOString().split('T')[0];
  
  // Handle XLSX serial numbers (Excel dates are numbers of days since 1900)
  if (typeof input === 'number') {
    const date = new Date(Math.round((input - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }

  const str = String(input).trim();
  
  // Check if DD/MM/YYYY or D/M/YYYY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let [day, month, year] = parts;
      // Handle 2-digit years
      if (year.length === 2) year = '20' + year;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Check if DD-MM-YYYY
  if (str.includes('-') && str.split('-')[0].length < 4) {
    const parts = str.split('-');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  
  // Check if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  return new Date().toISOString().split('T')[0];
};

export const exportToExcel = (data: any[], fileName: string) => {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch (error) {
    console.error("XLSX Export Error:", error);
    alert("Failed to generate Excel report.");
  }
};

export const exportToPDF = (headers: string[], data: any[][], title: string, fileName: string) => {
  try {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    (doc as any).autoTable({
      startY: 35,
      head: [headers],
      body: data,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { top: 35 }
    });

    doc.save(`${fileName}.pdf`);
  } catch (error) {
    console.error("PDF Export Error:", error);
    alert("Failed to generate PDF report.");
  }
};
