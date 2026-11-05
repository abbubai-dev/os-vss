import { useState, useEffect } from 'react';

export default function FTATrackingModal({ isOpen, onClose, token, onSelectPatient }) {
  const [ftaList, setFtaList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) fetchFTA();
  }, [isOpen]);

  const fetchFTA = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/appointments/fta', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setFtaList(await res.json());
    } catch (err) {
      console.error("Failed to fetch FTA list", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDischarge = async (e, id) => {
    e.stopPropagation(); // Prevent opening the drawer
    if (!window.confirm("Discharge this patient for failing to attend?")) return;
    
    try {
      const res = await fetch(`/api/appointments/${id}/checkout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'Discharged', notes: 'Discharged due to FTA (Defaulter)' })
      });
      if (res.ok) fetchFTA(); // Refresh list automatically
    } catch (err) { 
      console.error(err); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        
        <div className="p-5 border-b bg-red-50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-red-800 flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Defaulter Tracking (FTA)
            </h2>
            <p className="text-sm text-red-600 font-medium">Patients who missed their scheduled appointments</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-3xl font-bold leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
          {isLoading ? (
            <p className="text-center text-gray-500 mt-10 font-bold">Loading records...</p>
          ) : ftaList.length === 0 ? (
            <div className="text-center mt-10">
              <p className="text-emerald-600 font-extrabold text-lg">Great job!</p>
              <p className="text-gray-500 font-medium">There are currently no defaulted patients.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {ftaList.map(appt => (
                <div 
                  key={appt.id} 
                  onClick={() => {
                    onSelectPatient(appt);
                    onClose(); // Close modal and open main drawer
                  }}
                  className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-red-300 hover:shadow-md transition-all cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-red-100 text-red-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">
                        Missed: {new Date(appt.appt_date).toLocaleDateString('en-GB')}
                      </span>
                      <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        {appt.patient_type}
                      </span>
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        {appt.treatment}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-gray-800 text-lg">{appt.name}</h3>
                    <p className="text-sm font-medium text-gray-500">IC: {appt.ic_number} | Clinic: {appt.assigned_to}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <a 
                      href={`https://wa.me/6${appt.phone_number.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="bg-green-100 hover:bg-green-200 text-green-800 font-bold py-2 px-3 rounded text-sm flex items-center gap-1 transition-colors"
                      title="WhatsApp Patient"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      {appt.phone_number}
                    </a>
                    
                    <button 
                      onClick={(e) => handleDischarge(e, appt.id)}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-3 rounded text-sm transition-colors"
                      title="Discharge Defaulter"
                    >
                      Discharge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}