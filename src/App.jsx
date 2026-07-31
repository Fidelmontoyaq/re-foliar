import React, { useState, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default function App() {
  const [filesList, setFilesList] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Manejar arrastrar y soltar
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  }, []);

  // Procesar archivos seleccionados o arrastrados
  const handleFiles = useCallback((files) => {
    const pdfFiles = Array.from(files).filter(file => file.type === "application/pdf");
    
    const newFiles = pdfFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      status: 'idle',
      pageCount: null,
      resultBlobUrl: null,
      pdfBytes: null 
    }));

    setFilesList(prev => [...prev, ...newFiles]);

    newFiles.forEach(async (item) => {
      try {
        const arrayBuffer = await item.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const count = pdfDoc.getPageCount();
        
        setFilesList(prev => prev.map(f => f.id === item.id ? { ...f, pageCount: count } : f));
      } catch (err) {
        setFilesList(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
      }
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (id) => {
    setFilesList(prev => prev.filter(f => f.id !== id));
  };

  // Función interna para foliar un PDF (MODIFICADA CON CAJA DE OCULTACIÓN)
  const processSinglePDF = async (fileItem) => {
    try {
      setFilesList(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'processing' } : f));

      const arrayBuffer = await fileItem.file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontSize = 11;

      for (let i = 0; i < totalPages; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        // Numeración ascendente desde 1
        const folioAscendente = i + 1;
        const text = `Pág. ${folioAscendente}`;

        const textWidth = helveticaBold.widthOfTextAtSize(text, fontSize);
        const marginRight = 25;
        const marginTop = 20;

        // --- MEDIDAS DE LA CAJA / PARCHE ---
        const paddingX = 12; // Margen interno horizontal de la caja
        const paddingY = 6;  // Margen interno vertical de la caja
        
        const boxWidth = textWidth + (paddingX * 2);
        const boxHeight = fontSize + (paddingY * 2);

        // Ubicación X e Y de la caja en la esquina superior derecha
        const boxX = width - boxWidth - (marginRight - paddingX);
        const boxY = height - marginTop - paddingY;

        // 1. DIBUJAR CAJA OSCURA (Oculta el folio viejo completamente)
        page.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight,
          color: rgb(0.09, 0.13, 0.20),      // Azul/Gris oscuro opaco (#172133)
          borderColor: rgb(0.25, 0.35, 0.5),  // Borde fino decorativo
          borderWidth: 1,
        });

        // 2. ESCRIBIR EL NUEVO FOLIO ASCENDENTE (Sobre la caja)
        page.drawText(text, {
          x: boxX + paddingX,
          y: boxY + paddingY + 2, // Pequeño ajuste para centrar verticalmente el texto
          size: fontSize,
          font: helveticaBold,
          color: rgb(1, 1, 1),    // Texto BLANCO brillante
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      setFilesList(prev => prev.map(f => f.id === fileItem.id ? { 
        ...f, 
        status: 'completed', 
        resultBlobUrl: downloadUrl,
        pdfBytes: pdfBytes 
      } : f));

      return { success: true, blob, pdfBytes, name: fileItem.name.replace('.pdf', '_foliado.pdf'), downloadUrl };
    } catch (error) {
      setFilesList(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error' } : f));
      return { success: false };
    }
  };

  // Descarga individual sucesiva tradicional
  const processAllFilesIndividual = async () => {
    setProcessing(true);
    for (const fileItem of filesList) {
      if (fileItem.status !== 'completed') {
        const result = await processSinglePDF(fileItem);
        if (result.success) {
          const link = document.createElement('a');
          link.href = result.downloadUrl;
          link.download = result.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else if (fileItem.resultBlobUrl) {
        const link = document.createElement('a');
        link.href = fileItem.resultBlobUrl;
        link.download = fileItem.name.replace('.pdf', '_foliado.pdf');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
    setProcessing(false);
  };

  // Guardar directamente en una carpeta seleccionada por el usuario (Sin comprimir)
  const processAndSaveToLocalDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert("Tu navegador no soporta la selección de carpetas locales directamente. Por favor usa un navegador moderno como Google Chrome o Microsoft Edge.");
      return;
    }

    setProcessing(true);
    try {
      const directoryHandle = await window.showDirectoryPicker();
      
      for (const fileItem of filesList) {
        let currentBytes = fileItem.pdfBytes;
        let currentName = fileItem.name.replace('.pdf', '_foliado.pdf');

        if (fileItem.status !== 'completed') {
          const result = await processSinglePDF(fileItem);
          if (result.success) {
            currentBytes = result.pdfBytes;
          }
        }

        if (currentBytes) {
          const fileHandle = await directoryHandle.getFileHandle(currentName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(currentBytes);
          await writable.close();
        }
      }
      alert("¡Todos los archivos foliados se guardaron con éxito en la carpeta seleccionada!");
    } catch (err) {
      console.error("Error al guardar en el directorio:", err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6">
      
      {/* Header con Logotipo */}
      <header className="max-w-4xl mx-auto w-full flex flex-col items-center text-center my-6">
        <div className="flex items-center gap-3 mb-4 bg-slate-800/40 px-6 py-3 rounded-2xl border border-slate-800/80 shadow-inner">
          <div className="bg-gradient-to-tr from-blue-500 to-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/20">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-xl font-bold tracking-wider text-slate-100 block">FOLIADO</span>
            <span className="text-xs text-blue-400 font-semibold tracking-widest uppercase block -mt-1">PRO-SYSTEM</span>
          </div>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          Foliador Digital Ascendente
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-lg">
          Sube tus archivos PDF y aplica numeración ascendente (desde la pág. 1) en la cabecera derecha de manera instantánea.
        </p>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto w-full flex-grow flex flex-col gap-6">
        
        {/* Drag and Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload').click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[200px] ${
            isDragActive 
              ? 'border-blue-500 bg-blue-500/10 scale-[0.99]' 
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
          }`}
        >
          <input
            id="file-upload"
            type="file"
            multiple
            accept="application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />
          <svg className={`w-14 h-14 mb-4 transition-transform ${isDragActive ? 'animate-bounce text-blue-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg font-medium text-slate-200">
            Arrastra tus documentos aquí o <span className="text-blue-400 underline">explora tus archivos</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">Soporta múltiples archivos PDF</p>
        </div>

        {/* Lista de Archivos */}
        {filesList.length > 0 && (
          <div className="bg-slate-800/40 rounded-xl border border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-slate-200 text-lg">
                Archivos en cola ({filesList.length})
              </h3>
              
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={processAllFilesIndividual}
                  disabled={processing}
                  className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-200 font-semibold py-2 px-4 rounded-lg text-xs transition"
                >
                  Descargar por separado
                </button>

                <button
                  onClick={processAndSaveToLocalDirectory}
                  disabled={processing}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-2 px-4 rounded-lg text-xs transition shadow-lg shadow-blue-600/20 flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  {processing ? 'Guardando...' : 'Guardar en Carpeta Local'}
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-800/60 max-h-[350px] overflow-y-auto pr-2">
              {filesList.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 012 0v4a1 1 0 11-2 0v-4zm3-3a1 1 0 00-1 1v5a1 1 0 102 0V8a1 1 0 00-1-1zm4 2a1 1 0 10-2 0v3a1 1 0 102 0V9z" clipRule="evenodd" />
                    </svg>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-slate-200 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.pageCount ? `${item.pageCount} páginas` : 'Calculando...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {item.status === 'processing' && (
                      <span className="text-xs text-blue-400 animate-pulse font-medium">Procesando...</span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-xs text-red-400 font-medium">Error</span>
                    )}
                    {item.status === 'completed' && (
                      <span className="text-xs text-emerald-400 font-medium">¡Completado!</span>
                    )}

                    {item.status === 'completed' && item.resultBlobUrl ? (
                      <a
                        href={item.resultBlobUrl}
                        download={item.name.replace('.pdf', '_foliado.pdf')}
                        className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs px-3 py-1.5 rounded-md font-semibold transition"
                      >
                        Descargar
                      </a>
                    ) : (
                      <button
                        onClick={() => processSinglePDF(item)}
                        disabled={item.status === 'processing' || !item.pageCount}
                        className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1.5 rounded-md text-slate-200 transition disabled:opacity-50"
                      >
                        Foliar individual
                      </button>
                    )}

                    <button
                      onClick={() => removeFile(item.id)}
                      className="text-slate-500 hover:text-red-400 p-1 rounded-md hover:bg-slate-800 transition"
                      title="Eliminar de la lista"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-600 py-4 mt-8 border-t border-slate-800/50 max-w-4xl mx-auto w-full">
        Seguridad garantizada. El procesamiento se ejecuta en el lado del cliente (tu navegador). Ningún documento se guarda en la red.
      </footer>
    </div>
  );
}