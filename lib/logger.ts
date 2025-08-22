import { createLogger, format, transports } from 'winston';
import { ensureLogDir } from './ensureLogDir';

// Create a logger that works in both browser and server environments
const logger = (() => {
  // Check if we're running on the server
  if (typeof window === 'undefined') {
    const logDir = ensureLogDir();
    
    const winstonLogger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message, category }) => {
          return `${timestamp} [${category}] ${level}: ${message}`;
        })
      ),
      transports: [
        new transports.Console(),
        new transports.File({ filename: `${logDir}/error.log`, level: 'error' }),
        new transports.File({ filename: `${logDir}/escrow.log` })
      ],
    });
    
    // Add custom methods to the server-side logger
    return {
      ...winstonLogger,
      sync: (message: string) => winstonLogger.info(message, { category: 'SYNC' }),
      timer: (message: string) => winstonLogger.info(message, { category: 'TIMER' }),
      return: (message: string) => winstonLogger.info(message, { category: 'RETURN' }),
      claim: (message: string) => winstonLogger.info(message, { category: 'CLAIM' })
    };
  } else {
    // Browser-side logger (just logs to console)
    return {
      info: (message: string, meta?: any) => console.info(message, meta),
      error: (message: string, meta?: any) => console.error(message, meta),
      warn: (message: string, meta?: any) => console.warn(message, meta),
      debug: (message: string, meta?: any) => console.debug(message, meta),
      // Add missing methods that are used in index.tsx
      sync: (message: string) => console.info(`[SYNC] ${message}`),
      timer: (message: string) => console.info(`[TIMER] ${message}`),
      return: (message: string) => console.info(`[RETURN] ${message}`),
      claim: (message: string) => console.info(`[CLAIM] ${message}`)
    };
  }
})();

// Helper functions for categorized logging
export const logTimer = (message: string) => logger.info(message, { category: 'TIMER' });
export const logSync = (message: string) => logger.info(message, { category: 'SYNC' });
export const logClaim = (message: string) => logger.info(message, { category: 'CLAIM' });
export const logReturn = (message: string) => logger.info(message, { category: 'RETURN' });
export const logError = (message: string, error?: any) => {
  if (error) {
    logger.error(`${message}: ${error.message || JSON.stringify(error)}`, { category: 'ERROR' });
  } else {
    logger.error(message, { category: 'ERROR' });
  }
};

// Add direct access to the specialized methods
const enhancedLogger = {
  ...logger,
  sync: (message: string) => logSync(message),
  timer: (message: string) => logTimer(message),
  return: (message: string) => logReturn(message),
  claim: (message: string) => logClaim(message)
};

export default enhancedLogger;