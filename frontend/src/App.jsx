import { useState, useEffect } from 'react';
import Login from './components/Login';
import Calendar from './components/Calendar';
import NewAppointmentModal from './components/NewAppointmentModal';
import PatientSearchModal from './components/PatientSearchModal';
import osvssLogo from './assets/OSVSS-logo.png';
import CBCTUploader from './components/cbct/CBCTUploader';
import CBCTViewerButton from './components/cbct/CBCTViewerButton';
import TriageInboxModal from './components/TriageInboxModal';
import KPIReportModal from './components/KPIReportModal';
import MOUploader from './components/MOUploader';
import CheckoutModal from './components/CheckoutModal'; // <--- NEW IMPORT
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', 
  '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00'
];

const getAgeFromIC = (ic) => {
  if (!ic) return '';
  const cleanIC = ic.replace(/\D/g, '');
  if (cleanIC.length !== 12) return '';

  let year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  const currentYear = new Date().getFullYear();
  year += (year > currentYear % 100) ? 1900 : 2000;

  const dob = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
    age--;
  }
  return `${age} y/o`;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [userRole, setUserRole] = useState(localStorage.getItem('role')); 
  const [queueFilter, setQueueFilter] = useState('All'); 
  
  useEffect(() => {
    setUserRole(localStorage.getItem('role'));
  }, [token]);
  
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState('2026-07-07');
  const [refreshKey, setRefreshKey] = useState(0); 
  
  const [isNewApptModalOpen, setIsNewApptModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isTriageModalOpen, setIsTriageModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false); // <--- NEW STATE

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [attachments, setAttachments] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [fileType, setFileType] = useState('X-Ray');
  const [isUploading, setIsUploading] = useState(false);
  
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [rescheduleClinic, setRescheduleClinic] = useState('Specialist');
  const [bookedSlots, setBookedSlots] = useState([]);

  // Editable Clinical States
  const [isEditingClinical, setIsEditingClinical] = useState(false);
  const [editNoteValue, setEditNoteValue] = useState('');
  const [editTreatmentValue, setEditTreatmentValue] = useState('');

  const getAuthHeaders = (json = true) => {
    const headers = { 'Authorization': `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken(null);
    setUserRole(null);
  };

  useEffect(() => {
    if (!token) return;
    const fetchAppointments = async () => {
      try {
        const response = await fetch(`/api/appointments?date=${selectedDate}`, { headers: getAuthHeaders() });
        if (response.ok) {
          setAppointments(await response.json());
        } else if (response.status === 401) {
          handleLogout();
        }
      } catch (error) { console.error(error); }
    };
    fetchAppointments();
  }, [selectedDate, refreshKey, token]);

  useEffect(() => {
    if (!isDrawerOpen || !nextDate) return;
    const fetchBookedSlots = async () => {
      try {
        const response = await fetch(`/api/appointments?date=${nextDate}`, { headers: getAuthHeaders() });
        if (response.ok) {
          const data = await response.json();
          setBookedSlots(data.map(appt => appt.appt_time.slice(0, 5)));
        }
      } catch (err) { console.error(err); }
    };
    fetchBookedSlots();
  }, [nextDate, isDrawerOpen, refreshKey, token]);

  const openPatientDetails = async (patient) => {
    setSelectedPatient(patient);
    setAttachments([]); 
    setIsRescheduling(false);
    setNextTime('');
    setNextDate('');
    
    // Setup Editable Clinical Details
    setIsEditingClinical(false);
    setEditNoteValue(patient.notes || '');
    setEditTreatmentValue(patient.treatment || 'CONSULTATION');
    setIsDrawerOpen(true);
    
    try {
      const response = await fetch(`/api/attachments/${patient.patient_id}`, { headers: getAuthHeaders() });
      if (response.ok) {
        const result = await response.json();
        setAttachments(result.data);
      }
    } catch (error) { console.error(error); }
  };

  const handleCheckIn = async (appointmentId) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/checkin`, { method: 'PATCH', headers: getAuthHeaders() });
      if (response.ok) {
        setRefreshKey(old => old + 1); 
        setSelectedPatient(prev => ({...prev, status: 'Checked-In'})); 
      }
    } catch (error) { console.error(error); }
  };

  // ---> UPDATED: Now saves BOTH Notes and Treatment! <---
  const handleSaveClinicalDetails = async () => {
    try {
      const response = await fetch(`/api/appointments/${selectedPatient.id}/notes`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ notes: editNoteValue, treatment: editTreatmentValue })
      });
      if (response.ok) {
        setSelectedPatient(prev => ({...prev, notes: editNoteValue, treatment: editTreatmentValue}));
        setRefreshKey(old => old + 1); 
        setIsEditingClinical(false);
      }
    } catch (error) {
      console.error("Failed to update clinical details", error);
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!nextDate || !nextTime) return alert("Please select date and time.");
    
    try {
      const response = await fetch(`/api/appointments/${selectedPatient.id}/reschedule`, {
        method: 'PATCH', 
        headers: getAuthHeaders(), 
        body: JSON.stringify({ new_date: nextDate, new_time: nextTime, assigned_to: rescheduleClinic })
      });
      
      if (response.ok) {
        setRefreshKey(old => old + 1);
        setIsDrawerOpen(false); 
      } else {
        alert("Failed to reschedule.");
      }
    } catch (error) { console.error(error); }
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
    } catch (error) { console.error(error); } finally { setIsUploading(false); }
  };

  const handleDelete = async (e, appointmentId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this patient from the schedule?")) return;
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/delete`, { method: 'PATCH', headers: getAuthHeaders() });
      if (response.ok) setRefreshKey(old => old + 1); 
    } catch (error) { console.error(error); }
  };

  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const dateObj = new Date(selectedDate);
    const formattedDate = dateObj.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);
    doc.text('Oral Surgery Clinic - Daily Schedule', 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Hospital Kuala Kangsar | Date: ${formattedDate}`, 14, 28);

    const tableColumn = ["Masa", "Nama", "No IC", "Type", "Rawatan", "Catatan"];
    const tableRows = appointments.map(appt => [appt.appt_time.slice(0, 5), appt.name, appt.ic_number, appt.patient_type, appt.treatment, ""]);

    autoTable(doc, {
      startY: 35, head: [tableColumn], body: tableRows, theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 4, textColor: 20 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 15, fontStyle: 'bold' }, 1: { cellWidth: 60 }, 2: { cellWidth: 35 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20 }, 5: { cellWidth: 20 } }
    });
    window.open(doc.output('bloburl'), '_blank');
  };

  const renderTimeGrid = () => (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {TIME_SLOTS.map(slot => {
        const isBooked = bookedSlots.includes(slot);
        const isSelected = nextTime === slot;
        return (
          <button
            type="button" key={slot} disabled={isBooked} onClick={() => setNextTime(slot)}
            className={`py-2 px-1 text-xs font-bold rounded border transition-colors ${
              isBooked ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed' :
              isSelected ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:border-[#0D9488]'
            }`}
          >
            {isBooked ? 'Full' : slot}
          </button>
        )
      })}
    </div>
  );

  const filteredAppointments = appointments.filter(appt => {
    if (userRole === 'specialist') return appt.assigned_to === 'Specialist';
    if (queueFilter === 'PIC') return appt.assigned_to === 'PIC';
    if (queueFilter === 'Specialist') return appt.assigned_to === 'Specialist';
    return true; 
  });

  if (!token) return <Login setToken={setToken} setUserRole={setUserRole} />;

  return (
    <div className="min-h-screen bg-slate-50 p-8 relative font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-4">
             <img src={osvssLogo} alt="OSVSS" className="h-12 w-auto object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-[#1E3A8A]">Clinic Dashboard</h1>
              <p className="text-gray-500 font-medium">Hospital Kuala Kangsar</p>
            </div>
          </div>
          
          <div className="flex gap-4 items-center">
            {userRole !== 'mo' && (
              <>
                <button onClick={handleGeneratePDF} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-md shadow-sm border border-slate-300 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  Print List
                </button>
                {userRole !== 'specialist' && (
                  <button onClick={() => setIsReportModalOpen(true)} className="bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold py-2 px-4 rounded-md shadow-sm border border-purple-200 transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Reports
                  </button>
                )}
                {userRole !== 'specialist' && (
                  <button onClick={() => setIsTriageModalOpen(true)} className="bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2 px-4 rounded-md shadow-sm border border-red-200 transition-colors flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                    Triage Inbox
                  </button>
                )}
                <button onClick={() => setIsSearchModalOpen(true)} className="bg-white hover:bg-gray-50 text-[#1E3A8A] font-bold py-2 px-4 rounded-md shadow-sm border border-gray-200 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  Search
                </button>
                <button onClick={() => setIsNewApptModalOpen(true)} className="bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md shadow-sm transition-colors flex items-center gap-2">
                  <span className="text-lg leading-none">+</span> New Patient
                </button>
              </>
            )}
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 font-semibold px-3 py-2 transition-colors border border-transparent hover:border-red-200 rounded-md hover:bg-red-50">
              Log Out
            </button>
          </div>
        </header>

        {userRole === 'mo' ? (
          <div className="max-w-5xl mx-auto mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center flex flex-col justify-center h-full">
              <div className="w-16 h-16 bg-teal-50 text-[#0D9488] rounded-full flex items-center justify-center mx-auto mb-6">
                 <span className="text-2xl font-bold">1</span>
              </div>
              <h2 className="text-2xl font-extrabold text-[#1E3A8A] mb-2">New Referral</h2>
              <p className="text-gray-500 font-medium mb-8 text-sm">Submit urgent referrals directly to the Hospital Kuala Kangsar Oral Surgery Triage Inbox.</p>
              <button onClick={() => setIsNewApptModalOpen(true)} className="bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-4 px-8 rounded-lg shadow-md transition-colors text-lg inline-flex items-center justify-center gap-3 w-full">
                <span className="text-2xl leading-none">+</span> Submit New Referral
              </button>
            </div>
            <MOUploader token={token} />
          </div>
        ) : (
          <>
        <Calendar selectedDate={selectedDate} setSelectedDate={setSelectedDate} token={token} refreshKey={refreshKey} />

        {userRole !== 'specialist' && (
          <div className="flex bg-slate-100 p-1 rounded-lg w-fit mb-4 border border-slate-200">
            <button onClick={() => setQueueFilter('All')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${queueFilter === 'All' ? 'bg-white text-[#1E3A8A] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>All Patients</button>
            <button onClick={() => setQueueFilter('PIC')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${queueFilter === 'PIC' ? 'bg-white text-[#0D9488] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>PIC Clinic</button>
            <button onClick={() => setQueueFilter('Specialist')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${queueFilter === 'Specialist' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Specialist Visit</button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-100 border-b border-gray-200 text-slate-700">
              <tr>
                <th className="p-4 font-bold">Time</th>
                <th className="p-4 font-bold">Patient Name</th>
                <th className="p-4 font-bold">IC Number</th>
                <th className="p-4 font-bold">Source</th>
                <th className="p-4 font-bold">Management</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Status</th>
                {userRole === 'admin' && <th className="p-4 font-bold text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAppointments.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-500 font-medium">No patients scheduled for this view.</td></tr>
              ) : (
                filteredAppointments.map(appt => (
                  <tr key={appt.id} onClick={() => openPatientDetails(appt)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="p-4 font-bold text-gray-800">{appt.appt_time.slice(0, 5)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {appt.has_attachments && (
                          <svg className="w-4 h-4 text-[#0D9488]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                        )}
                        <span className="text-gray-800 font-bold">{appt.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-500 font-medium text-sm flex flex-col items-start gap-1">
                      {appt.ic_number}
                      {userRole !== 'specialist' && appt.assigned_to && appt.assigned_to !== 'Unassigned' && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${appt.assigned_to === 'Specialist' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-[#0D9488]'}`}>
                          {appt.assigned_to}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-gray-600 font-semibold">{appt.source}</td>
                    <td className="p-4 text-gray-600">{appt.treatment}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${appt.patient_type === 'Baru' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{appt.patient_type}</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                        appt.status === 'Checked-In' ? 'bg-[#0D9488] text-white' : 
                        appt.status === 'Discharged' ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-800'
                      }`}>{appt.status}</span>
                    </td>
                    {userRole === 'admin' && (
                      <td className="p-4 text-center">
                        <button onClick={(e) => handleDelete(e, appt.id)} className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>

      {isDrawerOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity" onClick={() => setIsDrawerOpen(false)}></div>}

      <div className={`fixed top-0 right-0 h-full w-125 bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedPatient && (
          <>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-extrabold text-[#1E3A8A]">Patient Profile</h2>
              <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-red-500 font-bold text-2xl">&times;</button>
            </div>
            
            <div className="p-6 grow overflow-y-auto">
              
              <div className="mb-6">
                <h3 className="text-xs uppercase text-gray-400 font-bold mb-2 tracking-wider">Biodata</h3>
                <p className="text-xl font-extrabold text-gray-800">{selectedPatient.name}</p>
                <p className="text-gray-600 font-medium mt-1">IC: {selectedPatient.ic_number} | {selectedPatient.gender} | <span className="text-[#0D9488] font-bold">{getAgeFromIC(selectedPatient.ic_number)}</span></p>
                <p className="text-gray-600 font-medium">Phone: {selectedPatient.phone_number}</p>
              </div>

              {/* ---> UPDATED: Editable Clinical Notes & Treatment! <--- */}
              <div className="mb-8 p-5 bg-white border border-gray-200 rounded-lg shadow-sm relative">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xs uppercase text-[#0D9488] font-extrabold tracking-wider">Referral & Notes</h3>
                  {!isEditingClinical && (
                    <button onClick={() => setIsEditingClinical(true)} className="text-gray-400 hover:text-[#0D9488] transition-colors p-1 bg-slate-50 rounded" title="Edit Details">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                  )}
                </div>

                {isEditingClinical ? (
                  <div className="bg-slate-50 p-4 rounded-md border border-slate-200 flex flex-col gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Procedure / Management</label>
                      <select 
                        value={editTreatmentValue} 
                        onChange={(e) => setEditTreatmentValue(e.target.value)}
                        className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-[#0D9488] bg-white mt-1 outline-none font-semibold"
                      >
                        <option value="CONSULTATION">Consultation</option>
                        <option value="SCALING">Scaling</option>
                        <option value="FILLING">Filling</option>
                        <option value="BIOPSY">Biopsy</option>
                        <option value="I&D">I&D</option>
                        <option value="MOS">MOS</option>
                        <option value="REVIEW">Review</option>
                        <option value="HPE">HPE</option>
                        <option value="OTHERS">Others</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Clinical Notes</label>
                      <textarea 
                        value={editNoteValue} 
                        onChange={(e) => setEditNoteValue(e.target.value)}
                        className="w-full text-sm p-2 border border-gray-300 rounded focus:ring-[#0D9488] bg-white mt-1 outline-none"
                        rows="2"
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => { setIsEditingClinical(false); setEditNoteValue(selectedPatient.notes || ''); setEditTreatmentValue(selectedPatient.treatment || 'CONSULTATION'); }} className="text-xs font-bold text-gray-500 hover:text-gray-700 py-1 px-2">Cancel</button>
                      <button onClick={handleSaveClinicalDetails} className="text-xs font-bold bg-[#0D9488] text-white py-1.5 px-4 rounded hover:bg-teal-700 shadow-sm">Save Changes</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">Source</p>
                      <p className="font-extrabold text-[#1E3A8A]">{selectedPatient.source}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">Management</p>
                      <p className="font-extrabold text-[#1E3A8A]">{selectedPatient.treatment}</p>
                    </div>
                    <div className="col-span-2 mt-2 pt-3 border-t border-gray-100">
                      <p className="text-gray-500 font-bold text-[10px] uppercase tracking-wider mb-2">Initial Notes</p>
                      <p className="text-gray-700 text-sm font-medium italic bg-slate-50 p-3 rounded-md border border-slate-200">
                        {selectedPatient.notes ? `"${selectedPatient.notes}"` : "No notes provided."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-200">
                 <h3 className="text-xs uppercase text-slate-500 font-bold mb-3 tracking-wider">Visit Status: {selectedPatient.status}</h3>
                 
                 {selectedPatient.status === 'Scheduled' && !isRescheduling && (
                   <div className="flex gap-2">
                     <button onClick={() => handleCheckIn(selectedPatient.id)} className="w-2/3 bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-3 px-4 rounded shadow-md transition-colors">Check-In</button>
                     <button onClick={() => setIsRescheduling(true)} className="w-1/3 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold py-3 px-4 rounded shadow-sm transition-colors">Reschedule</button>
                   </div>
                 )}

                 {isRescheduling && (
                   <form onSubmit={handleReschedule} className="mt-4 p-4 border border-blue-200 bg-white rounded-lg shadow-inner">
                     <h4 className="text-sm font-bold text-[#1E3A8A] mb-3">Reschedule Appointment</h4>
                     <label className="block text-xs font-bold text-gray-700 mb-1">Select New Date</label>
                     <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mb-3 focus:ring-[#0D9488]" required />
                     <label className="block text-xs font-bold text-gray-700 mb-1">Select Available Time</label>
                     {renderTimeGrid()}
                     <div className="mt-4">
                       <label className="block text-xs font-bold text-gray-700 mb-1">Target Clinic</label>
                       <select value={rescheduleClinic} onChange={(e) => setRescheduleClinic(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-[#0D9488] bg-white outline-none">
                         <option value="Specialist">Specialist Clinic</option>
                         <option value="PIC">PIC Clinic (Medical Officer)</option>
                       </select>
                     </div>
                     <div className="flex gap-2 mt-4">
                       <button type="button" onClick={() => setIsRescheduling(false)} className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 rounded">Cancel</button>
                       <button type="submit" className="w-2/3 bg-[#1E3A8A] text-white font-bold py-2 rounded shadow-md hover:bg-blue-900">Confirm Shift</button>
                     </div>
                   </form>
                 )}

                 {selectedPatient.status === 'Discharged' && <p className="text-sm text-gray-500 italic font-medium">This visit is completed and locked.</p>}
              </div>

              {/* ---> UPDATED: The new Checkout Button <--- */}
              {selectedPatient.status === 'Checked-In' && (
                <div className="mb-8">
                  <button 
                    onClick={() => setIsCheckoutModalOpen(true)}
                    className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold py-4 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2"
                  >
                    Proceed to Checkout
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </button>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xs uppercase text-gray-400 font-bold mb-3 tracking-wider">Documents</h3>
                <form onSubmit={handleUpload} className="flex flex-col gap-2 mb-3 p-4 border-2 border-dashed border-gray-200 rounded-lg bg-slate-50">
                  <div className="flex gap-2">
                    <select value={fileType} onChange={(e) => setFileType(e.target.value)} className="border border-gray-300 rounded p-2 text-sm bg-white font-semibold">
                      <option value="X-Ray">X-Ray</option>
                      <option value="Referral">Referral</option>
                      <option value="Clinical">Clinical</option>
                    </select>
                    <input type="file" id="fileInput" onChange={(e) => setFileToUpload(e.target.files[0])} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-[#1E3A8A] hover:file:bg-blue-100" />
                  </div>
                  <button type="submit" disabled={!fileToUpload || isUploading} className="bg-slate-800 text-white font-bold py-2 rounded text-sm disabled:bg-gray-400 mt-2">
                    {isUploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </form>

                <div className="mb-5">
                  <CBCTUploader 
                    patientId={selectedPatient.patient_id} token={token} 
                    onUploadSuccess={() => {
                      fetch(`/api/attachments/${selectedPatient.patient_id}`, { headers: getAuthHeaders() })
                        .then(res => res.json()).then(result => setAttachments(result.data)).catch(err => console.error(err));
                    }} 
                  />
                </div>
                
                <ul className="space-y-3">
                  {attachments.map(file => (
                    <li key={file.id} className="flex justify-between items-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div>
                        <span className="text-[10px] font-extrabold text-[#0D9488] block uppercase tracking-wider mb-1">{file.file_type}</span>
                        <span className="text-sm font-semibold text-gray-700">{file.file_name || 'Attached File'}</span>
                      </div>
                      {file.file_type === 'CBCT_ZIP' ? (
                        <CBCTViewerButton fileKey={file.file_path || file.file_url} token={token} />
                      ) : (
                        <a href={file.file_url} target="_blank" rel="noreferrer" className="text-[#1E3A8A] text-sm font-bold bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100">View</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      {/* --- MODALS --- */}
      <NewAppointmentModal isOpen={isNewApptModalOpen} onClose={() => setIsNewApptModalOpen(false)} token={token} selectedDate={selectedDate} onSuccess={() => setRefreshKey(old => old + 1)} userRole={userRole} />
      <PatientSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} token={token} />
      <TriageInboxModal isOpen={isTriageModalOpen} onClose={() => setIsTriageModalOpen(false)} token={token} onRouteSuccess={() => { setIsTriageModalOpen(false); setRefreshKey(old => old + 1); }} />
      <KPIReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} token={token} />
      <CheckoutModal isOpen={isCheckoutModalOpen} onClose={() => setIsCheckoutModalOpen(false)} patient={selectedPatient} token={token} onSuccess={() => { setIsDrawerOpen(false); setRefreshKey(old => old + 1); }} />
      
    </div>
  );
}

export default App;