import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function KPIReportModal({ isOpen, onClose, token }) {
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [year, setYear] = useState(new Date().getFullYear());
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // 1. Fetch data from backend
      const res = await fetch(`/api/appointments/kpi-report?month=${month}&year=${year}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const rawData = await res.json();

      // 2. Map data to ensure all 4 KPIs show up (even if the count is 0)
      const kpiList = [
        "KPI 1: Defer to Specialist Visit",
        "KPI 2: Cluster PIC Assessment",
        "KPI 3: Cluster Admission",
        "KPI 4: Stabilize & Transfer"
      ];

      const reportData = kpiList.map(kpiName => {
        const found = rawData.find(row => row.kpi === kpiName);
        return [kpiName, found ? found.total : 0];
      });

      // Calculate total diverted cases
      const totalCases = reportData.reduce((sum, row) => sum + parseInt(row[1]), 0);
      reportData.push([{ content: 'Total Cases Diverted from HTPG', styles: { fontStyle: 'bold' } }, { content: totalCases.toString(), styles: { fontStyle: 'bold' } }]);

      // 3. Generate PDF
      const doc = new jsPDF();
      const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

      // Title
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138); 
      doc.text('Laporan Pencapaian KPI Kluster OMFS', 14, 20);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Hospital Kuala Kangsar | Bulan: ${monthName} ${year}`, 14, 28);

      // Table
      autoTable(doc, {
        startY: 35,
        head: [["State KPI Indicator (Diverted Cases)", "Total Patients"]],
        body: reportData,
        theme: 'grid',
        headStyles: { fillColor: [107, 33, 168], textColor: 255, fontStyle: 'bold' }, // Purple Header
        styles: { fontSize: 10, cellPadding: 5 },
        columnStyles: {
          0: { cellWidth: 130 },
          1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' }
        }
      });

      // Signature Area
      const finalY = doc.lastAutoTable.finalY || 100;
      doc.text('Disediakan Oleh:', 14, finalY + 30);
      doc.line(14, finalY + 50, 70, finalY + 50); // Signature line
      doc.text('Pegawai Pergigian (PIC) / Pakar', 14, finalY + 55);

      // Open PDF
      window.open(doc.output('bloburl'), '_blank');
      onClose();

    } catch (err) {
      console.error(err);
      alert("Failed to generate report.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b bg-purple-700 text-white flex justify-between items-center">
          <h2 className="text-lg font-bold">Generate KPI Report</h2>
          <button onClick={onClose} className="text-purple-200 hover:text-white text-xl font-bold">&times;</button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4 font-medium">Select the month and year to generate the cluster diversion report for the State Health Director.</p>
          
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-1">Month</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full p-2 border rounded focus:ring-purple-500 outline-none font-medium text-gray-700">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('en-US', { month: 'long' })}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-1">Year</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full p-2 border rounded focus:ring-purple-500 outline-none font-medium text-gray-700" />
            </div>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-3 px-4 rounded transition-colors disabled:bg-gray-400"
          >
            {isGenerating ? 'Compiling Data...' : 'Download PDF Report'}
          </button>
        </div>
      </div>
    </div>
  );
}