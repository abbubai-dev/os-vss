import { useState, useEffect } from 'react';

export default function Calendar({ selectedDate, setSelectedDate, token, refreshKey }) {
  const [densities, setDensities] = useState([]);
  const [customDate, setCustomDate] = useState('');

  const HOLIDAY_SHIFTS = [
    '2026-09-01' 
  ]; 

  // --- NEW: Get Today's Date cleanly ---
  const getTodayString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };
  const todayStr = getTodayString();

  // --- NEW: Auto-select Today on initial load ---
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(todayStr);
    }
  }, [selectedDate, setSelectedDate, todayStr]);

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

  const getCountForDate = (dateStr) => {
    const found = densities.find(d => {
      if (d.date === dateStr) return true;
      const dateObj = new Date(d.date);
      const localDateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      return localDateStr === dateStr || String(d.date).substring(0, 10) === dateStr;
    });
    return found ? parseInt(found.count) : 0;
  };

  // --- NEW: Auto-Scroll to Today's Card ---
  useEffect(() => {
    // We use a tiny 100ms delay to ensure React has fully drawn the cards on the screen first
    const timer = setTimeout(() => {
      const todayCard = document.getElementById(`date-card-${todayStr}`);
      if (todayCard) {
        todayCard.scrollIntoView({ 
          behavior: 'smooth', 
          inline: 'center', // Centers the card horizontally in the scrolling box
          block: 'nearest' 
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [todayStr, densities]); // Runs when the data loads

  // --- NEW: Create a Unified Timeline of Dates ---
  const upcomingTuesdays = generateUpcomingTuesdays();
  
  // 1. Extract all active dates from the database that have patients
  const activeDatabaseDates = densities.map(d => {
    const dateObj = new Date(d.date);
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  });

  // 2. Merge Tuesdays, Active Dates, and Today. Remove duplicates, and sort chronologically!
  const allVisibleDates = Array.from(new Set([...upcomingTuesdays, ...activeDatabaseDates, todayStr]))
    .sort((a, b) => new Date(a) - new Date(b));

  const handleCustomDateChange = (e) => {
    const newDate = e.target.value;
    if (newDate) {
      setCustomDate(newDate);
      setSelectedDate(newDate);
    }
  };

  const activeCustomDate = customDate || (allVisibleDates.includes(selectedDate) ? '' : selectedDate);
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
        <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wider">Clinic Schedule</h2>
        
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm transition-colors ${customBoxColor}`}>
          <label className="text-xs font-bold uppercase opacity-80">Jump To Date:</label>
          <input 
            type="date" 
            value={activeCustomDate} 
            onChange={handleCustomDateChange}
            className={`text-sm font-bold outline-none cursor-pointer bg-transparent ${customTextColor}`}
          />
          
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

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300">
        {allVisibleDates.map(dateStr => {
          const count = getCountForDate(dateStr);
          const isSelected = selectedDate === dateStr;
          
          let badgeColor = "bg-emerald-100 text-emerald-800";
          if (count > 10) badgeColor = "bg-amber-100 text-amber-800";
          if (count > 20) badgeColor = "bg-red-100 text-red-800";
          if (count === 0) badgeColor = "bg-gray-100 text-gray-500";

          const dateObj = new Date(dateStr);
          const displayDate = dateObj.toLocaleDateString('en-GB', { 
            day: 'numeric', month: 'short', year: 'numeric' 
          });
          
          // ---> Dynamically calculate the day of the week <---
          const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });
          const isToday = dateStr === todayStr;

          return (
            <div 
              key={dateStr}
              id={`date-card-${dateStr}`}
              onClick={() => {
                setSelectedDate(dateStr);
                setCustomDate(''); 
              }}
              className={`min-w-35 p-4 rounded-xl border-2 cursor-pointer transition-all shrink-0 relative ${
                isSelected 
                  ? 'border-[#0D9488] bg-teal-50 shadow-md transform scale-105' 
                  : 'border-gray-200 bg-white hover:border-[#0D9488] hover:shadow-sm'
              }`}
            >
              {isToday && (
                <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-extrabold px-2 py-1 rounded-full uppercase shadow">
                  Today
                </span>
              )}
              <p className={`text-xs font-bold uppercase mb-1 ${isSelected ? 'text-teal-700' : 'text-gray-400'}`}>
                {dayName}
              </p>
              <p className={`text-lg font-extrabold ${isSelected ? 'text-[#0D9488]' : 'text-gray-800'}`}>
                {displayDate}
              </p>
              <div className={`mt-3 inline-block px-2 py-1 rounded text-xs font-bold ${badgeColor}`}>
                {count > 0 ? `${count} Patients` : 'No Patients'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}