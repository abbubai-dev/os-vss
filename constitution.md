# Oral Surgery Clinic Scheduling System (OS-CSS)

## Project Constitution & Engineering Blueprint

This document serves as the absolute Source of Truth and Single Blueprint for the development, deployment, and maintenance of the Oral Surgery Visiting Schedule Application for **Hospital Kuala Kangsar**.

---

## 1. Project Overview & Operational Constraints

The Oral Surgery (OS) Clinic at Hospital Kuala Kangsar operates under specific district constraints. This system digitizes, optimizes, and coordinates these workflows to eliminate administrative bottlenecks.

### 1.1 Key Operational Parameters

* **Clinic Frequency:** Held strictly **every 2 weeks on Tuesdays**. The application must prevent appointment bookings on unauthorized days.
* **Referral Sources:** * *District Dental Clinics:* `KPP`, `KPPR`, `KPM`, `KPSS`, `KPKK`
* *Emergency Cases:* `ED` (Emergency Department / Oncall Case Review)


* **Core Treatments Provided:** Minor Oral Surgery (`MOS`), `Review`, `HPE` Procedure (Histopathology Examination), and `Others`.
* **Patient Metrics:** All clinic visits must distinguish between a New Patient (`Baru`) and a Returning Patient (`Ulangan`) for data tracking and KPI reports.

---

## 2. System Architecture (Unified Setup)

To optimize performance, streamline continuous deployment, and keep memory footprint low on the Virtual Private Server (VPS), a **Unified Single-Container Architecture** powered by Bun is selected.

```
       +-------------------------------------------------------+
       |                  Docker Container                     |
       |                                                       |
       |   +-----------------------+   +-------------------+   |
       |   |    React Frontend     |   |    Bun Backend    |   |
       |   |  (Compiled HTML/JS)  |-->|  (API & Serving)  |   |
       |   +-----------------------+   +-------------------+   |
       +-----------------------------------------|-------------+
                                                 v
                                       +-------------------+
                                       | PostgreSQL DB Container|
                                       +-------------------+

```

### 2.1 Execution Flow

1. **Production Build:** The React application is built into static optimized assets (HTML, CSS, JS) via Vite during compilation.
2. **Serving Layer:** The Bun HTTP server serves these compiled frontend static assets globally on root requests (`/`).
3. **API Layer:** The same Bun server catches and routes backend API requests prefixed with `/api/*`.

---

## 3. Directory Structure

```text
os-css/
├── src/                      # Backend System (Bun Engine)
│   ├── server.js             # Main Entrypoint & HTTP Server
│   ├── routes/               # API Route Handlers
│   │   ├── patients.js
│   │   ├── appointments.js
│   │   └── files.js
│   └── config/               # Database Connection & Pools
│       └── db.js
├── frontend/                 # Frontend System (React Application)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── components/       # Reusable UI Components
│       │   ├── QueueTable.jsx
│       │   ├── PatientDrawer.jsx
│       │   └── CheckInModal.jsx
│       └── hooks/            # Custom API Fetching Logic
├── uploads/                  # Persistent Storage Directory (X-Rays, PDFs)
├── docker-compose.yml        # Multi-Container Orchestration
└── Dockerfile                # Unified Multi-stage Build Profile

```

---

## 4. Database Schema Matrix (PostgreSQL)

The database consists of three highly integrated relational tables. All primary keys utilize UUID version 4 to maintain data integrity across future scaling or integrations.

### 4.1 `patients` Table

Maintains historical and demographical records for all registered individuals.

| Column Name | Data Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| `name` | VARCHAR(255) | NOT NULL | Patient full name as per IC |
| `ic_number` | VARCHAR(20) | NOT NULL, UNIQUE | Malaysian IC or Passport number |
| `phone_number` | VARCHAR(20) | NOT NULL | Active contact details |
| `gender` | VARCHAR(10) | NOT NULL | Male / Female |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation audit |

### 4.2 `appointments` Table

Tracks every schedule block, status modification, and clinical transaction.

