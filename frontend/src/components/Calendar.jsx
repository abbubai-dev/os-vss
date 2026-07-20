import { useState, useEffect } from 'react';

export default function Calendar({ selectedDate, setSelectedDate, token, refreshKey }) {
  const [densities, setDensities] = useState([]);

  // Define your holidays here (YYYY-MM-DD). 
  // The calendar will automatically shift these to the following week (+7 days) 
  // and continue the 2-week cycle from that new date!
  const HOLIDAY_SHIFTS = [
    '2026-09-01' // Example: Shift Sept 1st to Sept 8th
  ]; 

  const generateUpcomingTuesdays = () => {
    const dates = [];
    let currentDate = new Date('2026-07-07T12:00:00'); 
    
    for (let i = 0; i < 14; i++) {
      let year = currentDate.getFullYear();
      let month = String(currentDate.getMonth() + 1).padStart(2, '0');
      let day = String(currentDate.getDate()).padStart(2, '0');
      let formattedDate = `${year}-${month}-${day}`;

      // HOLIDAY INTERCEPTOR: If the generated date is in our holiday list...
      if (HOLIDAY_SHIFTS.includes(formattedDate)) {
        // 1. Shift the baseline forward by 7 days
        currentDate.setDate(currentDate.getDate() + 7);
        
        // 2. Recalculate the new date strings
        year = currentDate.getFullYear();
        month = String(currentDate.getMonth() + 1).padStart(2, '0');
        day = String(currentDate.getDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
      }
      
      dates.push(formattedDate);
      
      // Add 14 days for the NEXT iteration in the loop
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
  }, [token, refreshKey]); // Re-run if a new patient is booked/checked-in

  const upcomingDates = generateUpcomingTuesdays();

  // Helper to match database counts with our generated dates
  const getCountForDate = (dateStr) => {
    // Database returns Date objects stringified, so we match the prefix
    const found = densities.find(d => d.appt_date.startsWith(dateStr));
    return found ? parseInt(found.total_patients) : 0;
  };

  return (
    <div className="mb-8">
      <h2 className="text-sm font-bold text-[#1E3A8A] uppercase tracking-wider mb-3">Upcoming Clinic Sessions</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {upcomingDates.map(dateStr => {
          const count = getCountForDate(dateStr);
          const isSelected = selectedDate === dateStr;
          
          // Color logic based on busyness
          let badgeColor = "bg-emerald-100 text-emerald-800";
          if (count > 10) badgeColor = "bg-amber-100 text-amber-800";
          if (count > 20) badgeColor = "bg-red-100 text-red-800";

          // Format Date for display
          const displayDate = new Date(dateStr).toLocaleDateString('en-GB', { 
            day: 'numeric', month: 'short', year: 'numeric' 
          });

          return (
            <div 
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`min-w-45 p-4 rounded-xl border-2 cursor-pointer transition-all ${
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