import { useState } from 'react';

export default function PatientSearchModal({ isOpen, onClose, token }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const response = await fetch(`/api/patients?search=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        
        {/* Header & Search Bar */}
        <div className="p-6 border-b border-gray-100 bg-white rounded-t-xl z-10">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-[#1E3A8A]">Search Patient Database</h2>
              <p className="text-sm text-gray-500 font-medium">Lookup history by Name or IC Number</p>
            </div>
            <button onClick={handleClose} className="text-gray-400 hover:text-red-500 text-3xl font-bold leading-none">&times;</button>
          </div>

          <form onSubmit={handleSearch} className="flex gap-3">
            <input 
              type="text" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              placeholder="e.g., Ahmad Bin Razak or 880512..." 
              className="grow border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#0D9488] outline-none font-medium text-gray-800"
              autoFocus
            />
            <button 
              type="submit" 
              disabled={isSearching}
              className="bg-[#0D9488] hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-lg shadow-sm transition-colors min-w-30"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Results Area */}
        <div className="p-6 overflow-y-auto bg-slate-50 grow rounded-b-xl">
          {!hasSearched ? (
            <div className="text-center text-gray-400 py-12 font-medium">
              Enter a name or IC to pull up patient records.
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-red-500 py-12 font-bold bg-red-50 rounded-lg border border-red-100">
              No matching records found.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group results to show biodata once at the top if it's the same person */}
              <div className="bg-white p-5 rounded-lg border border-blue-100 shadow-sm">
                <h3 className="text-xs uppercase text-[#1E3A8A] font-extrabold tracking-wider mb-2">Patient Match</h3>
                <p className="text-lg font-bold text-gray-800">{results[0].name}</p>
                <p className="text-sm text-gray-600 font-medium">
                  IC: {results[0].ic_number} | {getAgeFromIC(results[0].ic_number)} | Phone: {results[0].phone_number}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 border-b border-gray-200 text-slate-700">
                    <tr>
                      <th className="p-3 font-bold text-sm">Date</th>
                      <th className="p-3 font-bold text-sm">Treatment</th>
                      <th className="p-3 font-bold text-sm">Type</th>
                      <th className="p-3 font-bold text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map((record) => {
                      // Format Date
                      const displayDate = new Date(record.appt_date).toLocaleDateString('en-GB', { 
                        day: 'numeric', month: 'short', year: 'numeric' 
                      });
                      
                      return (
                        <tr key={record.appt_id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-gray-800 text-sm">
                            {displayDate} <span className="text-gray-400 font-medium block text-xs">{record.appt_time.slice(0,5)}</span>
                          </td>
                          <td className="p-3 text-gray-600 font-semibold text-sm">{record.treatment}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${record.patient_type === 'Baru' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                              {record.patient_type}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                              record.status === 'Checked-In' ? 'bg-[#0D9488] text-white' : 
                              record.status === 'Discharged' ? 'bg-gray-200 text-gray-700' : 
                              record.status === 'FTA' ? 'bg-red-100 text-red-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}