require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
let Pool = null;

const app = express();

const ROOT_DIR = __dirname;
const PUBLIC_DIR = fs.existsSync(path.join(ROOT_DIR, 'public'))
  ? path.join(ROOT_DIR, 'public')
  : ROOT_DIR;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GESTIONES_FILE = path.join(DATA_DIR, 'bitacora-gestiones.json');

const BITACORA_USER = process.env.BITACORA_USER || 'gerardo.bejarano';
const BITACORA_PASS = process.env.BITACORA_PASS || 'Proaktiva2026!';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.BITACORA_SESSION_SECRET ||
  'change-this-session-secret-in-production';

const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_POSTGRES = Boolean(DATABASE_URL);

const pool = USE_POSTGRES
  ? (() => {
      ({ Pool } = require('pg'));
      return new Pool({
        connectionString: DATABASE_URL,
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : undefined
      });
    })()
  : null;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function signToken(payload) {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encodedPayload, signature] = String(token || '').split('.');
    if (!encodedPayload || !signature) return null;

    const expected = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encodedPayload)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );

    if (!valid) return null;

    const payload = JSON.parse(fromBase64url(encodedPayload));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireBitacoraAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sesión no válida o expirada.' });
  }

  const token = auth.slice('Bearer '.length);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Sesión no válida o expirada.' });
  }

  req.bitacoraUser = payload.user;
  next();
}

function normalizeGestion(record = {}) {
  return {
    ...record,
    id: record.id || crypto.randomUUID(),
    fechaGestion:
      record.fechaGestion ||
      new Date().toISOString().slice(0, 10)
  };
}

async function ensureJsonFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(GESTIONES_FILE);
  } catch {
    await fsp.writeFile(GESTIONES_FILE, '[]', 'utf8');
  }
}

async function readJsonGestiones() {
  await ensureJsonFile();
  const raw = await fsp.readFile(GESTIONES_FILE, 'utf8');
  const data = JSON.parse(raw || '[]');
  return Array.isArray(data) ? data : [];
}

async function writeJsonGestiones(gestiones) {
  await ensureJsonFile();
  await fsp.writeFile(GESTIONES_FILE, JSON.stringify(gestiones, null, 2), 'utf8');
}

