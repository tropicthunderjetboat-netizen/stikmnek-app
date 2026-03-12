# Storage Setup for Business Photos

If business images show 401 Unauthorized or fail to load:

1. **Supabase Dashboard** → **Storage**
2. Ensure these buckets exist and are **public**:
   - `business-photos` – for uploaded business photos
   - `images` – if you have legacy images stored with `images/` prefix
3. For each bucket: **Settings** → enable **Public bucket**
4. Add policies if needed:
   - **SELECT**: Allow public read for displaying images
   - **INSERT**: Allow authenticated users to upload
