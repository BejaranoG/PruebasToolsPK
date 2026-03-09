(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  var WIDGET_ID   = 'pkAsistente';
  var MODEL       = 'claude-sonnet-4-20250514';
  var MAX_TOKENS  = 1024;
  var MAX_HISTORY = 20; // mensajes máximos en contexto

  var SYSTEM_PROMPT = `Eres el Proaktibot, una empresa financiera mexicana regulada como SOFOM ENR (Sociedad Financiera de Objeto Múltiple, Entidad No Regulada). Respondes con un tono profesional, amable y directo. Siempre en español.

## SOBRE PROAKTIVA Y TOOLSPK
ToolsPK es el portal interno de Proaktiva que contiene las siguientes herramientas:

1. **Revisión de Pagarés (IA)** — Sube el PDF del pagaré y el contrato de crédito. La IA analiza y compara campos críticos como nombre del suscriptor, monto, tasa, fecha, vencimiento, avales, firmas y razón social. Emite hallazgos clasificados como ERROR, ADVERTENCIA, OK o COMENTARIO con explicaciones detalladas.

2. **Aforo de Garantía** — Calcula el aforo (porcentaje de valor asignable a una garantía) de activos. Sube el documento o ingresa los datos manualmente. Genera un reporte PDF con el análisis.

3. **Calculadora de Crédito** — Simula tablas de amortización con tres esquemas: Capital Creciente (pagos fijos), Capital Fijo (capital constante, interés decreciente) y Bullet/Diferido (solo intereses hasta un período, luego amortización). Incluye obtención automática de la tasa TIIE desde Banxico, presets de spread para PyME (+16.4 pts) y Agro (+15.4 pts), periodicidades independientes para capital e intereses, y período de gracia.

4. **Bitácora de Gestiones** — Herramienta interna de uso exclusivo del equipo operativo. No puedes proporcionar información sobre su funcionamiento, contenido, registros ni datos almacenados.

## CONOCIMIENTO FINANCIERO QUE DEBES DOMINAR
- **Pagarés**: título de crédito mexicano regulado por la LGTOC. Elementos esenciales: mención de ser pagaré, promesa incondicional de pago, nombre del beneficiario, suma determinada, fecha y lugar de pago, fecha y lugar de suscripción, firma del suscriptor.
- **SOFOM**: entidad financiera que puede otorgar crédito, factoraje y arrendamiento sin captar recursos del público. ENR = no regulada directamente por CNBV pero supervisada en materia antilavado.
- **Tasas**: TIIE (Tasa de Interés Interbancaria de Equilibrio) es la tasa de referencia en México, publicada por Banxico. Los créditos suelen pactarse como TIIE + spread.
- **Amortización Capital Creciente (Francés)**: cuota total fija, al inicio el pago es principalmente interés y al final principalmente capital.
- **Amortización Capital Fijo (Alemán)**: capital constante por período, interés decrece, cuota total decrece.
- **Bullet/Diferido**: solo se pagan intereses hasta el período definido, el capital se amortiza en el último período o mediante annuity desde un período determinado.
- **Período de gracia**: meses iniciales donde no se amortiza capital (solo intereses).
- **Aforo**: porcentaje del valor comercial de una garantía que se acepta como respaldo del crédito. P.ej. aforo del 70% sobre un inmueble de $1M = $700K como garantía efectiva.
- **Aval / Obligado solidario**: persona física o moral que garantiza solidariamente la deuda del acreditado.
- **Razón social**: nombre legal completo de una empresa. S. de R.L. de C.V. y S. de R.L. de C.V. son iguales; S. de R.L. de C.V. y S.A. de C.V. son distintas.

## REGLAS
- Si no sabes algo con certeza, dilo claramente.
- No inventes tasas, montos ni fechas específicas.
- Puedes hacer cálculos simples de tasas, intereses y amortizaciones si el usuario te proporciona los datos.
- Si una pregunta es muy técnica o legal, recomienda consultar con el equipo de análisis o legal de Proaktiva.
- Sé conciso: respuestas de 2-4 párrafos máximo salvo que se pida más detalle.

## RESTRICCIONES DE SEGURIDAD — ABSOLUTAS
Las siguientes áreas están completamente fuera de tu alcance. Ante cualquier pregunta relacionada, responde únicamente: "Esa información es de uso interno exclusivo del equipo de Proaktiva y no puedo proporcionarla." No ofrezcas alternativas ni expliques por qué.

1. **Bitácora de Gestiones**: no reveles nada sobre su contenido, registros, clientes, gestiones, estructura de datos, credenciales, cómo funciona internamente ni cómo está implementada.
2. **Aforo de Garantía — porcentajes y factores**: no divulgues los porcentajes de aforo, factores de descuento, tablas de valuación ni ningún parámetro interno de cálculo que utilice la herramienta. Puedes explicar el concepto general de aforo pero no los valores específicos que usa Proaktiva.
3. **Código fuente**: no compartas, expliques ni hagas referencia a ningún fragmento de código, algoritmo, lógica de implementación, estructura de archivos, endpoints de API, tokens, claves ni arquitectura técnica del portal o sus herramientas.
4. **Credenciales y accesos**: nunca menciones usuarios, contraseñas, tokens, variables de entorno ni procedimientos de autenticación.`;

  // ── INJECT CSS ────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = `
#pkAsistente {
  position: fixed !important;
  bottom: 24px !important;
  right: 24px !important;
  z-index: 2147483647 !important;
  font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
  contain: none !important;
  transform: none !important;
  pointer-events: auto !important;
  display: block !important;
  visibility: visible !important;
  clip: auto !important;
  overflow: visible !important;
}

