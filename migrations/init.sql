-- Enable UUID generation extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    ic_number VARCHAR(20) NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    appt_date DATE NOT NULL,
    appt_time TIME NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('KPP', 'KPPR', 'KPM', 'KPSS', 'KPKK', 'ED')),
    treatment VARCHAR(20) NOT NULL CHECK (treatment IN ('MOS', 'Review', 'HPE', 'Others')),
    patient_type VARCHAR(10) NOT NULL CHECK (patient_type IN ('Baru', 'Ulangan')),
    status VARCHAR(20) DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Checked-In', 'Discharged', 'DNA')),
    notes TEXT,
    next_visit_id UUID REFERENCES appointments(id) ON DELETE SET NULL
);

-- 3. Attachments Table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('Referral', 'X-Ray', 'Bloodtest', 'Others')),
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);