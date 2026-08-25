const multer = require('multer');

// Files are held in memory only long enough to stream to Cloudinary;
// they are never written to disk or stored in Supabase.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif|mp4|mov|webm/;
  const ok = allowed.test(file.mimetype);
  if (!ok) {
    return cb(new Error('Unsupported file type. Allowed: images (jpg, png, webp, gif) and videos (mp4, mov, webm).'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

module.exports = upload;