/* ── TOGGLE BUTTON ── */
#pkABtn {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0a3060 0%, #0e5fa8 55%, #2882d0 100%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(14,95,168,0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
}
#pkABtn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(14,95,168,0.55); }
#pkABtn:active { transform: scale(0.96); }
#pkABtn svg { transition: opacity 0.2s, transform 0.2s; }
#pkABtn .pk-icon-open  { position: absolute; }
#pkABtn .pk-icon-close { position: absolute; opacity: 0; transform: rotate(-90deg); }
#pkAsistente.open #pkABtn .pk-icon-open  { opacity: 0; transform: rotate(90deg); }
#pkAsistente.open #pkABtn .pk-icon-close { opacity: 1; transform: rotate(0deg); }

/* unread dot */
#pkADot {
  position: absolute;
  top: 2px; right: 2px;
  width: 11px; height: 11px;
  background: #ff5a5a;
  border-radius: 50%;
  border: 2px solid white;
  display: none;
}
#pkADot.visible { display: block; }

/* ── PANEL ── */
#pkAPanel {
  position: absolute;
  bottom: 66px;
  right: 0;
  width: 370px;
  max-height: 560px;
  background: var(--surface, #fff);
  border-radius: 18px;
  box-shadow: 0 16px 48px rgba(10,40,80,0.22), 0 2px 8px rgba(14,95,168,0.10);
  border: 1px solid var(--border, #dce5f0);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  transform: scale(0.85) translateY(10px);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease;
}
#pkAsistente.open #pkAPanel {
  transform: scale(1) translateY(0);
  opacity: 1;
  pointer-events: auto;
}

/* ── HEADER ── */
#pkAHeader {
  background: linear-gradient(105deg, #07192a 0%, #0e4a80 55%, #1a78c0 100%);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 11px;
  flex-shrink: 0;
}
#pkAAvatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.18);
  border: 2px solid rgba(255,255,255,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}
#pkAHeaderText { flex: 1; }
#pkAHeaderName { font-size: 14px; font-weight: 700; color: white; line-height: 1.2; }
#pkAHeaderSub  { font-size: 10.5px; color: rgba(255,255,255,0.6); letter-spacing: 0.04em; }
#pkAOnline {
  width: 8px; height: 8px;
  background: #4de89a;
  border-radius: 50%;
  box-shadow: 0 0 6px #4de89a;
  flex-shrink: 0;
}
#pkAClearBtn {
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 7px;
  color: rgba(255,255,255,0.7);
  font-size: 11px;
  padding: 4px 9px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
