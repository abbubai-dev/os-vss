import { useState, useEffect } from 'react';

const TIME_SLOTS = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00'];

export default function NewAppointmentModal({ isOpen, onClose, token, selectedDate, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '', ic_number: '', phone_number: '', gender: 'Male',
    appt_date: selectedDate, appt_time: '', source: 'KPP', treatment: 'MOS', notes: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingIC, setIsCheckingIC] = useState(false);
  const [autoFillSuccess, setAutoFillSuccess] = useState(false);
  const [error, setError] = useState('');
  const [bookedSlots, setBookedSlots] = useState([]); 

  useEffect(() => {
    if (!isOpen) return;
    const fetchBookedSlots = async () => {
      try {
        const response = await fetch(`/api/appointments?date=${formData.appt_date}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setBookedSlots(data.map(appt => appt.appt_time.slice(0, 5)));
        }
      } catch (err) { console.error(err); }
    };
    fetchBookedSlots();
  }, [formData.appt_date, isOpen, token]);

  // NEW: Reset form every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '', ic_number: '', phone_number: '', gender: 'Male',
        appt_date: selectedDate, appt_time: '', source: 'KPP', treatment: 'MOS', notes: ''
      });
      setError('');
      setAutoFillSuccess(false);
    }
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    let { name, value } = e.target;
    
    // 1. Auto-Capitalize Name
    if (name === 'name') value = value.toUpperCase();
    
    setFormData(prev => {
      const updatedData = { ...prev, [name]: value };
      
      // 2. Auto-Detect Gender from Malaysian IC (Last digit: Odd=Male, Even=Female)
      if (name === 'ic_number') {
        const cleanIC = value.replace(/\D/g, ''); // Strip any hyphens
        if (cleanIC.length === 12) {
          const lastDigit = parseInt(cleanIC.substring(11, 12));
          updatedData.gender = (lastDigit % 2 === 0) ? 'Female' : 'Male';
        }
      }
      return updatedData;
    });
  };

  // NEW: Check IC and auto-fill data
  const handleICBlur = async () => {
    const ic = formData.ic_number.trim();
    if (!ic) return;
    
    setIsCheckingIC(true);
    setAutoFillSuccess(false);

    try {
      const response = await fetch(`/api/patients/lookup?ic=${ic}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setFormData(prev => ({
            ...prev,
            name: data.patient.name,
            phone_number: data.patient.phone_number,
            gender: data.patient.gender
          }));
          setAutoFillSuccess(true);
          // Hide success message after 3 seconds
          setTimeout(() => setAutoFillSuccess(false), 3000);
        }
      }
    } catch (err) {
      console.error("Lookup failed:", err);
    } finally {
      setIsCheckingIC(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.appt_time) return setError("Please select a valid time slot.");
    
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        onSuccess(); 
        onClose(); 
      } else {
        setError((await response.json()).error || 'Failed to register patient.');
      }
    } catch (err) {
      setError('Server error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-extrabold text-[#1E3A8A]">Register New Patient</h2>
            <p className="text-sm text-gray-500 font-medium">Add to Clinic Queue</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-3xl font-bold leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md text-sm text-red-700 font-bold">{error}</div>}

          <div className="flex justify-between items-end mb-4 border-b pb-2">
             <h3 className="text-xs uppercase text-[#0D9488] font-extrabold tracking-wider">Patient Biodata</h3>
             {isCheckingIC && <span className="text-[10px] text-gray-400 font-bold uppercase animate-pulse">Checking records...</span>}
             {autoFillSuccess && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-bold uppercase border border-emerald-200">Patient Found & Auto-filled!</span>}
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">IC Number <span className="text-gray-400 font-normal ml-1">(Type first to auto-fill)</span></label>
              <input 
                type="text" 
                name="ic_number" 
                required 
                value={formData.ic_number} 
                onChange={handleChange} 
                onBlur={handleICBlur} // <-- Triggers lookup when clicking away
                className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488]" 
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number</label>
              <input type="text" name="phone_number" required value={formData.phone_number} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Gender</label>
              <select name="gender" value={formData.gender} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488] bg-white">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <h3 className="text-xs uppercase text-[#0D9488] font-extrabold tracking-wider mb-4 border-b pb-2">Clinical Details</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Target Date</label>
              <input type="date" name="appt_date" required value={formData.appt_date} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488]" />
            </div>

            {/* ---> NEW: Referral Source <--- */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Referral Source</label>
              <select name="source" value={formData.source} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488] bg-white">
                <option value="KPP">KPP</option>
                <option value="KPPR">KPPR</option>
                <option value="KPM">KPM</option>
                <option value="KPSS">KPSS</option>
                <option value="KPKK">KPKK</option>
                <option value="ED">ED (Oncall)</option>
                <option value="Hosp. Taiping">Hosp.Taiping</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Treatment</label>
              <select name="treatment" value={formData.treatment} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488] bg-white">
                <option value="MOS">MOS</option>
                <option value="Review">Review</option>
                <option value="HPE">HPE</option>
                <option value="Others">Others</option>
              </select>
            </div>
            
            <div className="col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2">
              <label className="block text-xs font-bold text-gray-700 mb-2">Select Available Time Slot</label>
              <div className="grid grid-cols-4 gap-2">
                {TIME_SLOTS.map(slot => {
                  const isBooked = bookedSlots.includes(slot);
                  const isSelected = formData.appt_time === slot;
                  return (
                    <button
                      type="button" key={slot} disabled={isBooked}
                      onClick={() => setFormData({ ...formData, appt_time: slot })}
                      className={`py-2 px-1 text-xs font-bold rounded border transition-colors ${
                        isBooked ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed' :
                        isSelected ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-md' :
                        'bg-white text-gray-700 border-gray-300 hover:border-[#0D9488] hover:text-[#0D9488]'
                      }`}
                    >
                      {isBooked ? 'Full' : slot}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">Initial Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488]" rows="2"></textarea>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button type="button" onClick={onClose} className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="w-2/3 bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold py-3 px-4 rounded-lg shadow-md disabled:bg-gray-400">
              {isSubmitting ? 'Registering...' : 'Register & Schedule Visit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}