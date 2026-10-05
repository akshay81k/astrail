const { z } = require('zod');

const schemas = {
  createSession: z.object({
    source: z.enum(['simulator', 'smap_msl', 'opssat', 'upload']).default('simulator'),
    seed: z.number().int().optional().default(42),
    mismatchLevel: z.enum(['none', 'medium', 'high']).optional().default('medium'),
    speed: z.number().min(1).max(60).optional().default(4),
    detector: z.object({
      targetFalseAlarmRate: z.number().min(0.0001).max(0.5).optional().default(0.01),
      persistK: z.number().int().min(1).max(20).optional().default(5),
      persistN: z.number().int().min(1).max(30).optional().default(8)
    }).optional().default({}),
    smap: z.object({
      channelId: z.string()
    }).optional(),
    uploadId: z.string().nullable().optional()
  }).refine(data => {
    if (data.source === 'smap_msl' && !data.smap?.channelId) return false;
    if (data.source === 'upload' && !data.uploadId) return false;
    return true;
  }, {
    message: 'smap.channelId is required for smap_msl source; uploadId is required for upload source',
    path: ['source']
  }),

  controlSession: z.discriminatedUnion('action', [
    z.object({ action: z.literal('play') }),
    z.object({ action: z.literal('pause') }),
    z.object({ action: z.literal('speed'), speed: z.number().min(1).max(60) }),
    z.object({ action: z.literal('reset'), seed: z.number().int().optional() }),
    z.object({ action: z.literal('seek'), simTime: z.number().min(0) })
  ]),

  injectFault: z.object({
    type: z.string(),
    target: z.string().optional(),
    severity: z.number().min(0).max(1),
    startOffsetSec: z.number().min(0).optional().default(0),
    rampSec: z.number().min(0).optional().default(0),
    durationSec: z.number().min(1).nullable().optional()
  }),

  injectRandomFault: z.object({
    includeSensorFaults: z.boolean().optional().default(true),
    heldOut: z.boolean().optional().default(true),
    seed: z.number().int().optional()
  }),

  updateStress: z.object({
    missingPct: z.number().min(0).max(100).optional(),
    noiseScale: z.number().min(0).max(10).optional(),
    delaySec: z.number().min(0).max(60).optional(),
    jitterSec: z.number().min(0).max(30).optional(),
    outOfOrderPct: z.number().min(0).max(100).optional()
  }),

  scheduleDropout: z.object({
    channel: z.string(),
    startOffsetSec: z.number().min(0).optional().default(0),
    durationSec: z.number().min(1).max(3600).default(600)
  }),

  incidentAction: z.object({
    note: z.string().max(500).optional().default('')
  }),

  updateDetector: z.object({
    targetFalseAlarmRate: z.number().min(0.0001).max(0.5).optional(),
    persistK: z.number().int().min(1).max(20).optional(),
    persistN: z.number().int().min(1).max(30).optional()
  }),

  updateUploadMapping: z.object({
    timeColumn: z.string().optional(),
    mapping: z.record(z.string(), z.string().nullable()).optional(),
    warmupSamples: z.number().int().min(100).max(2000).optional().default(600)
  }),

  startEvalRun: z.object({
    suite: z.enum([
      'detection_smap',
      'root_cause',
      'false_alerts',
      'robustness',
      'classification',
      'lead_time',
      'calibration',
      'all'
    ]),
    params: z.object({
      runs: z.number().int().min(1).max(1000).optional(),
      mismatch: z.array(z.enum(['none', 'medium', 'high'])).optional(),
      seed: z.number().int().optional()
    }).optional().default({})
  })
};

module.exports = schemas;
