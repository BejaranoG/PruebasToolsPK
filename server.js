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


// ── TIIE 28d desde RSS público de Banxico (sin token requerido) ───────────
// Feed: https://www.banxico.org.mx/rsscb/rss?BMXC_canal=tiie&BMXC_idioma=es
app.get('/api/tiie', async (req, res) => {
  try {
    const rssUrl = 'https://www.banxico.org.mx/rsscb/rss?BMXC_canal=tiie&BMXC_idioma=es';
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      throw new Error('Banxico RSS respondió ' + response.status);
    }

    const xml = await response.text();

    // Parse TIIE value from <cb:value ...>7.1981</cb:value>
    const valMatch = xml.match(/<cb:value[^>]*>([\d.]+)<\/cb:value>/);
    if (!valMatch) throw new Error('No se encontró valor TIIE en el RSS');

    const tiie = parseFloat(valMatch[1]);
    if (isNaN(tiie) || tiie < 1 || tiie > 50) throw new Error('Valor TIIE inválido: ' + valMatch[1]);

    // Parse date from <dc:date>2026-03-06T12:30:03-06:00</dc:date>
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
