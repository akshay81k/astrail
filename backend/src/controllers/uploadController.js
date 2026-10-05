const uploadService = require('../services/uploadService');

async function handleUpload(req, res, next) {
  try {
    const uploadDoc = await uploadService.processUpload(req.file);
    res.status(201).json(uploadDoc);
  } catch (err) {
    next(err);
  }
}

async function getUpload(req, res, next) {
  try {
    const uploadDoc = await uploadService.getUpload(req.params.id);
    res.json(uploadDoc);
  } catch (err) {
    next(err);
  }
}

async function updateMapping(req, res, next) {
  try {
    const uploadDoc = await uploadService.updateMapping(req.params.id, req.body);
    res.json(uploadDoc);
  } catch (err) {
    next(err);
  }
}

async function deleteUpload(req, res, next) {
  try {
    await uploadService.deleteUpload(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleUpload,
  getUpload,
  updateMapping,
  deleteUpload
};
