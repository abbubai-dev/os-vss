import { useState, useEffect } from 'react';

export default function TriageInboxModal({ isOpen, onClose, token, onRouteSuccess }) {
  const [inboxQueue, setInboxQueue] = useState([]);
  const [selectedReferral, setSelectedReferral] = useState(null);
  
  // Routing Form States
  const [routeDate, setRouteDate] = useState('');
  const [routeTime, setRouteTime] = useState('');
  const [assignedTo, setAssignedTo] = useState('PIC');
  const [isRouting, setIsRouting] = useState(false);

  useEffect(() => {
    if (isOpen) fetchTriageQueue();
  }, [isOpen]);

  const fetchTriageQueue = async () => {
    try {
      const res = await fetch('/api/appointments/triage', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInboxQueue(data);
      }
    } catch (err) {
      console.error("Failed to fetch triage queue", err);
    }
  };

  const handleRoutePatient = async () => {
    if (!routeDate || !routeTime) return alert("Please select a date and time.");
    setIsRouting(true);

    try {
      const res = await fetch(`/api/appointments/${selectedReferral.id}/triage-route`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          appt_date: routeDate,
          appt_time: routeTime,
          assigned_to: assignedTo
        })
      });

      if (res.ok) {
        setSelectedReferral(null);
        setRouteDate('');
        setRouteTime('');
        fetchTriageQueue(); // Refresh the inbox list
        if (onRouteSuccess) onRouteSuccess(); // Tell App.jsx to refresh the calendar
      }
    } catch (err) {
      console.error(err);
      alert("Failed to route patient.");
    } finally {
      setIsRouting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl flex overflow-hidden max-h-[85vh]">
        
        {/* Left Side: The Inbox List */}
        <div className="w-1/2 bg-slate-50 border-r flex flex-col h-full">
          <div className="p-4 border-b bg-white flex justify-between items-center">
            <h2 className="text-xl font-bold text-[#1E3A8A]">Triage Inbox</h2>
            <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
              {inboxQueue.length} Pending
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {inboxQueue.length === 0 ? (
              <p className="text-gray-500 text-center mt-10 font-medium">No pending referrals.</p>
            ) : (
              inboxQueue.map(appt => (
                <div 
                  key={appt.id} 
                  onClick={() => setSelectedReferral(appt)}
                  className={`p-3 mb-2 rounded border cursor-pointer transition-colors ${selectedReferral?.id === appt.id ? 'bg-blue-100 border-blue-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-gray-800">{appt.name}</p>
                    {appt.has_attachments && <span title="Has Attachments">📎</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Source: {appt.source}</p>
                  
                  {/* KPI Badge Display */}
                  {appt.htpg_consult !== 'None' && (
                    <span className="inline-block mt-2 bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-1 rounded">
                      {appt.htpg_consult}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Triage Routing Panel */}
        <div className="w-1/2 flex flex-col h-full bg-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>

          {!selectedReferral ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-medium">
              Select a patient from the inbox to route them.
            </div>
          ) : (
            <div className="p-6 flex flex-col h-full">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Route Patient</h3>
              
              <div className="bg-slate-50 p-3 rounded mb-6 text-sm">
                <p><strong>Name:</strong> {selectedReferral.name}</p>
                <p><strong>IC:</strong> {selectedReferral.ic_number}</p>
                <p><strong>Treatment:</strong> {selectedReferral.treatment}</p>
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-gray-600 italic">"{selectedReferral.notes || 'No notes'}"</p>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Assign To:</label>
                  <select 
                    value={assignedTo} 
                    onChange={e => setAssignedTo(e.target.value)}
                    className="w-full p-2 border rounded focus:ring-[#0D9488] outline-none"
                  >
                    <option value="PIC">Local PIC (Routine Clinic)</option>
                    <option value="Specialist">Visiting Specialist</option>
                  </select>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Date:</label>
                    <input 
                      type="date" 
                      value={routeDate} 
                      onChange={e => setRouteDate(e.target.value)}
                      className="w-full p-2 border rounded focus:ring-[#0D9488] outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Time:</label>
                    <input 
                      type="time" 
                      value={routeTime} 
                      onChange={e => setRouteTime(e.target.value)}
                      className="w-full p-2 border rounded focus:ring-[#0D9488] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t mt-auto">
                <button 
                  onClick={handleRoutePatient}
                  disabled={isRouting}
                  className="w-full bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-3 rounded transition-colors"
                >
                  {isRouting ? 'Routing...' : `Confirm & Add to ${assignedTo} Calendar`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}