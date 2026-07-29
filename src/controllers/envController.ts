import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const ENV_FILE_PATH = path.join(process.cwd(), '.env');
const ENV_EXAMPLE_PATH = path.join(process.cwd(), '.env.example');
const PASS_FILE_PATH = path.join(process.cwd(), 'env-access.json');

const DEFAULT_PASSWORD = 'Company1.';

function getAccessPassword(): string {
  try {
    if (fs.existsSync(PASS_FILE_PATH)) {
      const data = fs.readFileSync(PASS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.password === 'string' && parsed.password.trim().length > 0) {
        return parsed.password;
      }
    }
  } catch (err) {
    console.error('[EnvController] Error reading env-access.json:', err);
  }
  return DEFAULT_PASSWORD;
}

function saveAccessPassword(newPassword: string): void {
  try {
    fs.writeFileSync(PASS_FILE_PATH, JSON.stringify({ password: newPassword }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[EnvController] Error saving env-access.json:', err);
    throw new Error('Failed to persist new access password to disk.');
  }
}

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

function writeDotEnvKey(key: string, value: string): void {
  let content = '';
  if (fs.existsSync(ENV_FILE_PATH)) {
    content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
  }

  const lines = content.split('\n');
  let keyFound = false;

  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      if (k === key) {
        keyFound = true;
        // Escape quotes if needed
        const formattedVal = value.includes('"') ? `'${value}'` : `"${value}"`;
        return `${key}=${formattedVal}`;
      }
    }
    return line;
  });

  if (!keyFound) {
    const formattedVal = value.includes('"') ? `'${value}'` : `"${value}"`;
    newLines.push(`${key}=${formattedVal}`);
  }

  fs.writeFileSync(ENV_FILE_PATH, newLines.join('\n'), 'utf-8');

  // Also sync key declaration in .env.example if missing
  try {
    if (fs.existsSync(ENV_EXAMPLE_PATH)) {
      const exampleContent = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
      if (!exampleContent.includes(`${key}=`)) {
        const updatedExample = exampleContent.trimEnd() + `\n${key}=""\n`;
        fs.writeFileSync(ENV_EXAMPLE_PATH, updatedExample, 'utf-8');
      }
    }
  } catch (err) {
    console.warn('[EnvController] Could not sync .env.example:', err);
  }
}

function removeDotEnvKey(key: string): void {
  if (!fs.existsSync(ENV_FILE_PATH)) return;
  const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  const newLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return true;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      return k !== key;
    }
    return true;
  });
  fs.writeFileSync(ENV_FILE_PATH, newLines.join('\n'), 'utf-8');
}

export class EnvController {
  // POST /api/admin/env/verify
  static verifyPassword(req: Request, res: Response) {
    try {
      const { password } = req.body;
      const currentPass = getAccessPassword();

      if (!password || password !== currentPass) {
        return res.status(401).json({
          success: false,
          error: 'Invalid access password.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Password verified successfully.'
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Server error during password verification.'
      });
    }
  }

  // POST /api/admin/env/change-password
  static changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const currentPass = getAccessPassword();

      if (!currentPassword || currentPassword !== currentPass) {
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect.'
        });
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 3) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 3 characters long.'
        });
      }

      saveAccessPassword(newPassword.trim());

      console.log('[EnvController] Access password changed successfully.');
      return res.status(200).json({
        success: true,
        message: 'Access password updated successfully.'
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to change access password.'
      });
    }
  }

  // POST /api/admin/env/get
  static getEnvVars(req: Request, res: Response) {
    try {
      const { password } = req.body;
      const currentPass = getAccessPassword();

      if (!password || password !== currentPass) {
        return res.status(401).json({
          success: false,
          error: 'Access unauthorized. Invalid password.'
        });
      }

      // Read .env file if available
      let fileVars: Record<string, string> = {};
      if (fs.existsSync(ENV_FILE_PATH)) {
        try {
          const fileContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
          fileVars = parseDotEnv(fileContent);
        } catch (e) {
          console.error('[EnvController] Failed to parse .env file:', e);
        }
      }

      // Collect all environment keys from process.env and fileVars
      const allKeys = new Set<string>([
        ...Object.keys(fileVars),
        ...Object.keys(process.env)
      ]);

      // Filter out standard noisy system OS variables, but keep all custom / app variables
      const systemIgnoredKeys = new Set([
        'PATH', 'SHLVL', 'PWD', 'OLDPWD', 'LS_COLORS', 'TERM', 'SHELL',
        'USER', 'LOGNAME', 'HOME', 'HOSTNAME', 'LANG', 'LC_ALL', 'NODE_VERSION',
        'YARN_VERSION', 'DEBIAN_FRONTEND', 'FORCE_COLOR', 'PAGER'
      ]);

      const result: Array<{ key: string; value: string; inDotEnv: boolean }> = [];

      allKeys.forEach(key => {
        if (systemIgnoredKeys.has(key)) return;
        const val = process.env[key] !== undefined ? (process.env[key] as string) : (fileVars[key] || '');
        result.push({
          key,
          value: val,
          inDotEnv: fileVars[key] !== undefined
        });
      });

      // Sort alphabetically by key name
      result.sort((a, b) => a.key.localeCompare(b.key));

      return res.status(200).json({
        success: true,
        envVars: result
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve environment variables.'
      });
    }
  }

  // POST /api/admin/env/update
  static updateEnvVar(req: Request, res: Response) {
    try {
      const { password, key, value } = req.body;
      const currentPass = getAccessPassword();

      if (!password || password !== currentPass) {
        return res.status(401).json({
          success: false,
          error: 'Access unauthorized. Invalid password.'
        });
      }

      if (!key || typeof key !== 'string' || !key.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Variable key is required.'
        });
      }

      const cleanKey = key.trim();
      const cleanVal = typeof value === 'string' ? value : String(value ?? '');

      // Update runtime process.env
      process.env[cleanKey] = cleanVal;

      // Persist to .env file on disk
      writeDotEnvKey(cleanKey, cleanVal);

      console.log(`[EnvController] Environment variable updated: ${cleanKey}`);

      return res.status(200).json({
        success: true,
        message: `Environment variable '${cleanKey}' updated successfully.`
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to update environment variable.'
      });
    }
  }

  // POST /api/admin/env/delete
  static deleteEnvVar(req: Request, res: Response) {
    try {
      const { password, key } = req.body;
      const currentPass = getAccessPassword();

      if (!password || password !== currentPass) {
        return res.status(401).json({
          success: false,
          error: 'Access unauthorized. Invalid password.'
        });
      }

      if (!key || typeof key !== 'string' || !key.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Variable key is required.'
        });
      }

      const cleanKey = key.trim();

      // Remove from process.env
      delete process.env[cleanKey];

      // Remove from .env file
      removeDotEnvKey(cleanKey);

      console.log(`[EnvController] Environment variable deleted: ${cleanKey}`);

      return res.status(200).json({
        success: true,
        message: `Environment variable '${cleanKey}' deleted successfully.`
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete environment variable.'
      });
    }
  }
}
