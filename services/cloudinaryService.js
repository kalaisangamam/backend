const stream = require('stream');
const cloudinary = require('../config/cloudinary');

/**
 * Uploads a buffer (from multer memory storage) to Cloudinary.
 * @param {Buffer} buffer
 * @param {{folder: string, resourceType?: 'image'|'video'}} options
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadBuffer = (buffer, { folder, resourceType = 'image' }) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.Readable.from(buffer).pipe(uploadStream);
  });

const deleteAsset = (publicId, resourceType = 'image') => {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = { uploadBuffer, deleteAsset };
