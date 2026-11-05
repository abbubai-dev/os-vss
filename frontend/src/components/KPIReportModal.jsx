import { useState, useEffect } from 'react';

export default function KPIReportModal({ isOpen, onClose, token }) {
  // Setup default dates (First day of current month to Today)
  const getFirstDayOfMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  };
  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getTodayStr());
  
  const [reportData, setReportData] = useState({ kpiData: [], ftaNew: 0, ftaMos: 0 });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) fetchReport();
  }, [isOpen]);

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    setIsLoading(true);
    
    try {
      const res = await fetch(`/api/appointments/kpi-report?start_date=${startDate}&end_date=${endDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error("Failed to fetch KPI report", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = (e) => {
    e.preventDefault();
    fetchReport();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-5 border-b bg-purple-50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-extrabold text-purple-900">Clinic Reports & KPIs</h2>
            <p className="text-sm text-purple-700 font-medium">Generate data for any custom date range</p>
          </div>
          <button onClick={onClose} className="text-purple-300 hover:text-purple-600 text-3xl font-bold leading-none">&times;</button>
        </div>

        <div className="p-6 bg-white border-b border-gray-100">
          <form onSubmit={handleGenerate} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                required
                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-purple-500 outline-none" 
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                required
                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-purple-500 outline-none" 
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-6 rounded shadow-sm transition-colors disabled:bg-purple-300"
            >
              {isLoading ? 'Loading...' : 'Generate Report'}
            </button>
          </form>
        </div>

        <div className="p-6 flex-1 overflow-y-auto bg-slate-50">
          {isLoading ? (
            <p className="text-center text-gray-500 font-bold mt-10">Compiling statistics...</p>
          ) : (
            <div className="space-y-6">
              
              {/* --- SECTION 1: HTPG Consult KPIs --- */}
              <div>
                <h3 className="text-sm font-extrabold text-[#1E3A8A] uppercase tracking-wider mb-3">HTPG Consultations</h3>
                {reportData.kpiData && reportData.kpiData.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {reportData.kpiData.map((item, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                        <span className="font-bold text-gray-700">{item.kpi}</span>
                        <span className="bg-purple-100 text-purple-800 text-lg font-extrabold px-3 py-1 rounded-full">
                          {item.total}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center text-gray-500 font-medium">
                    No HTPG Consults found for this date range.
                  </div>
                )}
              </div>

              {/* --- SECTION 2: Defaulter KPIs (FTA) --- */}
              <div>
                <h3 className="text-sm font-extrabold text-red-800 uppercase tracking-wider mb-3">Defaulters (FTA)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 p-5 rounded-lg border border-red-200 shadow-sm flex flex-col justify-center items-center">
                    <span className="text-3xl font-black text-red-700 mb-1">{reportData.ftaNew}</span>
                    <span className="text-xs font-bold text-red-900 uppercase tracking-wider text-center">
                      New Patients<br/>(Kes Baru)
                    </span>
                  </div>
                  <div className="bg-orange-50 p-5 rounded-lg border border-orange-200 shadow-sm flex flex-col justify-center items-center">
                    <span className="text-3xl font-black text-orange-700 mb-1">{reportData.ftaMos}</span>
                    <span className="text-xs font-bold text-orange-900 uppercase tracking-wider text-center">
                      Minor Oral Surgery<br/>(MOS)
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
        
        <div className="p-4 bg-white border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400 font-medium">Data includes all scheduled and routed appointments between selected dates.</p>
        </div>
      </div>
    </div>
  );
}