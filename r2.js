import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 1. Initialize the S3 Client pointed at Cloudflare R2
const s3Client = new S3Client({
  region: "auto", // Cloudflare R2 always uses "auto" for the region
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Generate a URL for the React frontend to directly UPLOAD a file to R2.
 */
export const generateUploadUrl = async (fileKey, contentType) => {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileKey, // e.g., 'patients/123/cbct/slice_001.dcm'
    ContentType: contentType, // e.g., 'application/dicom' or 'application/zip'
  });

  // URL expires in 3600 seconds (1 hour)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return uploadUrl;
};

/**
 * Generate a URL for the React frontend/Web Viewer to READ a file from R2.
 */
export const generateViewUrl = async (fileKey) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileKey,
  });

  // URL expires in 3600 seconds (1 hour) to keep patient data secure
  const viewUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return viewUrl;
};