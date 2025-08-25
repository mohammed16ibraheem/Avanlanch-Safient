import path from 'path';

export function ensureLogDir() {
  // Only run on the server side
  if (typeof window === 'undefined') {
    // Dynamically import fs
    const fs = require('fs');
    const logDir = path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    return logDir;
  }
  
  // Return a placeholder path for client-side
  return path.join(process.cwd(), 'logs');
}