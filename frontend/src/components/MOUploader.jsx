import { useState } from 'react';

export default function MOUploader({ token }) {
  const [ic, setIc] = useState('');
  const [patient, setPatient] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [fileType, setFileType] = useState('X-Ray');
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // 1. Auto-lookup patient when MO clicks away from IC box
  const handleICBlur = async () => {
    const cleanIC = ic.trim();
    if (cleanIC.length < 5) return;
    
    setIsSearching(true);
    setMessage({ text: '', type: '' });
    setPatient(null);

    try {
      const res = await fetch(`/api/patients/lookup?ic=${cleanIC}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.found) {
        setPatient(data.patient);
      } else {
        setMessage({ text: 'Patient not found. Please submit referral first (Step 1).', type: 'error' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  // 2. Handle File Upload
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!patient || !patient.id || !fileToUpload) return;

    setIsUploading(true);
    setMessage({ text: '', type: '' });

    const formData = new FormData();
    formData.append('patient_id', patient.id); // Uses the ID we just added to the backend!
    formData.append('file_type', fileType);
    formData.append('file', fileToUpload);

    try {
      const response = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }, 
        body: formData // Note: We do NOT set Content-Type for FormData, the browser handles it
      });

      if (response.ok) {
        setMessage({ text: `${fileType} successfully attached to ${patient.name}!`, type: 'success' });
        setFileToUpload(null);
        setIc('');
        setPatient(null);
        document.getElementById('moFileInput').value = '';
      } else {
        setMessage({ text: 'Failed to upload document.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Server error during upload.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-50 text-purple-700 rounded-full flex items-center justify-center font-bold text-xl">
          2
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-[#1E3A8A]">Attach Documents</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">X-Rays & Referrals</p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="flex-1 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Patient IC Number</label>
          <input 
            type="text" 
            value={ic} 
            onChange={(e) => setIc(e.target.value)} 
            onBlur={handleICBlur}
            placeholder="e.g., 901230085521"
            className="w-full border border-gray-300 rounded p-3 text-sm focus:ring-[#0D9488] outline-none transition-all"
            required
          />
          {isSearching && <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase animate-pulse">Searching...</p>}
        </div>

        {patient && (
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-md">
            <p className="text-[10px] font-extrabold uppercase text-emerald-600 mb-1">Patient Verified</p>
            <p className="text-sm font-bold text-gray-800">{patient.name}</p>
          </div>
        )}

        <div className={`transition-opacity ${patient ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <label className="block text-xs font-bold text-gray-700 mb-1 mt-2">Document Type</label>
          <select 
            value={fileType} 
            onChange={(e) => setFileType(e.target.value)} 
            className="w-full border border-gray-300 rounded p-3 text-sm focus:ring-[#0D9488] bg-white outline-none mb-4 font-semibold text-gray-700"
          >
            <option value="X-Ray">X-Ray Image</option>
            <option value="Referral">Referral Letter</option>
            <option value="Bloodtest">Blood Test Results</option>
          </select>

          <input 
            type="file" 
            id="moFileInput" 
            onChange={(e) => setFileToUpload(e.target.files[0])} 
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-[#1E3A8A] hover:file:bg-blue-100 cursor-pointer"
            required 
          />
        </div>

        <div className="mt-auto pt-6">
          {message.text && (
            <div className={`p-3 rounded mb-4 text-sm font-bold ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {message.text}
            </div>
          )}
          <button 
            type="submit" 
            disabled={!patient || !fileToUpload || isUploading} 
            className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors disabled:bg-gray-300"
          >
            {isUploading ? 'Uploading Securely...' : 'Upload Document'}
          </button>
        </div>
      </form>
    </div>
  );
}