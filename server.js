require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
    apiKey: process.env.ANTHROPIC_API_KEY ? 'Configurada' : 'NO CONFIGURADA'
  });
});


// ── TIIE scraper from DOF ──────────────────────────────────────────────────
app.get('/api/tiie', async (req, res) => {
  try {
    const response = await fetch('https://www.dof.gob.mx/indicadores.php', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      timeout: 10000
    });
    const html = await response.text();

    // Parse TIIE 28 días from the DOF indicators page
    // The page has a table with indicators; TIIE 28d appears with its rate
    let tiie = null;
    let fecha = null;

    // Try multiple patterns the DOF page uses
    // Pattern 1: TIIE followed by number in table
    const patterns = [
      /TIIE[\s\S]{0,200}?28[\s\S]{0,100}?([\d]+[.,][\d]{2,6})/i,
      /TIIE a 28[\s\S]{0,100}?([\d]+[.,][\d]{2,6})/i,
      /28 d[íi]as?[\s\S]{0,200}?(\d{1,2}[.,]\d{2,6})/i,
    ];

    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) {
        tiie = parseFloat(m[1].replace(',', '.'));
        if (tiie > 1 && tiie < 50) break;
        tiie = null;
      }
    }

    // Try to extract date
    const dateMatch = html.match(/TIIE[\s\S]{0,300}?(\d{1,2}\/\d{1,2}\/\d{4})/i)
                  || html.match(/(\d{1,2} de [a-záéíóúñ]+ de \d{4})/i);
    if (dateMatch) fecha = dateMatch[1];

    if (tiie) {
      return res.json({ tiie: tiie.toFixed(4), fecha });
    }

    // Fallback: try to find any percentage near "TIIE" token in text
    const tiieIdx = html.search(/TIIE/i);
    if (tiieIdx !== -1) {
      const snippet = html.slice(tiieIdx, tiieIdx + 2000);
      const numMatch = snippet.match(/(\d{1,2}[.,]\d{3,6})/g);
      if (numMatch) {
        for (const n of numMatch) {
          const v = parseFloat(n.replace(',', '.'));
          if (v > 5 && v < 40) {
            tiie = v;
            break;
          }
        }
      }
    }

    if (tiie) {
      return res.json({ tiie: tiie.toFixed(4), fecha });
    }

    res.status(404).json({ error: 'No se encontró la TIIE en la página del DOF' });

  } catch (err) {
    console.error('TIIE fetch error:', err.message);
    res.status(500).json({ error: 'Error al consultar el DOF: ' + err.message });
  }
});

// Named page routes
app.get('/pagare', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pagare.html'));
});
app.get('/aforo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'aforo.html'));
});
app.get('/calc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calc.html'));
});
app.get('/bitacora', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bitacora.html'));
});

// Catch-all -> home
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor corriendo en puerto ' + PORT);
  console.log('API Key: ' + (process.env.ANTHROPIC_API_KEY ? 'OK' : 'NO CONFIGURADA'));
});
