type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentMinLevel(): Level {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env;
  return 'info';
}

function ts(): string { return new Date().toISOString(); }

function fmt(level: Level, msg: string, extra?: unknown): string {
  const tag = `[${ts()}] [${level.toUpperCase()}]`;
  if (extra === undefined) return `${tag} ${msg}`;
  if (extra instanceof Error) return `${tag} ${msg} :: ${extra.message}`;
  try { return `${tag} ${msg} :: ${JSON.stringify(extra)}`; }
  catch { return `${tag} ${msg} :: [unserializable]`; }
}

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentMinLevel()];
}

export const log = {
  debug(msg: string, extra?: unknown): void { if (shouldLog('debug')) console.log(fmt('debug', msg, extra)); },
  info(msg: string, extra?: unknown): void  { if (shouldLog('info'))  console.log(fmt('info',  msg, extra)); },
  warn(msg: string, extra?: unknown): void  { if (shouldLog('warn'))  console.warn(fmt('warn',  msg, extra)); },
  error(msg: string, extra?: unknown): void { if (shouldLog('error')) console.error(fmt('error', msg, extra)); },
};
