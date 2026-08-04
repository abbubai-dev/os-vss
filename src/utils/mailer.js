import nodemailer from 'nodemailer';

// Configure the email transport (Using Gmail as default)
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export async function sendTriageAlert(patientInfo) {
  try {
    const mailOptions = {
      from: `"OSVSS System" <${process.env.EMAIL_USER}>`,
      to: process.env.PIC_EMAIL, // The PIC receiving the alert
      subject: `🚨 Urgent Referral: ${patientInfo.name} requires Triage`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1E3A8A; margin-top: 0;">New Triage Referral Received</h2>
          <p>A new patient has been submitted to the OSVSS Triage Inbox and is waiting to be scheduled.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Patient Name:</strong> ${patientInfo.name}</p>
            <p style="margin: 5px 0;"><strong>Referral Source:</strong> ${patientInfo.source}</p>
            <p style="margin: 5px 0;"><strong>Treatment:</strong> ${patientInfo.treatment}</p>
            <p style="margin: 5px 0;">
              <strong>HTPG KPI Status:</strong> 
              <span style="color: #6B21A8; font-weight: bold; background-color: #f3e8ff; padding: 2px 6px; border-radius: 4px;">
                ${patientInfo.htpg_consult}
              </span>
            </p>
            <p style="margin: 5px 0;"><strong>Notes:</strong> <br/> <em>"${patientInfo.notes || 'No notes provided'}"</em></p>
          </div>
          
          <p style="color: #4b5563; font-size: 14px;">Please log in to the OSVSS dashboard to review the attachments and assign a clinic date.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Triage alert email sent successfully to ${process.env.PIC_EMAIL}`);
  } catch (error) {
    console.error("Failed to send email alert:", error);
  }
}