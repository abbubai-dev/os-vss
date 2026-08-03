import { useState } from 'react';

export default function CBCTViewerButton({ fileKey, token }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleView = async () => {
    setIsLoading(true);
    try {
      // Ask backend for a temporary, secure 1-hour view link
      const response = await fetch(`/api/storage/view-url?fileKey=${encodeURIComponent(fileKey)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (data.viewUrl) {
        // Option A: Trigger a secure download of the ZIP file
        window.open(data.viewUrl, '_blank');
        
        // Option B (Future): If you build Cornerstone.js Web Viewer, 
        // you would pass `data.viewUrl` into your viewer component here instead of downloading it!
      }
    } catch (error) {
      console.error("Failed to fetch view link", error);
      alert("Failed to load the CBCT scan.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleView}
      disabled={isLoading}
      className="bg-[#0D9488] hover:bg-teal-700 text-white px-3 py-1 rounded text-sm font-bold flex items-center gap-2"
    >
      {isLoading ? 'Generating Link...' : 'Download / View CBCT'}
    </button>
  );
}