| Column Name | Data Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| `patient_id` | UUID | REFERENCES patients(id) ON DELETE CASCADE | Target patient |
| `appt_date` | DATE | NOT NULL | Must fall on a valid operational Tuesday |
| `appt_time` | TIME | NOT NULL | Time slot reservation |
| `source` | VARCHAR(20) | CHECK (source IN ('KPP', 'KPPR', 'KPM', 'KPSS', 'KPKK', 'ED')) | Referral location |
| `treatment` | VARCHAR(20) | CHECK (treatment IN ('MOS', 'Review', 'HPE', 'Others')) | Targeted intervention |
| `patient_type` | VARCHAR(10) | CHECK (patient_type IN ('Baru', 'Ulangan')) | Metric categorizer |
| `status` | VARCHAR(20) | DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Checked-In', 'Discharged', 'DNA')) | Current queue position |
| `notes` | TEXT | NULLABLE | Clinical or scheduling comments |
| `next_visit_id` | UUID | REFERENCES appointments(id) SET NULL | Relational link for tracking follow-ups |

### 4.3 `attachments` Table

Manages critical diagnostic artifacts and physical referral letters.

| Column Name | Data Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| `patient_id` | UUID | REFERENCES patients(id) ON DELETE CASCADE | Associated patient |
| `file_type` | VARCHAR(20) | CHECK (file_type IN ('Referral', 'X-Ray', 'Bloodtest', 'Others')) | Category of document |
| `file_name` | VARCHAR(255) | NOT NULL | Original disk name |
| `file_url` | TEXT | NOT NULL | Internal VPS persistent path string |
| `uploaded_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Audit timestamp |

---

## 5. Core API Endpoints Specification

All endpoints handle JSON payloads and must implement error handling wrapped in standard status codes.

### 5.1 Patient Subsystem

* `POST /api/patients` $\rightarrow$ Registers a new patient profile.
* `GET /api/patients?search={query}` $\rightarrow$ Performs fuzzy matching against Name or IC number.
* `GET /api/patients/:id` $\rightarrow$ Fetches complete historical profile including all linked historical appointments.

### 5.2 Schedule & Queue Management Subsystem

* `POST /api/appointments` $\rightarrow$ Books a specific session slot. Includes logic validation for bi-weekly Tuesdays.
* `GET /api/appointments?date={YYYY-MM-DD}` $\rightarrow$ Returns the complete schedule list for the specified day sorted sequentially by time.
* `PATCH /api/appointments/:id/checkin` $\rightarrow$ Transitions state to `Checked-In`.
* `PATCH /api/appointments/:id/checkout` $\rightarrow$ Processes finalization. Expects `status: 'Discharged'` alongside an optional `next_appointment` payload to automatically provision the follow-up record.

### 5.3 Document & Image Upload Subsystem

* `POST /api/attachments/upload` $\rightarrow$ Multipart/form-data consumer. Standardizes incoming files, saves them into the persistent directory `/uploads`, and records the path in the database.

---

## 6. Frontend Layout & User Workflows

The interface must be designed with high visual contrast, simple patterns, and clear actions suitable for fast-paced clinic environments.

### 6.1 View A: Dynamic Bi-Weekly Queue Control Center

* **Targeted Date Navigation Bar:** Renders upcoming operational clinic Tuesdays. Clicking a date queries the database and populates the dashboard queue.
* **KPI Indicator Ribbon:** Displays counters at the top: `Total Registered Today`, `Baru (New)`, `Ulangan (Returning)`, and `Remaining Queue`.
* **Main Queue Ledger (Table View):** Columns: Time, Patient Name, IC Number, Source Clinic, Patient Type Badge (`Baru` = Green, `Ulangan` = Blue), Treatment Type, Status Badge (`Scheduled` = Amber, `Checked-In` = Emerald). Clicking any patient row fires open the context Drawer.

### 6.2 View B: Sliding Contextual Patient Drawer

* Slides in smoothly from the right edge upon selecting a patient record.
* **Split Panels Layout:**
* *Left Column:* Comprehensive patient biodata (editable field structures), ongoing clinic visit specifics, treatment logs, and clinical history notes text area.
* *Right Column:* Document asset vault. Displays interactive card representations for referral letters and uploaded images. Clicking any card runs a modal overlay displaying full resolution image/PDF without page reloads.



### 6.3 View C: Check-In & Discharge Flow Wizards

* **Check-In Execution:** Single tap updates the dashboard layout state instantly and places the patient in the active queue.
* **Checkout / Discharge Logic Form:** Triggered when clicking "Complete Visit". Forces the staff user to select between two distinct radio pathways:
1. *Finalize Case & Discharge:* Updates status to `Discharged`, locking the timeline entry.
2. *Schedule Follow-Up (Ulangan):* Unfolds an optimized inline mini-date picker locked strictly to subsequent bi-weekly Tuesdays. Selecting a slot creates the new `Ulangan` record linked sequentially inside `next_visit_id`.



---

## 7. Business Logic Rules

### 7.1 Bi-Weekly Tuesday Validation Engine

To protect scheduling health, booking algorithms must execute a two-factor validation filter before inserting an appointment record.

1. **Day of the Week Check:** The target Javascript `Date.getDay()` must equal `2` (Tuesday).
2. **Bi-Weekly Interval Integration:** Validates target dates against a baseline clinic launch date (e.g., Tuesday, January 6, 2026). The difference in days between the proposed date and the baseline date must be perfectly divisible by 14.

```javascript
// Validation Engine Rule Logic Implemented inside /api/appointments
function verifyOperationalDate(targetDateStr) {
  const baselineDate = new Date('2026-01-06'); // Reference operational Tuesday
  const targetDate = new Date(targetDateStr);
  
  if (targetDate.getDay() !== 2) return false;
  
  const timeDiff = targetDate.getTime() - baselineDate.getTime();
  const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  return dayDiff % 14 === 0;
}

