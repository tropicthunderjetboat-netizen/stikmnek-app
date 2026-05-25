-- Allow all MIME types on business-credentials (Windows PDFs sometimes send empty/wrong types).
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'business-credentials';
