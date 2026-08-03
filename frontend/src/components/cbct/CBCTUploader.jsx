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
      const dbRes = await fetch('/api/attachments', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          patient_id: patientId,
          file_path: fileKey, // We save 'scans/123/cbct.zip' in Postgres, NOT the file itself!
          file_type: 'CBCT_ZIP'
        })
      });

      if (dbRes.ok) {
        setStatus('Upload Complete!');
        setFile(null);
        if (onUploadSuccess) onUploadSuccess();
      }

    } catch (error) {
      console.error(error);
      setStatus('Upload Failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-slate-50">
      <h3 className="font-bold text-sm mb-2">Upload CBCT Scan (.zip)</h3>
      <input 
        type="file" 
        accept=".zip" 
        onChange={(e) => setFile(e.target.files[0])} 
        disabled={isUploading}
        className="mb-2 text-sm"
      />
      <button 
        onClick={handleUpload}
        disabled={!file || isUploading}
        className="bg-[#1E3A8A] text-white px-4 py-2 rounded text-sm font-bold disabled:bg-gray-400"
      >
        {isUploading ? 'Uploading...' : 'Upload to Cloud'}
      </button>
      {status && <p className="text-xs mt-2 text-gray-600 font-bold">{status}</p>}
    </div>
  );
}