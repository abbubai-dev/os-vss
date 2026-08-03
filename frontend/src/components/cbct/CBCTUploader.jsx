import { useState } from 'react';

export default function CBCTUploader({ patientId, token, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');

  const handleUpload = async () => {
    if (!file) return alert("Please select a ZIP file first.");
    setIsUploading(true);
    setStatus('Generating secure link...');

    try {
      // Step 1: Ask Backend for the R2 Upload URL
      const urlRes = await fetch('/api/storage/upload-url', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          patientId: patientId,
          filename: file.name,
          contentType: file.type || 'application/zip'
        })
      });
      
      const { uploadUrl, fileKey } = await urlRes.json();

      // Step 2: Upload the massive ZIP directly to Cloudflare R2
      setStatus('Uploading to Cloudflare R2... Please wait.');
      const r2Res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/zip'
        }
      });

      if (!r2Res.ok) throw new Error("Failed to upload to R2");

      // Step 3: Save the fileKey to your PostgreSQL database
      setStatus('Saving record to database...');
      const dbRes = await fetch('/api/storage/save-record', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          patient_id: patientId,
          file_path: fileKey,
          file_type: 'CBCT_ZIP',
          file_name: file.name 
        })
      });

      if (dbRes.ok) {
        setStatus('Upload Complete!');
        setFile(null);
        
        // FIX 1: Manually clear the browser's file input text
        document.getElementById('cbctFileInput').value = "";
        
        if (onUploadSuccess) onUploadSuccess();

        // FIX 2: Clear the status message after 3 seconds to reset the UI
        setTimeout(() => {
          setStatus('');
        }, 3000);

      } else {
        throw new Error("Failed to save database record");
      }

    } catch (error) {
      console.error(error);
      setStatus('Upload Failed.');
      // Also clear the error message after 3 seconds
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-slate-50">
      <h3 className="font-bold text-sm mb-2">Upload CBCT Scan (.zip)</h3>
      <input 
        type="file" 
        id="cbctFileInput" // <-- Added an ID here so we can clear it
        accept=".zip" 
        onChange={(e) => setFile(e.target.files[0])} 
        disabled={isUploading}
        className="mb-2 text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-[#1E3A8A] hover:file:bg-blue-100"
      />
      <button 
        onClick={handleUpload}
        disabled={!file || isUploading}
        className="bg-[#1E3A8A] hover:bg-blue-900 text-white px-4 py-2 rounded text-sm font-bold disabled:bg-gray-400 transition-colors"
      >
        {isUploading ? 'Uploading...' : 'Upload to Cloud'}
      </button>
      
      {/* Slightly styled the status text to be green for success, red for errors */}
      {status && (
        <p className={`text-xs mt-2 font-bold ${status.includes('Failed') ? 'text-red-500' : 'text-[#0D9488]'}`}>
          {status}
        </p>
      )}
    </div>
  );
}