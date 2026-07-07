import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Equipment } from '../types';
import { X, Printer, Loader2 } from 'lucide-react';

interface QRCodePrintLayoutProps {
  equipments: Equipment[];
  onClose: () => void;
}

const QRCodePrintLayout: React.FC<QRCodePrintLayoutProps> = ({ equipments, onClose }) => {
  const [qrCodes, setQrCodes] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const generateQRCodes = async () => {
      const urls = await Promise.all(
        equipments.map(eq => 
          QRCode.toDataURL(`${eq.name}::${eq.substation}`, { // Encode both name and substation
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 144 // Approx 1.5 inches at 96 DPI
          })
        )
      );
      setQrCodes(urls);
    };

    if (equipments.length > 0) {
      generateQRCodes();
    }
  }, [equipments]);

  const handlePrint = async () => {
    if (!printContainerRef.current) return;
    setIsPrinting(true);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageElement = printContainerRef.current;
    
    // Temporarily make the element visible for capturing if it's not
    pageElement.style.display = 'block';

    const canvas = await html2canvas(pageElement, {
      scale: 2, // Increase resolution
      useCORS: true,
      logging: false,
    });
    
    // Hide it again after capture
    pageElement.style.display = 'none';

    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    const ratio = canvasWidth / pdfWidth;
    const scaledHeight = canvasHeight / ratio;

    let heightLeft = scaledHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - scaledHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`QR_Codes_${Date.now()}.pdf`);
    setIsPrinting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">QR Code Generation</h3>
            <p className="text-xs text-slate-400 font-bold uppercase">Print-Ready A4 Sheet</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-blue-400"
            >
              {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              {isPrinting ? 'Generating...' : 'Print to PDF'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 p-8 overflow-auto">
          {/* This is the visible preview */}
          <div className="w-[210mm] min-h-[297mm] bg-white mx-auto shadow-lg p-[10mm]">
            <div className="grid grid-cols-4 gap-x-4 gap-y-8">
              {equipments.map((eq, index) => (
                <div key={eq.id} className="text-center break-inside-avoid">
                  {qrCodes[index] ? (
                    <img 
                      src={qrCodes[index]} 
                      alt={`QR code for ${eq.name} at ${eq.substation}`}
                      className="w-[144px] h-[144px] mx-auto border border-slate-200 p-1"
                    />
                  ) : (
                    <div className="w-[144px] h-[144px] bg-slate-100 animate-pulse mx-auto"></div>
                  )}
                  <p className="text-[10px] font-bold mt-2 text-slate-800 break-words">{eq.name}</p>
                  <p className="text-[8px] text-slate-400">{eq.substation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* This is the hidden, full-size element for PDF generation */}
      <div 
        ref={printContainerRef}
        className="absolute top-0 left-0 bg-white"
        style={{
          width: '210mm',
          display: 'none', // Hidden from view, only used for capture
          padding: '10mm',
        }}
      >
        <div className="grid grid-cols-4 gap-x-4 gap-y-8">
          {equipments.map((eq, index) => (
            <div key={eq.id} className="text-center break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
              {qrCodes[index] && (
                <img 
                  src={qrCodes[index]} 
                  alt={`QR code for ${eq.name} at ${eq.substation}`}
                  className="w-[144px] h-[144px] mx-auto border border-slate-200 p-1"
                />
              )}
              <p className="text-[10px] font-bold mt-2 text-slate-800 break-words">{eq.name}</p>
              <p className="text-[8px] text-slate-400">{eq.substation}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QRCodePrintLayout;
