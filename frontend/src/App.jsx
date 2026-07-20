import { useState, useEffect } from 'react';
import Login from './components/Login';
import Calendar from './components/Calendar';
import NewAppointmentModal from './components/NewAppointmentModal';
import PatientSearchModal from './components/PatientSearchModal';
import osvssLogo from './assets/OSVSS-logo.png';

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', 
  '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00'
];

// Utility: Extract Age from Malaysian IC Number
const getAgeFromIC = (ic) => {
  if (!ic) return '';
  const cleanIC = ic.replace(/\D/g, '');
  if (cleanIC.length !== 12) return '';

  let year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  // If YY is greater than current year's last 2 digits, they were born in 1900s
  const currentYear = new Date().getFullYear();
  year += (year > currentYear % 100) ? 1900 : 2000;

  const dob = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  
  // Adjust if they haven't had their birthday yet this year
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
    age--;
  }
  return `${age} y/o`;
};

function App() {
  // Authentication State
  const [token, setToken] = useState(localStorage.getItem('token'));

  //User role State
  const [userRole] = useState(localStorage.getItem('role'));
  
  // Dashboard States
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState('2026-07-07');
  const [refreshKey, setRefreshKey] = useState(0); 
  
  // Modals States
  const [isNewApptModalOpen, setIsNewApptModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Drawer & Patient States
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Attachments States
  const [attachments, setAttachments] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [fileType, setFileType] = useState('X-Ray');
  const [isUploading, setIsUploading] = useState(false);
  
  // Checkout & Reschedule States
  const [checkoutAction, setCheckoutAction] = useState('discharge');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [nextDate, setNextDate] = useState('2026-07-21');
  const [nextTime, setNextTime] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [bookedSlots, setBookedSlots] = useState([]); 

  const getAuthHeaders = (json = true) => {
    const headers = { 'Authorization': `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken(null);
  };

  // 1. Fetch Main Queue
  useEffect(() => {
    if (!token) return;
    const fetchAppointments = async () => {
      try {
        const response = await fetch(`/api/appointments?date=${selectedDate}`, { 
          headers: getAuthHeaders() 
        });
        if (response.ok) {
          setAppointments(await response.json());
        } else if (response.status === 401) {
          handleLogout();
        }
      } catch (error) { 
        console.error(error); 
      }
    };
    fetchAppointments();
  }, [selectedDate, refreshKey, token]);

  // 2. Fetch Slots for Smart Grid (Reschedule & Followup UI)
  useEffect(() => {
    if (!isDrawerOpen) return;
    const fetchBookedSlots = async () => {
      try {
        const response = await fetch(`/api/appointments?date=${nextDate}`, { 
          headers: getAuthHeaders() 
        });
        if (response.ok) {
          const data = await response.json();
          setBookedSlots(data.map(appt => appt.appt_time.slice(0, 5)));
        }
      } catch (err) { 
        console.error(err); 
      }
    };
    fetchBookedSlots();
  }, [nextDate, isDrawerOpen, refreshKey, token]);

  // 3. Open Drawer & Fetch Attachments
  const openPatientDetails = async (patient) => {
    setSelectedPatient(patient);
    setAttachments([]); 
    setCheckoutAction('discharge');
    setIsRescheduling(false);
    setNextTime('');
    setCheckoutNotes('');
    setIsDrawerOpen(true);
    
    try {
      const response = await fetch(`/api/attachments/${patient.patient_id}`, { 
        headers: getAuthHeaders() 
      });
      if (response.ok) {
        const result = await response.json();
        setAttachments(result.data);
      }
    } catch (error) { 
      console.error(error); 
    }
  };

  // 4. API Handlers
  const handleCheckIn = async (appointmentId) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/checkin`, { 
        method: 'PATCH', 
        headers: getAuthHeaders() 
      });
      if (response.ok) {
        setRefreshKey(old => old + 1); 
        setSelectedPatient(prev => ({...prev, status: 'Checked-In'})); 
      }
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!nextTime) return alert("Select a time slot.");
    try {
      const response = await fetch(`/api/appointments/${selectedPatient.id}/reschedule`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ new_date: nextDate, new_time: nextTime })
      });
      if (response.ok) {
        setRefreshKey(old => old + 1);
        setIsRescheduling(false);
        setIsDrawerOpen(false);
      }
    } catch (err) { 
      console.error(err); 
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (checkoutAction === 'followup' && !nextTime) {
      return alert("Select a time slot for follow-up.");
    }

    const payload = { 
      status: 'Discharged', 
      notes: checkoutNotes 
    };

    if (checkoutAction === 'followup') {
      payload.next_appt_date = nextDate;
      payload.next_appt_time = nextTime;
    }

    try {
      const response = await fetch(`/api/appointments/${selectedPatient.id}/checkout`, {
        method: 'PATCH', 
        headers: getAuthHeaders(), 
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setRefreshKey(old => old + 1);
        setIsDrawerOpen(false); 
      }
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileToUpload || !selectedPatient) return;
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('patient_id', selectedPatient.patient_id);
    formData.append('file_type', fileType);
    formData.append('file', fileToUpload);
    
    try {
      const response = await fetch('/api/attachments/upload', { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}` }, 
        body: formData 
      });
      if (response.ok) {
        const result = await response.json();
        setAttachments([result.data, ...attachments]); 
        setFileToUpload(null); 
        document.getElementById('fileInput').value = ""; 
      }
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsUploading(false); 
    }
  };

  const handleDelete = async (e, appointmentId) => {
    e.stopPropagation(); // Prevents the sliding drawer from opening when clicking the trash can!
    
    if (!window.confirm("Are you sure you want to delete this patient from the schedule?")) return;
    
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/delete`, { 
        method: 'PATCH', 
        headers: getAuthHeaders() 
      });
      if (response.ok) {
        setRefreshKey(old => old + 1); // Refresh the table
      }
    } catch (error) { 
      console.error("Delete failed:", error); 
    }
  };

  // 5. Reusable Component for Rendering Time Slots
  const renderTimeGrid = () => (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {TIME_SLOTS.map(slot => {
        const isBooked = bookedSlots.includes(slot);
        const isSelected = nextTime === slot;
        return (
          <button
            type="button" 
            key={slot} 
            disabled={isBooked}
            onClick={() => setNextTime(slot)}
            className={`py-2 px-1 text-xs font-bold rounded border transition-colors ${
              isBooked 
                ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed' :
              isSelected 
                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-md' :
              'bg-white text-gray-700 border-gray-300 hover:border-[#0D9488]'
            }`}
          >
            {isBooked ? 'Full' : slot}
          </button>
        )
      })}
    </div>
  );

  // Authentication Check
  if (!token) return <Login setToken={setToken} />;

  return (
    <div className="min-h-screen bg-slate-50 p-8 relative font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* --- HEADER --- */}
        <header className="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-4">
             <img 
               src={osvssLogo} 
               alt="OSVSS" 
               className="h-12 w-auto object-contain" 
             />
            <div>
              <h1 className="text-2xl font-bold text-[#1E3A8A]">Clinic Dashboard</h1>
              <p className="text-gray-500 font-medium">Hospital Kuala Kangsar</p>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <button 
              onClick={() => setIsSearchModalOpen(true)} 
              className="bg-white hover:bg-gray-50 text-[#1E3A8A] font-bold py-2 px-4 rounded-md shadow-sm border border-gray-200 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search
            </button>
            <button 
              onClick={() => setIsNewApptModalOpen(true)} 
              className="bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md shadow-sm transition-colors flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> New Patient
            </button>
            <button 
              onClick={handleLogout} 
              className="text-gray-500 hover:text-red-600 font-semibold px-3 py-2 transition-colors border border-transparent hover:border-red-200 rounded-md hover:bg-red-50"
            >
              Log Out
            </button>
          </div>
        </header>

        {/* --- CALENDAR COMPONENT --- */}
        <Calendar 
          selectedDate={selectedDate} 
          setSelectedDate={setSelectedDate} 
          token={token} 
          refreshKey={refreshKey} 
        />

        {/* --- QUEUE LEDGER TABLE --- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-100 border-b border-gray-200 text-slate-700">
              <tr>
                <th className="p-4 font-bold">Time</th>
                <th className="p-4 font-bold">Patient Name</th>
                <th className="p-4 font-bold">IC Number</th>
                <th className="p-4 font-bold">Source</th>
                <th className="p-4 font-bold">Treatment</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Status</th>
                {/* NEW ACTION HEADER */}
                {userRole === 'admin' && <th className="p-4 font-bold text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500 font-medium">
                    No appointments scheduled for this date.
                  </td>
                </tr>
              ) : (
                appointments.map((appt) => (
                  <tr 
                    key={appt.id} 
                    onClick={() => openPatientDetails(appt)} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-bold text-gray-800">{appt.appt_time.slice(0, 5)}</td>
                    <td className="p-4 text-gray-800 font-bold">{appt.name}</td>
                    <td className="p-4 text-gray-600">{appt.ic_number}</td>
                    <td className="p-4 text-gray-600 font-semibold">{appt.source}</td>
                    <td className="p-4 text-gray-600">{appt.treatment}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${appt.patient_type === 'Baru' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {appt.patient_type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                        appt.status === 'Checked-In' ? 'bg-[#0D9488] text-white' : 
                        appt.status === 'Discharged' ? 'bg-gray-200 text-gray-700' : 
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {appt.status}
                      </span>
                    </td>
                    {/* NEW ACTION BUTTON */}
                    {userRole === 'admin' && (
                      <td className="p-4 text-center">
                        <button 
                          onClick={(e) => handleDelete(e, appt.id)} 
                          className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                          title="Remove Patient"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- SLIDING DRAWER BACKGROUND OVERLAY --- */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity" 
          onClick={() => setIsDrawerOpen(false)}
        ></div>
      )}

      {/* --- SLIDING DRAWER PANEL --- */}
      <div className={`fixed top-0 right-0 h-full w-125 bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedPatient && (
          <>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-extrabold text-[#1E3A8A]">Patient Profile</h2>
              <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-red-500 font-bold text-2xl">&times;</button>
            </div>
            
            <div className="p-6 grow overflow-y-auto">
              
              {/* Drawer: Biodata */}
              <div className="mb-6">
                <h3 className="text-xs uppercase text-gray-400 font-bold mb-2 tracking-wider">Biodata</h3>
                <p className="text-xl font-extrabold text-gray-800">{selectedPatient.name}</p>
                <p className="text-gray-600 font-medium mt-1">
                  IC: {selectedPatient.ic_number} | {selectedPatient.gender} | <span className="text-[#0D9488] font-bold">{getAgeFromIC(selectedPatient.ic_number)}</span>
                </p>
                <p className="text-gray-600 font-medium">Phone: {selectedPatient.phone_number}</p>
              </div>

              {/* Drawer: Referral & Notes */}
              <div className="mb-8 p-5 bg-white border border-gray-200 rounded-lg shadow-sm">
                <h3 className="text-xs uppercase text-[#0D9488] font-extrabold mb-3 tracking-wider">Referral & Notes</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">Source</p>
                    <p className="font-extrabold text-[#1E3A8A]">{selectedPatient.source}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">Treatment</p>
                    <p className="font-extrabold text-[#1E3A8A]">{selectedPatient.treatment}</p>
                  </div>
                  <div className="col-span-2 mt-2 pt-3 border-t border-gray-100">
                    <p className="text-gray-500 font-bold text-[10px] uppercase tracking-wider mb-2">Initial Notes</p>
                    <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                      <p className="text-gray-700 font-medium italic">
                        {selectedPatient.notes ? `"${selectedPatient.notes}"` : "No notes provided."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer: Status Action & Reschedule UI */}
              <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
                 <h3 className="text-xs uppercase text-slate-500 font-bold mb-3 tracking-wider">
                   Visit Status: {selectedPatient.status}
                 </h3>
                 
                 {selectedPatient.status === 'Scheduled' && !isRescheduling && (
                   <div className="flex gap-2">
                     <button 
                       onClick={() => handleCheckIn(selectedPatient.id)} 
                       className="w-2/3 bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-3 px-4 rounded shadow-md transition-colors"
                     >
                       Check-In
                     </button>
                     <button 
                       onClick={() => setIsRescheduling(true)} 
                       className="w-1/3 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold py-3 px-4 rounded shadow-sm transition-colors"
                     >
                       Reschedule
                     </button>
                   </div>
                 )}

                 {/* Reschedule Form */}
                 {isRescheduling && (
                   <form onSubmit={handleReschedule} className="mt-4 p-4 border border-blue-200 bg-white rounded-lg shadow-inner">
                     <h4 className="text-sm font-bold text-[#1E3A8A] mb-3">Reschedule Appointment</h4>
                     <label className="block text-xs font-bold text-gray-700 mb-1">Select New Date</label>
                     <input 
                       type="date" 
                       value={nextDate} 
                       onChange={(e) => setNextDate(e.target.value)} 
                       className="w-full border border-gray-300 rounded p-2 text-sm mb-3 focus:ring-[#0D9488]" 
                       required 
                     />
                     
                     <label className="block text-xs font-bold text-gray-700 mb-1">Select Available Time</label>
                     {renderTimeGrid()}
                     
                     <div className="flex gap-2 mt-4">
                       <button 
                         type="button" 
                         onClick={() => setIsRescheduling(false)} 
                         className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 rounded"
                       >
                         Cancel
                       </button>
                       <button 
                         type="submit" 
                         className="w-2/3 bg-[#1E3A8A] text-white font-bold py-2 rounded shadow-md hover:bg-blue-900"
                       >
                         Confirm Shift
                       </button>
                     </div>
                   </form>
                 )}

                 {selectedPatient.status === 'Discharged' && (
                   <p className="text-sm text-gray-500 italic font-medium">This visit is completed and locked.</p>
                 )}
              </div>

              {/* Drawer: Checkout Form */}
              {selectedPatient.status === 'Checked-In' && (
                <div className="mb-8 p-5 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                  <h3 className="text-xs uppercase text-[#1E3A8A] font-bold mb-4 tracking-wider">Complete Visit</h3>
                  <form onSubmit={handleCheckout} className="flex flex-col gap-4">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-800 font-bold cursor-pointer">
                        <input 
                          type="radio" 
                          name="checkoutAction" 
                          value="discharge" 
                          checked={checkoutAction === 'discharge'} 
                          onChange={() => setCheckoutAction('discharge')} 
                          className="accent-[#1E3A8A]" 
                        />
                        Discharge Only
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-800 font-bold cursor-pointer">
                        <input 
                          type="radio" 
                          name="checkoutAction" 
                          value="followup" 
                          checked={checkoutAction === 'followup'} 
                          onChange={() => setCheckoutAction('followup')} 
                          className="accent-[#1E3A8A]"
                        />
                        Follow-up
                      </label>
                    </div>

                    {checkoutAction === 'followup' && (
                      <div className="bg-white p-4 rounded-md border border-blue-100 shadow-inner">
                        <label className="block text-xs font-bold text-gray-700 mb-1">Follow-up Date</label>
                        <input 
                          type="date" 
                          value={nextDate} 
                          onChange={(e) => setNextDate(e.target.value)} 
                          className="w-full border border-gray-300 rounded p-2 text-sm mb-3 focus:ring-[#0D9488]" 
                          required 
                        />
                        
                        <label className="block text-xs font-bold text-gray-700 mb-1">Select Available Time</label>
                        {renderTimeGrid()}
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Clinical Notes</label>
                      <textarea 
                        value={checkoutNotes} 
                        onChange={(e) => setCheckoutNotes(e.target.value)} 
                        className="w-full border border-gray-300 rounded p-3 text-sm mt-1 bg-white focus:ring-[#0D9488]" 
                        rows="2"
                      ></textarea>
                    </div>

                    <button 
                      type="submit" 
                      className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold py-3 px-4 rounded shadow-md mt-2"
                    >
                      {checkoutAction === 'followup' ? 'Complete & Book Next Visit' : 'Complete & Discharge'}
                    </button>
                  </form>
                </div>
              )}

              {/* Drawer: Uploads Section */}
              <div className="mb-6">
                <h3 className="text-xs uppercase text-gray-400 font-bold mb-3 tracking-wider">Documents</h3>
                <form onSubmit={handleUpload} className="flex flex-col gap-2 mb-5 p-4 border-2 border-dashed border-gray-200 rounded-lg bg-slate-50">
                  <div className="flex gap-2">
                    <select 
                      value={fileType} 
                      onChange={(e) => setFileType(e.target.value)} 
                      className="border border-gray-300 rounded p-2 text-sm bg-white font-semibold"
                    >
                      <option value="X-Ray">X-Ray</option>
                      <option value="Referral">Referral</option>
                      <option value="Bloodtest">Bloodtest</option>
                    </select>
                    <input 
                      type="file" 
                      id="fileInput" 
                      onChange={(e) => setFileToUpload(e.target.files[0])} 
                      className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-[#1E3A8A] hover:file:bg-blue-100" 
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={!fileToUpload || isUploading} 
                    className="bg-slate-800 text-white font-bold py-2 rounded text-sm disabled:bg-gray-400 mt-2"
                  >
                    {isUploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </form>
                
                <ul className="space-y-3">
                  {attachments.map(file => (
                    <li key={file.id} className="flex justify-between items-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div>
                        <span className="text-[10px] font-extrabold text-[#0D9488] block uppercase tracking-wider mb-1">
                          {file.file_type}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">
                          {file.file_name}
                        </span>
                      </div>
                      <a 
                        href={file.file_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[#1E3A8A] text-sm font-bold bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100"
                      >
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      {/* --- EXTERNAL MODALS --- */}
      <NewAppointmentModal 
        isOpen={isNewApptModalOpen} 
        onClose={() => setIsNewApptModalOpen(false)} 
        token={token} 
        selectedDate={selectedDate} 
        onSuccess={() => setRefreshKey(old => old + 1)} 
      />
      
      <PatientSearchModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
        token={token} 
      />
      
    </div>
  );
}

export default App;