import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { decryptJson, encryptJson } from '../crypto/credentials.js';
import { query } from '../db/pool.js';
import { isTrackerConfigured, type TrackerConfig } from '../trackers/index.js';

/** Return config with secrets redacted for the client. */
function redact(config: TrackerConfig): TrackerConfig {
  if (config.provider === 'azure-devops') {
    return { ...config, pat: config.pat ? '••••••••' : '' };
  }
  return { ...config, apiToken: config.apiToken ? '••••••••' : '' };
}

export async function trackerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/tracker/settings', { preHandler: requireAuth }, async (request, reply) => {
    const result = await query<{ provider: string; config_ciphertext: string }>(
      `SELECT provider, config_ciphertext FROM tracker_configs WHERE user_id = $1`,
      [request.user!.id]
    );
    if (!result.rows[0]) {
      return { config: null };
    }
    try {
      const config = decryptJson<TrackerConfig>(result.rows[0].config_ciphertext);
      return { config: redact(config) };
    } catch {
      return reply.code(500).send({ error: 'Failed to decrypt tracker settings' });
    }
  });

  app.put('/api/tracker/settings', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as TrackerConfig;
    if (!isTrackerConfigured(body)) {
      return reply.code(400).send({ error: 'Incomplete tracker configuration' });
    }

    // If client sent redacted secret, merge with existing ciphertext
    let toStore = body;
    if (
      (body.provider === 'azure-devops' && body.pat.includes('•')) ||
      (body.provider === 'jira' && body.apiToken.includes('•'))
    ) {
      const existing = await query<{ config_ciphertext: string }>(
        `SELECT config_ciphertext FROM tracker_configs WHERE user_id = $1`,
        [request.user!.id]
      );
      if (!existing.rows[0]) {
        return reply.code(400).send({ error: 'Cannot keep existing secret — no prior settings' });
      }
      const prev = decryptJson<TrackerConfig>(existing.rows[0].config_ciphertext);
      if (body.provider === 'azure-devops' && prev.provider === 'azure-devops') {
        toStore = { ...body, pat: prev.pat };
      } else if (body.provider === 'jira' && prev.provider === 'jira') {
        toStore = { ...body, apiToken: prev.apiToken };
      } else {
        return reply.code(400).send({ error: 'Provider changed — enter credentials again' });
      }
    }

    const ciphertext = encryptJson(toStore);
    await query(
      `INSERT INTO tracker_configs (user_id, provider, config_ciphertext, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET provider = EXCLUDED.provider,
             config_ciphertext = EXCLUDED.config_ciphertext,
             updated_at = now()`,
      [request.user!.id, toStore.provider, ciphertext]
    );
    return { config: redact(toStore) };
  });
}