```

---

## 8. Deployment Configurations & Container Orchestration

### 8.1 Production Dockerfile (Unified Architecture)

```dockerfile
# Stage 1: Build the React static distribution
FROM oven/bun:latest AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lockb ./
RUN bun install
COPY frontend/ ./
RUN bun run build

# Stage 2: Establish execution container runtime
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
# Overwrite public directory with production built frontend elements
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000
VOLUME ["/app/uploads"]
CMD ["bun", "run", "src/server.js"]

```

### 8.2 Production Orchestration Profile (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  os-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: os_clinic_app
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://os_admin:KualaKangsar2026!@postgres-db:5432/os_clinic_db
      - PORT=3000
    volumes:
      - os_patient_storage:/app/uploads
    depends_on:
      - postgres-db
    restart: always

  postgres-db:
    image: postgres:15-alpine
    container_name: os_clinic_postgres
    environment:
      - POSTGRES_USER=os_admin
      - POSTGRES_PASSWORD=KualaKangsar2026!
      - POSTGRES_DB=os_clinic_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432" # Bound locally for security
    restart: always

volumes:
  postgres_data:
    driver: local
  os_patient_storage:
    driver: local

```

---

## 9. Structural Phase Implementation Roadmap

Development tasks should proceed through these progressive implementation phases:

* [ ] **Phase 1: Environment & Architecture Provisioning** $\rightarrow$ Generate schema migrations in Postgres, initialize the core project structure, and secure docker-compose orchestration.
* [ ] **Phase 2: Backend Core Pipeline API Assembly** $\rightarrow$ Finalize routes for patient profile records, build input validation logic, and ensure multi-part file uploads function securely.
* [ ] **Phase 3: Frontend Client Infrastructure** $\rightarrow$ Stand up Vite with Tailwind, build out responsive navigation layouts, and map state managers.
* [ ] **Phase 4: Interface Integration Workflows** $\rightarrow$ Implement data loading for the clinic queue table, wire up check-in triggers, and integrate the conditional follow-up logic inside the patient details view.
* [ ] **Phase 5: VPS Setup & Security Tightening** $\rightarrow$ Pull the codebase to the target VPS engine, wire up persistent volumes, hide internal database ports, and lock down transport endpoints using SSL signatures.

## Project Constitution & Engineering Blueprint (v2 - Secure Edition)

This document serves as the absolute Source of Truth and Single Blueprint for the development, deployment, and maintenance of the Oral Surgery Visiting Schedule Application for **Hospital Kuala Kangsar**.

---

## 1. Project Overview & Operational Constraints

The Oral Surgery (OS) Clinic operates under specific workflows. This system digitizes these processes while strictly protecting patient data via authenticated access.

### 1.1 Key Operational Parameters
* **Target Users (Authorized Only):** Admin (You), Clinic Assistant, OS Specialist.
* **Clinic Frequency:** Held strictly **every 2 weeks on Tuesdays**. 
* **Referral Sources:** `KPP`, `KPPR`, `KPM`, `KPSS`, `KPKK`, `ED`.
* **Core Treatments Provided:** `MOS`, `Review`, `HPE`, `Others`.
* **Patient Metrics:** Distinguish between New Patient (`Baru`) and Returning (`Ulangan`).

---

## 2. Security & Authentication Architecture (JWT)

