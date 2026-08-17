import { useState, useEffect } from 'react';

export default function Calendar({ selectedDate, setSelectedDate, token, refreshKey }) {
  const [densities, setDensities] = useState([]);
  
  // New State for the custom date picker
  const [customDate, setCustomDate] = useState('');

  // Define your holidays here (YYYY-MM-DD). 
  const HOLIDAY_SHIFTS = [
    '2026-09-01' 
  ]; 

  const generateUpcomingTuesdays = () => {
    const dates = [];
    let currentDate = new Date('2026-07-07T12:00:00'); 
    
    for (let i = 0; i < 14; i++) {
      let year = currentDate.getFullYear();
      let month = String(currentDate.getMonth() + 1).padStart(2, '0');
      let day = String(currentDate.getDate()).padStart(2, '0');
      let formattedDate = `${year}-${month}-${day}`;

      if (HOLIDAY_SHIFTS.includes(formattedDate)) {
        currentDate.setDate(currentDate.getDate() + 7);
        year = currentDate.getFullYear();
        month = String(currentDate.getMonth() + 1).padStart(2, '0');
        day = String(currentDate.getDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
      }
      
      dates.push(formattedDate);
      currentDate.setDate(currentDate.getDate() + 14); 
    }
    return dates;
  };

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch('/api/appointments/counts', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setDensities(data);
        }
      } catch (error) {
        console.error("Failed to fetch calendar counts:", error);
      }
    };
    
    if (token) fetchCounts();
  }, [token, refreshKey]); 

  const upcomingDates = generateUpcomingTuesdays();

  // UPDATED: Smart Date Matcher (Handles timezones and Postgres timestamps)
  const getCountForDate = (dateStr) => {
    const found = densities.find(d => {
      // 1. Direct match (if the backend already formatted it perfectly)
      if (d.date === dateStr) return true;
      
      // 2. Safely parse the backend date into a standard YYYY-MM-DD string
      const dateObj = new Date(d.date);
      const localDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      // 3. Match against the clean date or a simple substring
      return localDateStr === dateStr || String(d.date).substring(0, 10) === dateStr;
    });
    
    return found ? parseInt(found.count) : 0;
  };

  // Handler for when the PIC uses the custom date picker
  const handleCustomDateChange = (e) => {
    const newDate = e.target.value;
    if (newDate) {
      setCustomDate(newDate);
      setSelectedDate(newDate);
    }
  };

  // --- NEW: Calculate Custom Date Colors & Counts ---
  const activeCustomDate = customDate || (upcomingDates.includes(selectedDate) ? '' : selectedDate);
  const customDateCount = activeCustomDate ? getCountForDate(activeCustomDate) : 0;
  
  let customBoxColor = "bg-white border-gray-200 text-gray-500";
  let customTextColor = "text-[#0D9488]";
  
  if (activeCustomDate) {
    if (customDateCount > 20) {
      customBoxColor = "bg-red-50 border-red-200";
      customTextColor = "text-red-700";
    } else if (customDateCount > 10) {
      customBoxColor = "bg-amber-50 border-amber-200";
      customTextColor = "text-amber-700";
    } else if (customDateCount > 0) {
      customBoxColor = "bg-emerald-50 border-emerald-200";
      customTextColor = "text-emerald-700";
    } else {
      customBoxColor = "bg-slate-50 border-slate-300";
      customTextColor = "text-slate-700";
    }
  }

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wider">Upcoming Specialist Sessions</h2>
        
        {/* NEW: Upgraded Dynamic Date Picker for the PIC */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm transition-colors ${customBoxColor}`}>
          <label className="text-xs font-bold uppercase opacity-80">PIC Clinic Date:</label>
          <input 
            type="date" 
            value={activeCustomDate} 
            onChange={handleCustomDateChange}
            className={`text-sm font-bold outline-none cursor-pointer bg-transparent ${customTextColor}`}
          />
          
          {/* Live Patient Counter Badge */}
          {activeCustomDate && (
            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
              customDateCount > 20 ? 'bg-red-200 text-red-900' : 
              customDateCount > 10 ? 'bg-amber-200 text-amber-900' : 
              customDateCount > 0 ? 'bg-emerald-200 text-emerald-900' : 
              'bg-slate-200 text-slate-600'
            }`}>
              {customDateCount > 0 ? `${customDateCount} Patients` : 'Empty'}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {upcomingDates.map(dateStr => {
          const count = getCountForDate(dateStr);
          const isSelected = selectedDate === dateStr;
          
          let badgeColor = "bg-emerald-100 text-emerald-800";
          if (count > 10) badgeColor = "bg-amber-100 text-amber-800";
          if (count > 20) badgeColor = "bg-red-100 text-red-800";

          const displayDate = new Date(dateStr).toLocaleDateString('en-GB', { 
            day: 'numeric', month: 'short', year: 'numeric' 
          });

          return (
            <div 
              key={dateStr}
              onClick={() => {
                setSelectedDate(dateStr);
                setCustomDate(''); // Clear custom date when clicking a card
              }}
              className={`min-w-45 p-4 rounded-xl border-2 cursor-pointer transition-all shrink-0 ${
                isSelected 
                  ? 'border-[#0D9488] bg-teal-50 shadow-md transform scale-105' 
                  : 'border-gray-200 bg-white hover:border-[#0D9488] hover:shadow-sm'
              }`}
            >
              <p className="text-xs text-gray-500 font-bold uppercase mb-1">Tuesday</p>
              <p className={`text-lg font-extrabold ${isSelected ? 'text-[#0D9488]' : 'text-gray-800'}`}>
                {displayDate}
              </p>
              <div className={`mt-3 inline-block px-2 py-1 rounded text-xs font-bold ${badgeColor}`}>
                {count} Patients
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}