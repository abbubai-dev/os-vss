import { useState, useEffect } from 'react';

export default function HolidayModal({ isOpen, onClose, token }) {
  const [holidays, setHolidays] = useState([]);
  const [newDate, setNewDate] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    if (isOpen) fetchHolidays();
  }, [isOpen]);

  const fetchHolidays = async () => {
    try {
      const res = await fetch('/api/appointments/holidays', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        // ---> STRICT ARRAY CHECK <---
        setHolidays(Array.isArray(data) ? data : []);
      }
    } catch (err) { 
      console.error("Failed to fetch holidays", err); 
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newDate) return;
    try {
      const res = await fetch('/api/appointments/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ holiday_date: newDate, description: newDesc || 'Clinic Closed' })
      });
      if (res.ok) {
        setNewDate('');
        setNewDesc('');
        fetchHolidays();
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/holidays/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchHolidays();
    } catch (err) { console.error(err); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b bg-teal-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-teal-900">Manage Clinic Holidays</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-500 text-2xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleAdd} className="p-4 border-b bg-gray-50">
          <div className="flex gap-2 mb-2">
            <input 
              type="date" required value={newDate} onChange={e => setNewDate(e.target.value)}
              className="flex-1 p-2 border rounded text-sm focus:ring-[#0D9488]"
            />
            <input 
              type="text" placeholder="Description (e.g. Raya)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              className="flex-1 p-2 border rounded text-sm focus:ring-[#0D9488]"
            />
          </div>
          <button type="submit" className="w-full bg-[#0D9488] text-white font-bold py-2 rounded text-sm hover:bg-teal-700">
            Add Holiday
          </button>
        </form>

        <div className="max-h-64 overflow-y-auto p-4">
          {holidays.length === 0 ? <p className="text-sm text-center text-gray-500">No holidays set.</p> : null}
          {holidays.map(h => (
            <div key={h.id} className="flex justify-between items-center p-2 mb-2 bg-white border rounded">
              <div>
                <p className="font-bold text-gray-800 text-sm">
                  {new Date(h.holiday_date).toLocaleDateString('en-GB')}
                </p>
                <p className="text-xs text-gray-500">{h.description}</p>
              </div>
              <button onClick={() => handleDelete(h.id)} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded text-xs font-bold">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}