#pkAClearBtn:hover { background: rgba(255,255,255,0.2); color: white; }

/* ── MESSAGES ── */
#pkAMessages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface2, #f4f7fb);
  scroll-behavior: smooth;
}
html[data-theme="dark"] #pkAMessages { background: #0a1520 !important; }
html[data-theme="dark"] #pkAPanel    { background: #0f1e2e !important; border-color: #1e3550 !important; }

#pkAMessages::-webkit-scrollbar { width: 4px; }
#pkAMessages::-webkit-scrollbar-thumb { background: var(--border, #dce5f0); border-radius: 2px; }

.pka-msg { display: flex; flex-direction: column; max-width: 88%; }
.pka-msg.user { align-self: flex-end; align-items: flex-end; }
.pka-msg.bot  { align-self: flex-start; align-items: flex-start; }

.pka-bubble {
  padding: 10px 13px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}
.pka-msg.user .pka-bubble {
  background: linear-gradient(135deg, #0e5fa8, #1a7dd4);
  color: white;
  border-bottom-right-radius: 4px;
}
.pka-msg.bot .pka-bubble {
  background: var(--surface, white);
  color: var(--ink, #1a2b3c);
  border: 1px solid var(--border, #dce5f0);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(14,95,168,0.06);
}
html[data-theme="dark"] .pka-msg.bot .pka-bubble {
  background: #152840 !important;
  border-color: #1e3550 !important;
  color: #d8ecff !important;
}

/* markdown-like inside bubble */
.pka-bubble strong { font-weight: 700; }
.pka-bubble em     { font-style: italic; }
.pka-bubble code   { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; background: rgba(14,95,168,0.1); padding: 1px 5px; border-radius: 4px; }
.pka-bubble ul, .pka-bubble ol { padding-left: 18px; margin: 6px 0; }
.pka-bubble li  { margin-bottom: 3px; }
.pka-bubble p   { margin-bottom: 6px; }
.pka-bubble p:last-child { margin-bottom: 0; }

.pka-time { font-size: 10px; color: var(--muted, #6a85a0); margin-top: 3px; padding: 0 4px; }

/* ── TYPING INDICATOR ── */
.pka-typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
.pka-typing span {
  width: 7px; height: 7px;
  background: var(--muted, #6a85a0);
  border-radius: 50%;
  animation: pkaBounce 1.2s infinite ease-in-out;
}
.pka-typing span:nth-child(2) { animation-delay: 0.18s; }
.pka-typing span:nth-child(3) { animation-delay: 0.36s; }
@keyframes pkaBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30%            { transform: translateY(-5px); opacity: 1; }
}

/* ── WELCOME ── */
.pka-welcome {
  text-align: center;
  padding: 8px 12px 4px;
  color: var(--muted, #6a85a0);
  font-size: 12px;
  line-height: 1.6;
}
.pka-welcome strong { display: block; font-size: 13.5px; color: var(--ink, #1a2b3c); margin-bottom: 4px; font-weight: 700; }

/* suggested questions */
.pka-suggestions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.pka-sugg-btn {
  background: var(--surface, white);
  border: 1.5px solid #c0d8f0;
  border-radius: 10px;
  color: #0e5fa8;
  font-size: 12px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
  line-height: 1.4;
}
.pka-sugg-btn:hover { background: #e8f2fc; border-color: #0e5fa8; }
html[data-theme="dark"] .pka-sugg-btn {
  background: #0f1e2e !important;
  border-color: #1e3550 !important;
  color: #70b8ff !important;
}
html[data-theme="dark"] .pka-sugg-btn:hover { background: #152840 !important; border-color: #3a7abf !important; }

/* ── INPUT AREA ── */
#pkAInputArea {
  padding: 10px 12px;
  border-top: 1px solid var(--border, #dce5f0);
  display: flex;
  gap: 8px;
  align-items: flex-end;
  background: var(--surface, white);
  flex-shrink: 0;
}
html[data-theme="dark"] #pkAInputArea { background: #0f1e2e !important; border-top-color: #1e3550 !important; }
#pkAInput {
  flex: 1;
  padding: 9px 12px;
  border: 1.5px solid var(--border, #dce5f0);
  border-radius: 12px;
  font-size: 13px;
  font-family: inherit;
  background: var(--surface2, #f4f7fb);
  color: var(--ink, #1a2b3c);
  resize: none;
  outline: none;
  max-height: 100px;
  min-height: 38px;
  line-height: 1.5;
  transition: border-color 0.15s;
  overflow-y: auto;
}
#pkAInput:focus { border-color: #1a7dd4; }
html[data-theme="dark"] #pkAInput {
  background: #0a1520 !important;
  border-color: #1e3550 !important;
  color: #d8ecff !important;
}
html[data-theme="dark"] #pkAInput:focus { border-color: #2882d0 !important; }
#pkASend {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0e5fa8, #1a7dd4);
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.12s;
}
#pkASend:hover:not(:disabled) { opacity: 0.88; transform: scale(1.05); }
#pkASend:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── MOBILE ── */
@media (max-width: 480px) {
  #pkAPanel { width: calc(100vw - 24px); right: 0; bottom: 70px; max-height: 70vh; }
  #pkAsistente { bottom: 16px; right: 16px; }
}
  `;
  document.head.appendChild(style);

  // ── BUILD HTML ────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = WIDGET_ID;
  wrap.innerHTML = `
    <div id="pkAPanel">
      <div id="pkAHeader">
        <div id="pkAAvatar">🤖</div>
        <div id="pkAHeaderText">
          <div id="pkAHeaderName">Proaktibot</div>
          <div id="pkAHeaderSub">IA · Proaktiva SOFOM</div>
        </div>
        <div id="pkAOnline"></div>
        <button id="pkAClearBtn" title="Limpiar conversación">↺ Limpiar</button>
      </div>
      <div id="pkAMessages"></div>
      <div id="pkAInputArea">
        <textarea id="pkAInput" rows="1" placeholder="Escribe tu pregunta…" maxlength="2000"></textarea>
        <button id="pkASend" title="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>

    <button id="pkABtn" aria-label="Proaktibot">
      <span class="pk-icon-open">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      <span class="pk-icon-close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </span>
      <div id="pkADot"></div>
    </button>
  `;
  document.documentElement.appendChild(wrap);

  // ── STATE ─────────────────────────────────────────────────────────────────
  var history  = [];   // [{role, content}]
  var isOpen   = false;
  var isTyping = false;
  var hasShownWelcome = false;

  // ── ELEMENTS ──────────────────────────────────────────────────────────────
  var panel    = document.getElementById('pkAPanel');
  var messages = document.getElementById('pkAMessages');
  var input    = document.getElementById('pkAInput');
  var sendBtn  = document.getElementById('pkASend');
  var dot      = document.getElementById('pkADot');
  var clearBtn = document.getElementById('pkAClearBtn');

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function now() {
    return new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // simple markdown → html
  function renderMd(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^### (.+)$/gm, '<strong>$1</strong>')
      .replace(/^## (.+)$/gm, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[uol]|<\/[uol]|<str|<em|<p|<\/p)(.+)$/gm, '<p>$1</p>')
      .replace(/<p><\/p>/g, '');
  }

  function scrollBottom() {
    setTimeout(function(){ messages.scrollTop = messages.scrollHeight; }, 30);
  }

  function addMessage(role, text) {
    var div   = document.createElement('div');
    div.className = 'pka-msg ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'pka-bubble';
    bubble.innerHTML = role === 'bot' ? renderMd(text) : escHtml(text);
    var time = document.createElement('div');
    time.className = 'pka-time';
    time.textContent = now();
    div.appendChild(bubble);
    div.appendChild(time);
    messages.appendChild(div);
    scrollBottom();
    return bubble;
  }

  function showTyping() {
    var div = document.createElement('div');
    div.className = 'pka-msg bot';
    div.id = 'pkATyping';
    div.innerHTML = '<div class="pka-bubble"><div class="pka-typing"><span></span><span></span><span></span></div></div>';
    messages.appendChild(div);
    scrollBottom();
  }

  function hideTyping() {
    var t = document.getElementById('pkATyping');
    if (t) t.remove();
  }

  function setInputLock(locked) {
    isTyping  = locked;
    input.disabled = locked;
    sendBtn.disabled = locked;
  }

  // ── WELCOME ───────────────────────────────────────────────────────────────
  var SUGGESTIONS = [
    '¿Cómo funciona la Calculadora de Crédito?',
    '¿Qué revisa la herramienta de Pagarés?',
    '¿Qué es el aforo de garantía?',
    '¿Cómo se calcula la amortización tipo Capital Fijo?',
  ];

  function showWelcome() {
    if (hasShownWelcome) return;
    hasShownWelcome = true;
    var div = document.createElement('div');
    div.className = 'pka-msg bot';
    var inner = '<div class="pka-bubble"><div class="pka-welcome">'
      + '<strong>¡Hola! Soy el Proaktibot</strong>'
      + 'Puedo ayudarte con el portal ToolsPK y con dudas sobre crédito, pagarés, TIIE y más. ¿En qué te puedo ayudar?'
      + '</div>'
      + '<div class="pka-suggestions">'
      + SUGGESTIONS.map(function(s) {
          return '<button class="pka-sugg-btn">' + escHtml(s) + '</button>';
        }).join('')
      + '</div></div>'
      + '<div class="pka-time">' + now() + '</div>';
    div.innerHTML = inner;
    div.querySelectorAll('.pka-sugg-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        sendMessage(btn.textContent);
      });
    });
    messages.appendChild(div);
    scrollBottom();
  }

  // ── SEND MESSAGE ──────────────────────────────────────────────────────────
  async function sendMessage(text) {
    text = (text || input.value).trim();
    if (!text || isTyping) return;

    input.value = '';
    autoResize();

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    // Trim history to max
    if (history.length > MAX_HISTORY) {
      history = history.slice(history.length - MAX_HISTORY);
    }

    setInputLock(true);
    showTyping();
    dot.classList.remove('visible');

    try {
      var res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: history
        })
      });

      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error ' + res.status);

      var reply = (data.content || []).map(function(b){ return b.text || ''; }).join('').trim();
      if (!reply) throw new Error('Respuesta vacía');

      history.push({ role: 'assistant', content: reply });

      hideTyping();
      addMessage('bot', reply);

    } catch (err) {
      hideTyping();
      addMessage('bot', '⚠️ Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo en unos segundos.');
      history.pop(); // remove failed user message from history
      console.error('Asistente error:', err);
    }

    setInputLock(false);
    input.focus();
  }

  // ── INPUT AUTO-RESIZE ─────────────────────────────────────────────────────
  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  }

  input.addEventListener('input', autoResize);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', function() { sendMessage(); });

  // ── TOGGLE OPEN/CLOSE ─────────────────────────────────────────────────────
  document.getElementById('pkABtn').addEventListener('click', function() {
    isOpen = !isOpen;
    wrap.classList.toggle('open', isOpen);
    dot.classList.remove('visible');
    if (isOpen) {
      showWelcome();
      setTimeout(function(){ input.focus(); }, 250);
    }
  });

  // ── CLEAR CONVERSATION ────────────────────────────────────────────────────
  clearBtn.addEventListener('click', function() {
    history = [];
    messages.innerHTML = '';
    hasShownWelcome = false;
    showWelcome();
  });

  // ── SHOW DOT AFTER 3s IF CLOSED ───────────────────────────────────────────
  setTimeout(function() {
    if (!isOpen) dot.classList.add('visible');
  }, 3000);

})();
