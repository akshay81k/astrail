const fs = require('fs');
const { parse } = require('csv-parse/sync');
const idGen = require('../utils/idGenerator');
const Upload = require('../models/Upload');
const { signals } = require('../data/signalCatalog');
const { AppError } = require('../middleware/errorHandler');

const memoryUploads = new Map();

class UploadService {
  async processUpload(file) {
    const uploadId = idGen.upload();
    const filePath = file.path;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new AppError(500, 'INTERNAL_ERROR', `Failed to read uploaded file: ${err.message}`);
    }

    let records;
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (err) {
      throw new AppError(422, 'UNPARSEABLE_DATA', `CSV parsing failed: ${err.message}`);
    }

    if (!records || records.length === 0) {
      throw new AppError(422, 'UNPARSEABLE_DATA', 'CSV file contains no rows');
    }

    const columnNames = Object.keys(records[0]);
    let timeColumn = null;
    const columnsAnalysis = [];

    // Catalog channel names for matching
    const catalogIds = signals.map(s => s.id);

    columnNames.forEach(col => {
      const lower = col.toLowerCase();
      if (lower.includes('time') || lower.includes('date') || lower === 't' || lower === 'timestamp' || lower === 'simtime') {
        if (!timeColumn) {
          timeColumn = {
            name: col,
            format: 'iso8601_or_numeric',
            irregular: false,
            medianStepSec: 1.0
          };
        }
      }

      // Check numerical values & missing percentage
      let numericCount = 0;
      let missingCount = 0;
      const sampleSize = Math.min(records.length, 100);

      for (let i = 0; i < sampleSize; i++) {
        const val = records[i][col];
        if (val === '' || val === null || val === undefined || isNaN(val)) {
          if (val === '' || val === null || val === undefined) missingCount++;
        } else {
          numericCount++;
        }
      }

      const isNumeric = numericCount > sampleSize * 0.5;
      const missingPct = parseFloat(((missingCount / sampleSize) * 100).toFixed(1));

      // Match against signal catalog
      let bestMatch = null;
      let highestScore = 0;

      catalogIds.forEach(id => {
        if (col === id) {
          bestMatch = id;
          highestScore = 1.0;
        } else if (lower.includes(id) || id.includes(lower)) {
          if (highestScore < 0.8) {
            bestMatch = id;
            highestScore = 0.8;
          }
        }
      });

      columnsAnalysis.push({
        name: col,
        numeric: isNumeric,
        missingPct,
        suggestedChannel: bestMatch,
        matchScore: highestScore
      });
    });

    const uploadDoc = {
      _id: uploadId,
      id: uploadId,
      filename: file.filename,
      originalName: file.originalname,
      path: filePath,
      sizeBytes: file.size,
      rows: records.length,
      timeColumn: timeColumn || { name: columnNames[0], format: 'index', irregular: true, medianStepSec: 1.0 },
      columns: columnsAnalysis,
      mode: columnsAnalysis.filter(c => c.matchScore >= 0.8).length >= 6 ? 'full' : 'generic',
      mapping: {},
      warmupSamples: 600,
      warnings: ['File will be resampled to 1 Hz uniform grid.'],
      createdAt: new Date().toISOString()
    };

    memoryUploads.set(uploadId, uploadDoc);
    Upload.create(uploadDoc).catch(() => {});

    return uploadDoc;
  }

  async getUpload(uploadId) {
    let upload = memoryUploads.get(uploadId);
    if (!upload) {
      try {
        const dbUp = await Upload.findById(uploadId).lean();
        if (dbUp) upload = { ...dbUp, id: dbUp._id };
      } catch (_) {}
    }

    if (!upload) {
      throw new AppError(404, 'NOT_FOUND', `Upload with ID ${uploadId} not found`);
    }

    return upload;
  }

  async updateMapping(uploadId, { timeColumn, mapping, warmupSamples }) {
    const upload = await this.getUpload(uploadId);
    if (timeColumn) upload.timeColumn.name = timeColumn;
    if (mapping) upload.mapping = mapping;
    if (warmupSamples) upload.warmupSamples = warmupSamples;

    const mappedCount = Object.values(upload.mapping || {}).filter(Boolean).length;
    upload.mode = mappedCount >= 6 ? 'full' : 'generic';

    memoryUploads.set(uploadId, upload);
    Upload.findByIdAndUpdate(uploadId, upload).catch(() => {});

    return upload;
  }

  async deleteUpload(uploadId) {
    const upload = await this.getUpload(uploadId);
    try {
      if (fs.existsSync(upload.path)) {
        fs.unlinkSync(upload.path);
      }
    } catch (_) {}

    memoryUploads.delete(uploadId);
    Upload.findByIdAndDelete(uploadId).catch(() => {});
    return { success: true };
  }
}

module.exports = new UploadService();
