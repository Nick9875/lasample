import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onClose }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true
      },
      /* verbose= */ false
    );

    const handleSuccess = (decodedText: string) => {
      // Cleanup is handled in the return function of useEffect
      onScanSuccess(decodedText);
    };

    const handleError = (error: any) => {
      // This is called continuously, so we can ignore it to prevent console spam.
    };

    scanner.render(handleSuccess, handleError);

    return () => {
      // Check if scanner has a clear method before calling
      if (scanner && scanner.getState() !== 1 /* NOT_STARTED */) {
         scanner.clear().catch(error => {
            console.error("Failed to clear scanner on unmount.", error);
         });
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[130] flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in zoom-in-95">
         <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors z-10">
            <X size={20} className="text-slate-500" />
         </button>
         <h3 className="text-lg font-bold text-slate-800 mb-4 text-center">Scan Equipment QR Code</h3>
         <div id="qr-reader" className="w-full"></div>
      </div>
    </div>
  );
};

export default QRScanner;
