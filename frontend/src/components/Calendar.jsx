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

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wider">Upcoming Specialist Sessions</h2>
        
        {/* NEW: Custom Date Picker for the PIC */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
          <label className="text-xs font-bold text-gray-500 uppercase">PIC Clinic Date:</label>
          <input 
            type="date" 
            value={customDate || (upcomingDates.includes(selectedDate) ? '' : selectedDate)} 
            onChange={handleCustomDateChange}
            className="text-sm font-bold text-[#0D9488] outline-none cursor-pointer bg-transparent"
          />
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