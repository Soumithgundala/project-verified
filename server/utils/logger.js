import crypto from 'crypto';

const LEVEL_METHODS = {
  debug: 'log',
  info: 'log',
  warn: 'warn',
  error: 'error'
};

function emit(level, event, fields = {}) {
  const method = LEVEL_METHODS[level] || 'log';
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  };

  console[method](JSON.stringify(payload));
}

export function createCorrelationId() {
  return crypto.randomUUID();
}

export const logger = {
  debug: (event, fields) => emit('debug', event, fields),
  info: (event, fields) => emit('info', event, fields),
  warn: (event, fields) => emit('warn', event, fields),
  error: (event, fields) => emit('error', event, fields)
};