async function initBitacoraStorage() {
  if (USE_POSTGRES) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bitacora_gestiones (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bitacora_gestiones_created_at
      ON bitacora_gestiones (created_at DESC)
    `);
    return;
  }

  await ensureJsonFile();
}

async function listGestiones() {
  if (USE_POSTGRES) {
    const { rows } = await pool.query(`
      SELECT payload
      FROM bitacora_gestiones
      ORDER BY created_at DESC, id DESC
    `);
    return rows.map(r => r.payload);
  }

  const data = await readJsonGestiones();
  return data.sort((a, b) => {
    const dateCmp = String(b.fechaGestion || '').localeCompare(String(a.fechaGestion || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

async function upsertGestion(record) {
  const normalized = normalizeGestion(record);

  if (USE_POSTGRES) {
    await pool.query(
      `
        INSERT INTO bitacora_gestiones (id, payload)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id)
        DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `,
      [normalized.id, JSON.stringify(normalized)]
    );
    return normalized;
  }

  const data = await readJsonGestiones();
  const next = [normalized, ...data.filter(item => item.id !== normalized.id)];
  await writeJsonGestiones(next);
  return normalized;
}

async function importGestiones(records) {
  const gestiones = Array.isArray(records)
    ? records.map(normalizeGestion)
    : [];

  if (USE_POSTGRES) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of gestiones) {
        await client.query(
          `
            INSERT INTO bitacora_gestiones (id, payload)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (id)
            DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = NOW()
          `,
          [item.id, JSON.stringify(item)]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return listGestiones();
  }

  const existing = await readJsonGestiones();
  const map = new Map(existing.map(item => [item.id, item]));
  for (const item of gestiones) {
    map.set(item.id, item);
  }
  const next = Array.from(map.values()).sort((a, b) => {
    const dateCmp = String(b.fechaGestion || '').localeCompare(String(a.fechaGestion || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
  await writeJsonGestiones(next);
  return next;
}

async function clearGestiones() {
  if (USE_POSTGRES) {
    await pool.query('DELETE FROM bitacora_gestiones');
    return;
  }

  await writeJsonGestiones([]);
}

app.post('/api/bitacora/login', async (req, res) => {
  const { user, pass } = req.body || {};

  if (user !== BITACORA_USER || pass !== BITACORA_PASS) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  const token = signToken({
    user,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  });

  res.json({ ok: true, token, user });
});

app.get('/api/bitacora/gestiones', requireBitacoraAuth, async (req, res) => {
  try {
    const gestiones = await listGestiones();
    res.json({ gestiones });
  } catch (error) {
    console.error('Bitácora list error:', error);
    res.status(500).json({ error: 'No fue posible consultar las gestiones.' });
  }
});

app.post('/api/bitacora/gestiones', requireBitacoraAuth, async (req, res) => {
  try {
    const gestion = await upsertGestion(req.body || {});
    res.status(201).json({ gestion });
  } catch (error) {
    console.error('Bitácora save error:', error);
    res.status(500).json({ error: 'No fue posible guardar la gestión.' });
  }
});

app.post('/api/bitacora/gestiones/import', requireBitacoraAuth, async (req, res) => {
  try {
    const gestiones = await importGestiones(req.body?.gestiones || []);
    res.json({ gestiones });
  } catch (error) {
    console.error('Bitácora import error:', error);
    res.status(500).json({ error: 'No fue posible migrar las gestiones.' });
  }
});

app.delete('/api/bitacora/gestiones', requireBitacoraAuth, async (req, res) => {
  try {
    await clearGestiones();
    res.json({ ok: true });
  } catch (error) {
    console.error('Bitácora delete error:', error);
    res.status(500).json({ error: 'No fue posible eliminar las gestiones.' });
  }
});


app.get('/api/bitacora/status', async (req, res) => {
  try {
    let connected = false;
    let databaseTime = null;

    if (USE_POSTGRES) {
      const { rows } = await pool.query('SELECT NOW() AS now');
      connected = true;
      databaseTime = rows?.[0]?.now || null;
    }

    res.json({
      status: 'ok',
      storage: USE_POSTGRES ? 'postgres' : 'json-local',
      connected: USE_POSTGRES ? connected : true,
      authUser: BITACORA_USER,
      databaseTime
    });
  } catch (error) {
    console.error('Bitácora status error:', error);
    res.status(500).json({
      status: 'error',
      storage: USE_POSTGRES ? 'postgres' : 'json-local',
      connected: false,
      authUser: BITACORA_USER,
      error: 'No fue posible validar la conexión de almacenamiento.'
    });
  }
});


app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key no configurada en el servidor.' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Error de la API' });
    }
    res.json(data);
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Error de conexión: ' + err.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    apiKey: process.env.ANTHROPIC_API_KEY ? 'Configurada' : 'NO CONFIGURADA',
    bitacoraStorage: USE_POSTGRES ? 'postgres' : 'json-local'
  });
});

// ── TIIE 28d desde RSS público de Banxico (sin token requerido) ───────────
app.get('/api/tiie', async (req, res) => {
  try {
    const rssUrl = 'https://www.banxico.org.mx/rsscb/rss?BMXC_canal=tiie&BMXC_idioma=es';
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      throw new Error('Banxico RSS respondió ' + response.status);
    }

    const xml = await response.text();

    const valMatch = xml.match(/<cb:value[^>]*>([\d.]+)<\/cb:value>/);
    if (!valMatch) throw new Error('No se encontró valor TIIE en el RSS');

    const tiie = parseFloat(valMatch[1]);
    if (isNaN(tiie) || tiie < 1 || tiie > 50) throw new Error('Valor TIIE inválido: ' + valMatch[1]);

    let fecha = null;
    const dateMatch = xml.match(/<dc:date>([\d]{4}-[\d]{2}-[\d]{2})/);
    if (dateMatch) {
      const [y, m, d] = dateMatch[1].split('-');
      fecha = d + '/' + m + '/' + y;
    }

    return res.json({ tiie: tiie.toFixed(4), fecha, fuente: 'Banxico RSS' });
  } catch (err) {
    console.error('TIIE fetch error:', err.message);
    res.status(500).json({ error: 'Error al consultar Banxico: ' + err.message });
  }
});

app.get('/pagare', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'pagare.html'));
});

app.get('/aforo', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'aforo.html'));
});

app.get('/calc', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'calc.html'));
});

app.get('/bitacora', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'bitacora.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function start() {
  try {
    await initBitacoraStorage();

    app.listen(PORT, '0.0.0.0', () => {
      console.log('Servidor corriendo en puerto ' + PORT);
      console.log('API Key: ' + (process.env.ANTHROPIC_API_KEY ? 'OK' : 'NO CONFIGURADA'));
      console.log('Bitácora storage: ' + (USE_POSTGRES ? 'POSTGRES' : 'JSON LOCAL'));
    });
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1);
  }
}

start();
