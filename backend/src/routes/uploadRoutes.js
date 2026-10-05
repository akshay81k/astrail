const express = require('express');
const uploadController = require('../controllers/uploadController');
const handleUpload = require('../middleware/upload');
const validate = require('../middleware/validate');
const schemas = require('../validators/schemas');

const router = express.Router();

router.post('/uploads', handleUpload, uploadController.handleUpload);
router.get('/uploads/:id', uploadController.getUpload);
router.put('/uploads/:id/mapping', validate(schemas.updateUploadMapping), uploadController.updateMapping);
router.delete('/uploads/:id', uploadController.deleteUpload);

module.exports = router;