To protect patient ICs and clinical notes, the application is strictly gated behind a JSON Web Token (JWT) authentication layer.

* **Credential Storage:** Usernames and passwords are not stored in the database. They are hardcoded securely in the backend `.env` file to prevent unauthorized account creation.
* **Token Lifecycle:** Successful login issues a stateless JWT stored in the browser's `localStorage`. All subsequent frontend API calls must include this token in the `Authorization: Bearer <token>` header.
* **Environment Variables Required:**
  ```env
  JWT_SECRET=your_super_secret_string_here
  ADMIN_CREDS=admin:password123
  ASSISTANT_CREDS=assistant:password456
  SPECIALIST_CREDS=specialist:password789
  ```

---

## 3. System Architecture (Unified Setup)

A **Unified Single-Container Architecture** powered by Bun handles both static frontend serving and secure API routing.

### 3.1 Execution Flow
1. **Serving Layer:** Bun serves the Vite-compiled React frontend globally. If a user is not authenticated, React forces a redirect to `/login`.
2. **API Layer:** Bun routes API requests (`/api/*`). A global middleware intercepts these requests, verifies the JWT signature, and rejects unauthorized access with a `401 Unauthorized` status.

---

## 4. Directory Structure Updates

```text
os-css/
├── src/                      
│   ├── server.js             
│   ├── routes/               
│   │   ├── auth.js           # NEW: JWT generation and login handling
│   │   ├── patients.js
│   │   ├── appointments.js
│   │   └── files.js
│   └── middleware/           
│       └── jwtAuth.js        # NEW: Token verification interceptor
├── frontend/                 
│   └── src/
│       ├── App.jsx           # Main routing and auth state
│       └── components/       
│           ├── Login.jsx     # NEW: Secure login gateway
│           ├── Calendar.jsx  # NEW: Visual schedule density tracker
│           └── PatientDrawer.jsx 
```

---

## 5. Database Schema Matrix (PostgreSQL)
*(Schemas for `patients`, `appointments`, and `attachments` remain identical to v1. No users table is required due to .env authentication).*

---

## 6. Core API Endpoints Specification

### 6.1 Authentication Subsystem (Unprotected)
* `POST /api/login` $\rightarrow$ Accepts `{ username, password }`. Validates against `.env`. Returns JWT token.

### 6.2 Schedule & Queue Management Subsystem (JWT Protected)
* `GET /api/appointments/counts` $\rightarrow$ **NEW:** Returns aggregated counts of patients per day to populate the visual Calendar UI.
* `GET /api/appointments?date={YYYY-MM-DD}` $\rightarrow$ Returns the queue.
* `POST /api/appointments` $\rightarrow$ Books a slot.
* `PATCH /api/appointments/:id/checkin` $\rightarrow$ Updates status.
* `PATCH /api/appointments/:id/checkout` $\rightarrow$ Finalizes visit.

---

## 7. Frontend Layout & User Workflows (Medical Theme)

**Theme:** "Clinical Clarity" (Medical Blue `#1E3A8A`, Surgical Teal `#0D9488`, Slate Backgrounds).

### 7.1 View 0: Secure Login Gateway (`Login.jsx`)
* A centered, professional clinical login card. Requires username and password. On failure, shows polite error. On success, stores JWT and loads View A.

### 7.2 View A: Dashboard with Calendar Density Tool
* **Top Section (Calendar):** A horizontal bi-weekly calendar ribbon. Dates display badges showing the total number of booked appointments (e.g., "12 Patients"). Clicking a date loads that specific queue.
* **Bottom Section (Queue Ledger):** The detailed table view of the selected date.

### 7.3 View B & C: Contextual Drawer & Checkout
* *(Remains identical to v1, featuring check-in buttons, file uploads, and follow-up scheduling logic).*

---

## 8. Deployment Configurations 

Targeting an existing VPS ecosystem. The unified application binds to an internal container port, mapped outward to an available VPS host port via Docker Compose.

```yaml
version: '3.8'
services:
  os-app:
    build: .
    ports:
      - "8080:3000" # Exposing on a custom port to fit existing VPS ecosystem
    environment:
      - DATABASE_URL=postgres://os_admin:KualaKangsar2026!@postgres-db:5432/os_clinic_db
      - JWT_SECRET=super_secret_hospital_key
      - ADMIN_CREDS=admin:adminpass
      - ASSISTANT_CREDS=assistant:asstpass
      - SPECIALIST_CREDS=specialist:specpass
```