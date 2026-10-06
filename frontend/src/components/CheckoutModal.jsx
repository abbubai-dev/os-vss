import { useState, useEffect } from 'react';

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', 
  '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00'
];

const TREATMENTS = ['CONSULTATION', 'SCALING', 'FILLING', 'BIOPSY', 'I&D', 'MOS', 'REVIEW', 'HPE', 'OTHERS'];

export default function CheckoutModal({ isOpen, onClose, patient, token, onSuccess }) {
  const [action, setAction] = useState('discharge'); // 'discharge', 'followup1', 'followup2'
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Appt 1 States
  const [date1, setDate1] = useState('');
  const [time1, setTime1] = useState('');
  const [clinic1, setClinic1] = useState('Specialist');
  const [treatment1, setTreatment1] = useState('REVIEW');
  const [bookedSlots1, setBookedSlots1] = useState([]);

  // Appt 2 States
  const [date2, setDate2] = useState('');
  const [time2, setTime2] = useState('');
  const [clinic2, setClinic2] = useState('PIC');
  const [treatment2, setTreatment2] = useState('SCALING');
  const [bookedSlots2, setBookedSlots2] = useState([]);

  // Reset modal when opened
  useEffect(() => {
    if (isOpen && patient) {
      setAction('discharge');
      setNotes('');
      setDate1(''); setTime1(''); setClinic1('Specialist'); setTreatment1('REVIEW');
      setDate2(''); setTime2(''); setClinic2('PIC'); setTreatment2('SCALING');
    }
  }, [isOpen, patient]);

  // Fetch slots for Date 1
  useEffect(() => {
    if (!date1 || !isOpen) return;
    fetch(`/api/appointments?date=${date1}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        // ---> STRICT ARRAY CHECK <---
        if (Array.isArray(data)) {
          setBookedSlots1(data.map(a => a.appt_time.slice(0, 5)));
        }
      })
      .catch(err => console.error(err));
  }, [date1, isOpen, token]);

  // Fetch slots for Date 2
  useEffect(() => {
    if (!date2 || !isOpen) return;
    fetch(`/api/appointments?date=${date2}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        // ---> STRICT ARRAY CHECK <---
        if (Array.isArray(data)) {
          setBookedSlots2(data.map(a => a.appt_time.slice(0, 5)));
        }
      })
      .catch(err => console.error(err));
  }, [date2, isOpen, token]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (action === 'followup1' && (!date1 || !time1)) return alert("Please complete Date 1");
    if (action === 'followup2' && (!date1 || !time1 || !date2 || !time2)) return alert("Please complete both dates");

    setIsSubmitting(true);

    const payload = {
      status: 'Discharged',
      notes: notes,
      next_appt_date: action !== 'discharge' ? date1 : null,
      next_appt_time: action !== 'discharge' ? time1 : null,
      assigned_to: action !== 'discharge' ? clinic1 : null,
      treatment: action !== 'discharge' ? treatment1 : null,
      
      next_appt_date_2: action === 'followup2' ? date2 : null,
      next_appt_time_2: action === 'followup2' ? time2 : null,
      assigned_to_2: action === 'followup2' ? clinic2 : null,
      treatment_2: action === 'followup2' ? treatment2 : null,
    };

    try {
      const response = await fetch(`/api/appointments/${patient.id}/checkout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        alert("Failed to checkout.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !patient) return null;

  const renderTimeGrid = (selectedTime, setTime, bookedSlots) => (
    <div className="grid grid-cols-5 gap-1 mt-1">
      {TIME_SLOTS.map(slot => {
        const isBooked = bookedSlots.includes(slot);
        return (
          <button
            type="button" key={slot} disabled={isBooked}
            onClick={() => setTime(slot)}
            className={`py-1 text-[10px] font-bold rounded border transition-colors ${
              isBooked ? 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed' :
              selectedTime === slot ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]' :
              'bg-white text-gray-600 hover:border-[#0D9488]'
            }`}
          >
            {isBooked ? 'Full' : slot}
          </button>
        )
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b bg-blue-50 flex justify-between items-center rounded-t-xl">
          <h2 className="text-lg font-bold text-[#1E3A8A]">Checkout & Discharge: {patient.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          <div className="flex gap-4 mb-6 bg-slate-50 p-2 rounded-lg border">
            <label className="flex-1 flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input type="radio" checked={action === 'discharge'} onChange={() => setAction('discharge')} className="accent-[#1E3A8A] w-4 h-4" />
              Discharge Only
            </label>
            <label className="flex-1 flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input type="radio" checked={action === 'followup1'} onChange={() => setAction('followup1')} className="accent-[#1E3A8A] w-4 h-4" />
              1 Follow-up
            </label>
            <label className="flex-1 flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input type="radio" checked={action === 'followup2'} onChange={() => setAction('followup2')} className="accent-[#1E3A8A] w-4 h-4" />
              2 Follow-ups
            </label>
          </div>

          {action !== 'discharge' && (
            <div className="space-y-4 mb-6">
              {/* APPT 1 */}
              <div className="p-4 border border-blue-200 bg-blue-50/50 rounded-lg">
                <h4 className="text-xs font-bold uppercase text-blue-800 mb-3 border-b border-blue-200 pb-1">First Appointment</h4>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">DATE</label>
                    <input type="date" value={date1} onChange={e => setDate1(e.target.value)} required className="w-full border rounded p-2 text-sm outline-none focus:ring-[#0D9488]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">CLINIC & PROCEDURE</label>
                    <div className="flex gap-2">
                      <select value={clinic1} onChange={e => setClinic1(e.target.value)} className="w-1/2 border rounded p-2 text-sm outline-none focus:ring-[#0D9488]">
                        <option value="Specialist">Specialist</option>
                        <option value="PIC">PIC Clinic</option>
                      </select>
                      <select value={treatment1} onChange={e => setTreatment1(e.target.value)} className="w-1/2 border rounded p-2 text-sm font-semibold outline-none focus:ring-[#0D9488]">
                        {TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">TIME SLOT</label>
                {renderTimeGrid(time1, setTime1, bookedSlots1)}
              </div>

              {/* APPT 2 */}
              {action === 'followup2' && (
                <div className="p-4 border border-teal-200 bg-teal-50/50 rounded-lg">
                  <h4 className="text-xs font-bold uppercase text-teal-800 mb-3 border-b border-teal-200 pb-1">Second Appointment</h4>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">DATE</label>
                      <input type="date" value={date2} onChange={e => setDate2(e.target.value)} required className="w-full border rounded p-2 text-sm outline-none focus:ring-[#0D9488]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">CLINIC & PROCEDURE</label>
                      <div className="flex gap-2">
                        <select value={clinic2} onChange={e => setClinic2(e.target.value)} className="w-1/2 border rounded p-2 text-sm outline-none focus:ring-[#0D9488]">
                          <option value="Specialist">Specialist</option>
                          <option value="PIC">PIC Clinic</option>
                        </select>
                        <select value={treatment2} onChange={e => setTreatment2(e.target.value)} className="w-1/2 border rounded p-2 text-sm font-semibold outline-none focus:ring-[#0D9488]">
                          {TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">TIME SLOT</label>
                  {renderTimeGrid(time2, setTime2, bookedSlots2)}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Final Discharge Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border rounded p-2 text-sm outline-none focus:ring-[#0D9488]" rows="2" placeholder="Summary of today's visit..."></textarea>
          </div>

          <div className="flex gap-4 mt-6">
            <button type="button" onClick={onClose} className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="w-2/3 bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold py-3 px-4 rounded-lg shadow-md">
              {isSubmitting ? 'Processing...' : 'Complete Visit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}