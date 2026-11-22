const axios = require('axios');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const multer = require('multer');

const PROVIDER = 'gmail';
const BUCKET = 'velox-comprobantes';
const INVOICE_ACCOUNT = (process.env.GMAIL_INVOICE_ACCOUNT_EMAIL || 'pizanorvey@gmail.com').toLowerCase();
const MAX_MESSAGES = 1000;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const uploadManualInvoice = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 8, parts: 10 },
    fileFilter: (_req, file, callback) => file.mimetype === 'application/pdf'
        ? callback(null, true)
        : callback(new Error('Sube la factura en formato PDF.'))
});

function keyFor(purpose) {
    const master = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!master) throw new Error('Falta la clave privada de Supabase para proteger la integración.');
    return crypto.createHmac('sha256', master).update(`velox:${purpose}:v1`).digest();
}

function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyFor('gmail-token'), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function decrypt(value) {
    const [ivText, tagText, ciphertextText] = String(value || '').split('.');
    if (!ivText || !tagText || !ciphertextText) throw new Error('La conexión de Gmail está incompleta. Vuelve a conectarla.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor('gmail-token'), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, 'base64url')),
        decipher.final()
    ]).toString('utf8'));
}

function googleConfig() {
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return null;
    const explicit = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
    const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
    const staticUrl = String(process.env.RAILWAY_STATIC_URL || '').trim();
    const baseUrl = domain ? `https://${domain}` : staticUrl.replace(/\/$/, '');
    const redirectUri = explicit || (baseUrl ? `${baseUrl}/api/admin/integraciones/gmail/callback` : '');
    return redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

function firmarEstado(userId, accountEmail = INVOICE_ACCOUNT) {
    const payload = Buffer.from(JSON.stringify({ userId, accountEmail, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomBytes(18).toString('base64url') })).toString('base64url');
    const signature = crypto.createHmac('sha256', keyFor('gmail-oauth-state')).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function verificarEstado(state) {
    const [payload, signature] = String(state || '').split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', keyFor('gmail-oauth-state')).update(payload).digest();
    let provided;
    try { provided = Buffer.from(signature, 'base64url'); } catch { return null; }
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return data.exp > Date.now() && data.userId ? data : null;
    } catch { return null; }
}

function callbackError(res, message) {
    return res.redirect(`/admin-costos?gmail_error=${encodeURIComponent(message)}`);
}

function headerMap(message) {
    return Object.fromEntries((message.payload?.headers || []).map(h => [String(h.name || '').toLowerCase(), h.value || '']));
}

function decodePart(data) {
    if (!data) return '';
    return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function collectParts(part, result = { plain: [], html: [], attachments: [] }) {
    if (!part) return result;
    const filename = String(part.filename || '').trim();
    if (filename && part.body?.attachmentId) {
        result.attachments.push({ filename, mimeType: part.mimeType || '', attachmentId: part.body.attachmentId });
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
        result.plain.push(decodePart(part.body.data));
    } else if (part.mimeType === 'text/html' && part.body?.data) {
        result.html.push(decodePart(part.body.data));
    }
    for (const child of part.parts || []) collectParts(child, result);
    return result;
}

function plainFromHtml(html) {
    return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
        .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ').trim();
}

function parseAmount(text) {
    let value = String(text || '').replace(/\s/g, '');
    const dot = value.lastIndexOf('.');
    const comma = value.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
        const decimal = Math.max(dot, comma);
        const integerPart = value.slice(0, decimal).replace(/[.,]/g, '');
        const decimalPart = value.slice(decimal + 1);
        value = decimalPart.length === 2 ? `${integerPart}.${decimalPart}` : `${integerPart}${decimalPart}`;
    } else if (dot >= 0 || comma >= 0) {
        const separator = Math.max(dot, comma);
        const fractionLength = value.length - separator - 1;
        value = fractionLength === 2 ? value.slice(0, separator).replace(/[.,]/g, '') + '.' + value.slice(separator + 1) : value.replace(/[.,]/g, '');
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
}

function parseInvoice(text, subject, receivedAt, provider) {
    const searchable = `${subject || ''}\n${text || ''}`;
    const numberMatch = searchable.match(/(?:invoice|receipt|factura)\s*(?:number|no\.?|#|id|número|nro)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
    const paidContext = /\b(amount paid|paid successfully|payment received|payment was successful|charged successfully|receipt for your payment|pago recibido|pagado|valor pagado|comprobante de pago|recibimos tu pago)\b/i.test(searchable);
    const candidates = [];
    const totalLabel = /(?:amount\s+paid|total\s+paid|total\s+due|invoice\s+total|total\s+amount|valor\s+pagado|total\s+pagado|total\s+de\s+la\s+factura|total|valor)/ig;
    let match;
    while ((match = totalLabel.exec(searchable)) && candidates.length < 10) {
        const surrounding = searchable.slice(match.index, match.index + 180);
        const amount = surrounding.match(/(?:US\s?\$|USD\s?\$?|COP\s?\$?|\$)\s?([\d.,]+)/i);
        if (!amount) continue;
        const currency = /\bCOP\b/i.test(surrounding) || provider === 'claro' ? 'COP' : 'USD';
        const value = parseAmount(amount[1]);
        if (value != null) candidates.push({ value, currency, label: match[0].toLowerCase() });
    }
    const best = candidates.find(x => x.label.includes('paid')) || candidates.find(x => x.label.includes('total')) || null;
    const uniqueValues = new Set(candidates.map(x => `${x.currency}:${x.value}`));
    const unique = Boolean(best && uniqueValues.size === 1);
    const date = receivedAt ? new Date(receivedAt) : new Date();
    return {
        invoiceNumber: numberMatch?.[1] || null,
        invoiceDate: Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10),
        amount: unique ? best.value : null,
        paidAmount: unique && paidContext ? best.value : null,
        currency: unique ? best.currency : 'USD',
        status: paidContext && unique ? 'paid' : 'pending_review',
        extractionNote: unique
            ? (paidContext ? 'Importe y pago detectados desde el comprobante; conserva el original para verificarlo.' : 'Importe detectado, pero el mensaje no confirma claramente que ya se haya pagado.')
            : 'Se guardó el comprobante original; el importe no se pudo identificar con suficiente certeza y requiere revisión.'
    };
}

function detectarFechaFactura(text) {
    const match = String(text || '').match(/(?:invoice date|issue date|date issued|fecha de factura|fecha de emisión|fecha de emision)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})/i);
    if (!match) return null;
    const date = new Date(match[1] + 'T00:00:00Z');
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] ? null : match[1];
}

function detectarMonedaFactura(text) {
    const source = String(text || '');
    const cop = /\bCOP\b|COP\$|pesos colombianos|colombian pesos/i.test(source);
    const usd = /\bUSD\b|US\$|U\.S\.\s*dollars?/i.test(source);
    return cop === usd ? null : cop ? 'COP' : 'USD';
}

async function leerDatosFactura(file, provider) {
    if (!file || file.buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Selecciona un archivo PDF válido.');
    const pdf = await pdfParse(file.buffer);
    const text = String(pdf.text || '');
    const parsed = parseInvoice(text, file.originalname, new Date().toISOString(), provider);
    return {
        amount: parsed.amount,
        currency: detectarMonedaFactura(text),
        invoice_date: detectarFechaFactura(text),
        invoice_number: parsed.invoiceNumber,
        proveedor_detectado: detectarProveedorDocumento(text),
        texto_detectado: Boolean(text.trim())
    };
}

async function ensureBucket(supabaseAdmin) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: `${MAX_PDF_BYTES}`,
        allowedMimeTypes: ['application/pdf', 'text/plain', 'message/rfc822']
    });
    if (error && !/already exists|duplicate/i.test(error.message || '')) throw error;
}

async function getIntegration(supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('velox_admin_integrations').select('*').eq('provider', PROVIDER).maybeSingle();
    if (error) throw error;
    return data || null;
}

async function tokenRequest(config, payload) {
    const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...payload });
    const { data } = await axios.post('https://oauth2.googleapis.com/token', form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000
    });
    return data;
}

async function getAccessToken(supabaseAdmin, config, integration) {
    const credentials = decrypt(integration.credentials_ciphertext);
    const refreshed = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: credentials.refresh_token });
    credentials.access_token = refreshed.access_token;
    credentials.expires_at = Date.now() + (Number(refreshed.expires_in) || 3600) * 1000;
    const { error } = await supabaseAdmin.from('velox_admin_integrations').update({
        credentials_ciphertext: encrypt(credentials), token_expires_at: new Date(credentials.expires_at).toISOString(), updated_at: new Date().toISOString()
    }).eq('provider', PROVIDER);
    if (error) throw error;
    return credentials.access_token;
}

async function gmailGet(accessToken, path, params = {}) {
    const { data } = await axios.get(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, params, timeout: 25000
    });
    return data;
}

const PROVIDER_RULES = {
    railway: { domains: ['railway.app', 'railway.com'], names: /\brailway\b/i },
    supabase: { domains: ['supabase.com'], names: /\bsupabase\b/i },
    openai: { domains: ['openai.com'], names: /\bopenai\b|\bchatgpt\b/i },
    meta: { domains: ['facebookmail.com', 'meta.com'], names: /\bmeta\b|\bfacebook\b/i },
    claro: { domains: ['claro.com.co', 'comcel.com.co'], names: /\bclaro\b|\bcomcel\b/i }
};

function detectarProveedor(fromDomain, content) {
    let custom = {};
    try { custom = JSON.parse(process.env.INVOICE_PROVIDER_SENDERS_JSON || '{}'); } catch { /* Use the built-in sender list. */ }
    for (const [provider, rule] of Object.entries(PROVIDER_RULES)) {
        const extra = Array.isArray(custom[provider]) ? custom[provider].map(x => String(x).toLowerCase()) : [];
        const directSenderOk = [...rule.domains, ...extra].some(domain => fromDomain === domain || fromDomain.endsWith(`.${domain}`));
        if (directSenderOk) return provider;
        if ((fromDomain === 'stripe.com' || fromDomain.endsWith('.stripe.com')) && rule.names.test(content)) return provider;
    }
    return null;
}
function detectarProveedorDocumento(text) {
    const cabecera = String(text || '').slice(0, 6000);
    const suscripcionCodex = /\bcodex\b/i.test(cabecera) ||
        (/\bchatgpt\b/i.test(cabecera) && /\b(plus|pro|subscription|suscripci[oó]n|monthly|mensual|plan)\b/i.test(cabecera));
    if (suscripcionCodex) return 'otro';
    const coincidencias = Object.entries(PROVIDER_RULES)
        .filter(([, rule]) => rule.names.test(cabecera))
        .map(([provider]) => provider);
    return coincidencias.length === 1 ? coincidencias[0] : null;
}

function dominiosRemitentesConfigurados() {
    let custom = {};
    try { custom = JSON.parse(process.env.INVOICE_PROVIDER_SENDERS_JSON || '{}'); } catch { /* Ignore malformed optional configuration. */ }
    return [...new Set(Object.values(custom).flatMap(value => Array.isArray(value) ? value : [])
        .map(value => String(value).trim().toLowerCase())
        .filter(value => /^[a-z0-9.-]+$/.test(value)))];
}

async function syncAllProviderInvoices(supabaseAdmin, config) {
    const integration = await getIntegration(supabaseAdmin);
    if (!integration) return { conectado: false, importadas: 0, mensaje: 'Conecta el correo de facturas para comenzar.' };
    const accessToken = await getAccessToken(supabaseAdmin, config, integration);
    await ensureBucket(supabaseAdmin);
    const domains = [...new Set(['railway.app', 'railway.com', 'supabase.com', 'openai.com', 'facebookmail.com', 'meta.com', 'claro.com.co', 'comcel.com.co', 'stripe.com', ...dominiosRemitentesConfigurados()])];
    const baseQuery = `{${domains.map(domain => `from:${domain}`).join(' ')}} {invoice receipt factura facturación payment pago billing cobro}`;
    const lastSync = integration.last_synced_at ? Date.parse(integration.last_synced_at) : NaN;
    const after = Number.isFinite(lastSync)
        ? ` after:${new Date(lastSync - 48 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '/')}`
        : '';
    const query = `${baseQuery}${after}`;
    const messages = [];
    let pageToken;
    while (messages.length < MAX_MESSAGES) {
        const page = await gmailGet(accessToken, 'messages', { q: query, maxResults: Math.min(100, MAX_MESSAGES - messages.length), pageToken });
        messages.push(...(page.messages || []));
        pageToken = page.nextPageToken;
        if (!pageToken || !(page.messages || []).length) break;
    }
    let importadas = 0;
    let omitidas = 0;
    for (const item of messages) {
        const message = await gmailGet(accessToken, `messages/${encodeURIComponent(item.id)}`, { format: 'full' });
        const headers = headerMap(message);
        const from = String(headers.from || '').slice(0, 500);
        const subject = String(headers.subject || 'Comprobante de plataforma').slice(0, 500);
        const fromDomain = from.match(/@([a-z0-9.-]+)/i)?.[1]?.toLowerCase() || '';
        const extracted = collectParts(message.payload);
        const bodyText = [...extracted.plain, ...extracted.html.map(plainFromHtml)].join('\n').slice(0, 50000);
        const provider = detectarProveedor(fromDomain, `${subject}\n${bodyText}`);
        if (!provider) { omitidas++; continue; }
        const existing = await supabaseAdmin.from('velox_platform_invoices').select('id').eq('provider', provider).eq('source_message_id', item.id).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) { omitidas++; continue; }
        const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
        const files = [];
        let fileSha256 = null;
        let parseText = bodyText;
        const original = await gmailGet(accessToken, `messages/${encodeURIComponent(item.id)}`, { format: 'raw' });
        const originalBytes = Buffer.from(String(original.raw || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (originalBytes.length && originalBytes.length <= MAX_PDF_BYTES) {
            const originalPath = `${provider}/${new Date().getUTCFullYear()}/${item.id}/correo-original.eml`;
            const upload = await supabaseAdmin.storage.from(BUCKET).upload(originalPath, originalBytes, { contentType: 'message/rfc822', upsert: true });
            if (upload.error) throw upload.error;
            files.push({ path: originalPath, name: 'correo-original.eml', mimeType: 'message/rfc822' });
        }
        for (const attachment of extracted.attachments) {
            if (!/\.pdf$/i.test(attachment.filename) && attachment.mimeType !== 'application/pdf') continue;
            const part = await gmailGet(accessToken, `messages/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.attachmentId)}`);
            const bytes = Buffer.from(String(part.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
            if (!bytes.length || bytes.length > MAX_PDF_BYTES) continue;
            const attachmentHash = crypto.createHash('sha256').update(bytes).digest('hex');
            if (!fileSha256) fileSha256 = attachmentHash;
            const fileName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'factura.pdf';
            const filePath = `${provider}/${new Date().getUTCFullYear()}/${item.id}/${fileName}`;
            const upload = await supabaseAdmin.storage.from(BUCKET).upload(filePath, bytes, { contentType: 'application/pdf', upsert: true });
            if (upload.error) throw upload.error;
            files.push({ path: filePath, name: fileName, mimeType: 'application/pdf' });
            try { parseText += `\n${(await pdfParse(bytes)).text || ''}`; } catch { /* The original PDF remains stored for review. */ }
        }
        if (!files.length) {
            const receipt = `${provider} email receipt\nFrom: ${from}\nSubject: ${subject}\nReceived: ${receivedAt || ''}\n\n${bodyText}`;
            const filePath = `${provider}/${new Date().getUTCFullYear()}/${item.id}/comprobante.txt`;
            const upload = await supabaseAdmin.storage.from(BUCKET).upload(filePath, Buffer.from(receipt, 'utf8'), { contentType: 'text/plain', upsert: true });
            if (upload.error) throw upload.error;
            files.push({ path: filePath, name: 'comprobante.txt', mimeType: 'text/plain' });
        }
        const parsed = parseInvoice(parseText, subject, receivedAt, provider);
        const externalId = parsed.invoiceNumber ? `invoice:${parsed.invoiceNumber}` : `gmail:${item.id}`;
        const row = {
            provider, source_message_id: item.id, source_external_id: externalId,
            invoice_number: parsed.invoiceNumber, invoice_date: parsed.invoiceDate, status: parsed.status,
            amount: parsed.amount, paid_amount: parsed.paidAmount, currency: parsed.currency,
            description: `Factura o comprobante de ${provider}`, email_subject: subject, email_from: from,
            source_received_at: receivedAt, file_paths: files, file_sha256: fileSha256, extraction_note: parsed.extractionNote
        };
        const { error } = await supabaseAdmin.from('velox_platform_invoices').upsert(row, { onConflict: 'provider,source_message_id', ignoreDuplicates: true });
        if (error?.code === '23505') {
            const paths = files.map(file => file.path).filter(Boolean);
            if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
            omitidas++;
            continue;
        }
        if (error) throw error;
        importadas++;
    }
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin.from('velox_admin_integrations').update({ last_synced_at: now, updated_at: now }).eq('provider', PROVIDER);
    if (updateError) throw updateError;
    return { conectado: true, importadas, omitidas, total_consultadas: messages.length, sincronizado_en: now };
}

function registrarRutasFacturas({ app, supabaseAdmin, autenticarAdminPlataforma, esAdminId }) {
    app.get('/api/admin/integraciones/gmail/estado', autenticarAdminPlataforma, async (req, res) => {
        try {
            const integration = await getIntegration(supabaseAdmin);
            res.json({ configurado: Boolean(googleConfig()), redirect_uri: googleConfig()?.redirectUri || null, conectado: Boolean(integration), correo: integration?.account_email || INVOICE_ACCOUNT, ultima_sync: integration?.last_synced_at || null });
        } catch (error) { res.status(503).json({ error: 'No se pudo consultar la conexión de facturas.' }); }
    });

    app.post('/api/admin/integraciones/gmail/conectar', autenticarAdminPlataforma, (req, res) => {
        try {
            const config = googleConfig();
            if (!config) return res.status(503).json({ error: 'Falta configurar el cliente OAuth de Google en Railway.' });
            const accountEmail = String(req.body?.email || INVOICE_ACCOUNT).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(accountEmail)) return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
            const state = firmarEstado(req.adminPlataforma.id, accountEmail);
            const params = new URLSearchParams({
                client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
                scope: 'openid email https://www.googleapis.com/auth/gmail.readonly', access_type: 'offline', prompt: 'consent',
                login_hint: accountEmail, state
            });
            res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
        } catch (error) { res.status(503).json({ error: 'No se pudo iniciar la conexión segura con Gmail.' }); }
    });

    app.get('/api/admin/integraciones/gmail/callback', async (req, res) => {
        try {
            if (req.query.error) return callbackError(res, 'Google no autorizó el acceso al correo.');
            const state = verificarEstado(req.query.state);
            if (!state || !esAdminId(state.userId)) return callbackError(res, 'La autorización venció. Inicia la conexión otra vez desde el panel.');
            const config = googleConfig();
            if (!config || !req.query.code) return callbackError(res, 'No se completó la autorización de Google.');
            const tokens = await tokenRequest(config, { code: String(req.query.code), grant_type: 'authorization_code', redirect_uri: config.redirectUri });
            const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, timeout: 15000 });
            const email = String(profile.email || '').toLowerCase();
            const accountEmail = String(state.accountEmail || INVOICE_ACCOUNT).trim().toLowerCase();
            if (profile.verified_email !== true || email !== accountEmail) return callbackError(res, `Google autorizó ${email || 'otra cuenta'}; seleccionaste ${accountEmail}. Vuelve a iniciar sesión con el correo indicado.`);
            const previous = await getIntegration(supabaseAdmin);
            const old = previous ? decrypt(previous.credentials_ciphertext) : {};
            const refreshToken = tokens.refresh_token || old.refresh_token;
            if (!refreshToken) return callbackError(res, 'Google no entregó permiso persistente. Vuelve a autorizar y acepta el acceso al correo.');
            const credentials = { refresh_token: refreshToken, access_token: tokens.access_token, expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000 };
            const { error } = await supabaseAdmin.from('velox_admin_integrations').upsert({
                provider: PROVIDER, account_email: email, credentials_ciphertext: encrypt(credentials),
                token_expires_at: new Date(credentials.expires_at).toISOString(), updated_at: new Date().toISOString()
            }, { onConflict: 'provider' });
            if (error) throw error;
            return res.redirect('/admin-costos?gmail=connected');
        } catch (error) {
            console.error('No se pudo finalizar la conexión de facturas:', error.response?.status || error.message);
            return callbackError(res, 'No se pudo guardar la autorización de Gmail. Revisa la configuración OAuth y vuelve a intentarlo.');
        }
    });

    app.post('/api/admin/facturas/sync', autenticarAdminPlataforma, async (req, res) => {
        try {
            const config = googleConfig();
            if (!config) return res.status(503).json({ error: 'Falta configurar el cliente OAuth de Google en Railway.' });
            res.json(await syncAllProviderInvoices(supabaseAdmin, config));
        } catch (error) {
            const status = error.response?.status;
            console.error('Error sincronizando facturas y comprobantes:', status || error.code || error.message);
            res.status(status === 401 || status === 403 ? 502 : 503).json({ error: status === 401 || status === 403 ? 'Gmail rechazó la conexión. Reconecta el correo desde el panel.' : 'No se pudieron sincronizar los comprobantes. Reintenta desde el panel.' });
        }
    });

    app.post('/api/admin/facturas/leer', autenticarAdminPlataforma,
        (req, res, next) => uploadManualInvoice.single('comprobante')(req, res, error => {
            if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'El PDF supera el límite de 12 MB.' : error.message });
            next();
        }),
        async (req, res) => {
            try {
                const provider = String(req.body.provider || '').trim().toLowerCase();
                if (!['railway', 'supabase', 'openai', 'meta', 'claro', 'otro'].includes(provider)) {
                    return res.status(400).json({ error: 'Selecciona el programa de la factura.' });
                }
                const fields = await leerDatosFactura(req.file, provider);
                res.json(fields);
            } catch (error) {
                res.status(422).json({ error: error.message || 'No se pudo leer el PDF.' });
            }
        });

    app.post('/api/admin/facturas/manual', autenticarAdminPlataforma,
        (req, res, next) => uploadManualInvoice.single('comprobante')(req, res, error => {
            if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'El PDF supera el límite de 12 MB.' : error.message });
            next();
        }),
        async (req, res) => {
            let filePath = null;
            try {
                const file = req.file;
                if (!file || file.buffer.subarray(0, 5).toString() !== '%PDF-') {
                    return res.status(400).json({ error: 'Selecciona un archivo PDF válido.' });
                }
                const provider = String(req.body.provider || '').trim().toLowerCase();
                const providerCustom = String(req.body.provider_custom || '').trim().slice(0, 80) || null;
                const allowedProviders = new Set(['railway', 'supabase', 'openai', 'meta', 'claro', 'otro']);
                if (!allowedProviders.has(provider)) return res.status(400).json({ error: 'Selecciona el proveedor de la factura.' });
                if (provider === 'otro' && !providerCustom) return res.status(400).json({ error: 'Escribe el nombre del servicio o proveedor.' });
                const pdfText = await pdfParse(file.buffer);
                const proveedorDetectado = detectarProveedorDocumento(pdfText.text);
                const esCodexOpenAI = provider === 'otro' && proveedorDetectado === 'openai' && /codex|chatgpt/i.test(providerCustom || '');
                if (proveedorDetectado && proveedorDetectado !== provider && !esCodexOpenAI) {
                    const nombres = { railway: 'Railway', supabase: 'Supabase', openai: 'OpenAI', meta: 'Meta', claro: 'Claro' };
                    return res.status(422).json({ error: `El PDF parece ser de ${nombres[proveedorDetectado]}. Cambia el proveedor seleccionado antes de guardarlo.` });
                }

                const fileSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
                const { data: duplicateFile, error: duplicateFileError } = await supabaseAdmin.from('velox_platform_invoices')
                    .select('id, provider, invoice_date').eq('file_sha256', fileSha256).maybeSingle();
                if (duplicateFileError) throw duplicateFileError;
                if (duplicateFile) {
                    return res.status(409).json({ error: 'Este mismo PDF ya está guardado. No se volvió a sumar el gasto.' });
                }

                const amountInput = String(req.body.amount || '').trim();
                const amount = parseAmount(amountInput);
                if (!Number.isFinite(amount) || amount <= 0) {
                    return res.status(422).json({ error: 'No pude leer un total único. Escribe el importe del PDF y vuelve a guardar.' });
                }

                const invoiceDate = String(req.body.invoice_date || '').trim();
                if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
                    return res.status(422).json({ error: 'No pude confirmar la fecha. Escríbela en el campo Fecha de factura y vuelve a guardar.' });
                }
                const dateCheck = new Date(invoiceDate + 'T00:00:00Z');
                if (Number.isNaN(dateCheck.getTime()) || dateCheck.toISOString().slice(0, 10) !== invoiceDate) {
                    return res.status(400).json({ error: 'La fecha de factura no es válida.' });
                }

                const currency = String(req.body.currency || '').trim().toUpperCase();
                if (!['COP', 'USD'].includes(currency)) {
                    return res.status(422).json({ error: 'No pude confirmar si el valor está en COP o USD. Selecciona la moneda y vuelve a guardar.' });
                }
                const status = String(req.body.status || '').trim();
                if (!['paid', 'open'].includes(status)) return res.status(400).json({ error: 'Indica si la factura está pagada o pendiente.' });

                const invoiceNumber = String(req.body.invoice_number || '').trim().slice(0, 120) || null;
                const providerIdentity = provider === 'otro' ? (providerCustom || 'otro').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') : provider;
                const externalId = invoiceNumber ? 'invoice:' + providerIdentity + ':' + invoiceNumber : null;
                if (externalId) {
                    const { data: duplicate, error: duplicateError } = await supabaseAdmin.from('velox_platform_invoices')
                        .select('id').eq('provider', provider).eq('source_external_id', externalId).maybeSingle();
                    if (duplicateError) throw duplicateError;
                    if (duplicate) return res.status(409).json({ error: 'Ya existe un comprobante de ese proveedor con ese número. Revisa la lista antes de volverlo a cargar.' });
                }

                await ensureBucket(supabaseAdmin);
                const id = crypto.randomUUID();
                const safeName = String(file.originalname || 'factura.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'factura.pdf';
                filePath = provider + '/manual/' + invoiceDate.slice(0, 7) + '/' + id + '.pdf';
                const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(filePath, file.buffer, {
                    contentType: 'application/pdf', upsert: false
                });
                if (uploadError) throw uploadError;

                const receivedAt = new Date().toISOString();
                const extractionNote = 'Importe, fecha y moneda revisados en el panel; comprobante original guardado. Sin uso de IA.';
                const row = {
                    provider,
                    source_message_id: 'manual:' + id,
                    source_external_id: externalId,
                    file_sha256: fileSha256,
                    invoice_number: invoiceNumber,
                    invoice_date: invoiceDate,
                    status,
                    amount,
                    paid_amount: status === 'paid' ? amount : null,
                    currency,
                    provider_custom: provider === 'otro' ? providerCustom : null,
                    description: 'Factura cargada manualmente de ' + (providerCustom || provider),
                    email_subject: 'Archivo subido manualmente',
                    email_from: null,
                    source_received_at: receivedAt,
                    file_paths: [{ path: filePath, name: safeName, mimeType: 'application/pdf' }],
                    extraction_note: extractionNote
                };
                const { data, error } = await supabaseAdmin.from('velox_platform_invoices').insert(row).select('id').single();
                if (error) throw error;
                return res.status(201).json({
                    id: data.id, amount, currency, invoice_date: invoiceDate,
                    expense_registered: provider !== 'openai',
                    message: provider === 'openai'
                        ? 'Comprobante guardado. OpenAI ya se cuenta desde su reporte de costos para evitar duplicarlo.'
                        : 'Comprobante guardado y gasto sumado automáticamente al libro financiero.'
                });
            } catch (error) {
                if (filePath) {
                    try { await supabaseAdmin.storage.from(BUCKET).remove([filePath]); } catch {}
                }
                if (error.code === '23505') return res.status(409).json({ error: 'Este comprobante ya se guardó. No se volvió a sumar el gasto.' });
                console.error('No se pudo guardar la factura manual:', error.message);
                res.status(503).json({ error: 'No se pudo guardar la factura. Verifica que el PDF sea legible y vuelve a intentarlo.' });
            }
        });

    app.get('/api/admin/finanzas/servicios-personalizados', autenticarAdminPlataforma, async (_req, res) => {
        try {
            const [movimientos, facturas] = await Promise.all([
                supabaseAdmin.from('velox_financial_entries').select('servicio_personalizado').not('servicio_personalizado', 'is', null).limit(10000),
                supabaseAdmin.from('velox_platform_invoices').select('provider_custom').not('provider_custom', 'is', null).limit(10000)
            ]);
            if (movimientos.error || facturas.error) throw movimientos.error || facturas.error;
            const servicios = [...new Set([
                ...(movimientos.data || []).map(row => row.servicio_personalizado),
                ...(facturas.data || []).map(row => row.provider_custom)
            ].map(value => String(value || '').trim().slice(0, 80)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
            return res.json({ servicios });
        } catch (error) {
            console.error('No se pudieron cargar servicios personalizados:', error.message);
            return res.status(503).json({ error: 'No se pudieron cargar las sugerencias de servicios.' });
        }
    });

    app.get('/api/admin/facturas', autenticarAdminPlataforma, async (req, res) => {
        try {
            const pageValue = Number.parseInt(req.query.page, 10);
            const sizeValue = Number.parseInt(req.query.limit, 10);
            const page = Number.isFinite(pageValue) ? Math.max(1, Math.min(pageValue, 1000)) : 1;
            const pageSize = Number.isFinite(sizeValue) ? (sizeValue === 50 ? 50 : 25) : 25;
            const needed = page * pageSize;
            const provider = ['railway', 'supabase', 'openai', 'meta', 'claro', 'otro'].includes(String(req.query.provider || ''))
                ? String(req.query.provider) : 'all';
            const status = ['active', 'void'].includes(String(req.query.status || ''))
                ? String(req.query.status) : 'all';
            const search = String(req.query.q || '').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s_-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
            const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
            const from = validDate(req.query.from);
            const to = validDate(req.query.to);
            const knownProviders = '(railway,supabase,openai,meta,claro)';
            const invoiceColumns = 'id, provider, provider_custom, invoice_number, invoice_date, status, amount, paid_amount, currency, description, email_subject, source_received_at, file_paths, extraction_note, imported_at';
            const movementColumns = 'id, categoria, servicio_personalizado, descripcion, monto, moneda, fecha, referencia, anulado_en, factura_id';

            const filterQuery = (query, providerColumn, invoiceTable) => {
                if (provider !== 'all') {
                    query = provider === 'otro'
                        ? query.not(providerColumn, 'in', knownProviders)
                        : query.eq(providerColumn, provider);
                }
                if (invoiceTable) {
                    if (status === 'active') query = query.not('status', 'in', '(void,refunded)');
                    if (status === 'void') query = query.in('status', ['void', 'refunded']);
                    if (from) query = query.gte('invoice_date', from);
                    if (to) query = query.lte('invoice_date', to);
                    if (search) query = query.or('invoice_number.ilike.%' + search + '%,email_subject.ilike.%' + search + '%,description.ilike.%' + search + '%,provider_custom.ilike.%' + search + '%');
                } else {
                    if (status === 'active') query = query.is('anulado_en', null);
                    if (status === 'void') query = query.not('anulado_en', 'is', null);
                    if (from) query = query.gte('fecha', from);
                    if (to) query = query.lte('fecha', to);
                    if (search) query = query.or('descripcion.ilike.%' + search + '%,referencia.ilike.%' + search + '%,servicio_personalizado.ilike.%' + search + '%');
                }
                return query;
            };
            const createInvoiceQuery = countOnly => {
                let query = supabaseAdmin.from('velox_platform_invoices').select(
                    countOnly ? 'id' : invoiceColumns,
                    countOnly ? { count: 'exact', head: true } : {}
                );
                query = filterQuery(query, 'provider', true);
                if (!countOnly) query = query.order('invoice_date', { ascending: false, nullsFirst: false }).order('source_received_at', { ascending: false, nullsFirst: false });
                return query;
            };
            const createMovementQuery = countOnly => {
                let query = supabaseAdmin.from('velox_financial_entries')
                    .select(countOnly ? 'id' : movementColumns, countOnly ? { count: 'exact', head: true } : {})
                    .eq('tipo', 'gasto').is('factura_id', null);
                query = filterQuery(query, 'categoria', false);
                if (!countOnly) query = query.order('fecha', { ascending: false });
                return query;
            };
            const [invoiceCountResult, movementCountResult] = await Promise.all([
                createInvoiceQuery(true),
                createMovementQuery(true)
            ]);
            if (invoiceCountResult.error) throw invoiceCountResult.error;
            if (movementCountResult.error) throw movementCountResult.error;
            const total = (invoiceCountResult.count || 0) + (movementCountResult.count || 0);
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const effectivePage = Math.min(page, totalPages);
            const prefixSize = effectivePage * pageSize;
            const cargarPrefijo = async (createQuery, count, neededRows) => {
                const rows = [];
                const chunkSize = 500;
                for (let offset = 0; offset < Math.min(count, neededRows); offset += chunkSize) {
                    const end = Math.min(offset + chunkSize, count, neededRows) - 1;
                    const { data, error } = await createQuery().range(offset, end);
                    if (error) throw error;
                    rows.push(...(data || []));
                    if (!data || data.length < end - offset + 1) break;
                }
                return rows;
            };
            const [facturasPrefijo, movimientosPrefijo] = await Promise.all([
                cargarPrefijo(createInvoiceQuery, invoiceCountResult.count || 0, prefixSize),
                cargarPrefijo(createMovementQuery, movementCountResult.count || 0, prefixSize)
            ]);
            const registros = [
                ...facturasPrefijo.map(invoice => ({
                    ...invoice,
                    tipoRegistro: 'factura',
                    fechaOrden: invoice.invoice_date || invoice.source_received_at || invoice.imported_at
                })),
                ...movimientosPrefijo.map(movimiento => ({
                    ...movimiento,
                    tipoRegistro: 'movimiento',
                    fechaOrden: movimiento.fecha
                }))
            ].sort((a, b) => new Date(b.fechaOrden || 0) - new Date(a.fechaOrden || 0));
            const pagina = registros.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
            res.json({
                facturas: pagina.filter(row => row.tipoRegistro === 'factura').map(({ file_paths, tipoRegistro, fechaOrden, ...invoice }) => ({
                    ...invoice,
                    files: (Array.isArray(file_paths) ? file_paths : []).map(({ name, mimeType }) => ({ name, mimeType }))
                })),
                movimientos: pagina.filter(row => row.tipoRegistro === 'movimiento').map(({ tipoRegistro, fechaOrden, ...movimiento }) => movimiento),
                total,
                pagina: effectivePage,
                paginas: totalPages,
                por_pagina: pageSize
            });
        } catch (error) {
            console.error('No se pudieron cargar facturas y movimientos del historial:', error.message);
            res.status(503).json({ error: 'No se pudieron cargar las facturas y movimientos guardados.' });
        }
    });

    app.patch('/api/admin/facturas/:id', autenticarAdminPlataforma, async (req, res) => {
        try {
            const amount = Number(req.body.amount);
            const invoiceDate = String(req.body.invoice_date || '').trim();
            const currency = String(req.body.currency || '').trim().toUpperCase();
            const status = String(req.body.status || '').trim();
            const invoiceNumber = String(req.body.invoice_number || '').trim().slice(0, 120) || null;
            if (!Number.isFinite(amount) || amount <= 0) return res.status(422).json({ error: 'El total debe ser mayor que cero.' });
            if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return res.status(422).json({ error: 'La fecha no es válida.' });
            const dateCheck = new Date(invoiceDate + 'T00:00:00Z');
            if (Number.isNaN(dateCheck.getTime()) || dateCheck.toISOString().slice(0, 10) !== invoiceDate) return res.status(422).json({ error: 'La fecha no es válida.' });
            if (!['COP', 'USD'].includes(currency)) return res.status(422).json({ error: 'Selecciona COP o USD.' });
            if (!['paid', 'open', 'void', 'refunded'].includes(status)) return res.status(422).json({ error: 'Selecciona un estado válido.' });

            const { data, error } = await supabaseAdmin.from('velox_platform_invoices')
                .update({ amount, paid_amount: status === 'paid' ? amount : null, invoice_date: invoiceDate, currency, invoice_number: invoiceNumber, status, extraction_note: 'Datos revisados o corregidos por el administrador.' })
                .eq('id', req.params.id).select('id').maybeSingle();
            if (error?.code === '23505') return res.status(409).json({ error: 'Ya existe una factura de este proveedor con ese número.' });
            if (error) throw error;
            if (!data) return res.sendStatus(404);
            return res.json({ ok: true, message: status === 'void' || status === 'refunded' ? 'Factura anulada; el comprobante se conserva y el gasto dejó de contar.' : 'Factura corregida y totales actualizados.' });
        } catch (error) {
            console.error('No se pudo actualizar la factura:', error.message);
            return res.status(503).json({ error: 'No se pudo actualizar la factura. Inténtalo otra vez.' });
        }
    });

    app.get('/api/admin/facturas/:id/archivo/:index', autenticarAdminPlataforma, async (req, res) => {
        try {
            const { data, error } = await supabaseAdmin.from('velox_platform_invoices').select('file_paths').eq('id', req.params.id).maybeSingle();
            if (error || !data) return res.sendStatus(404);
            const files = Array.isArray(data.file_paths) ? data.file_paths : [];
            const file = files[Number(req.params.index)];
            if (!file?.path) return res.sendStatus(404);
            const { data: signed, error: signError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(file.path, 60);
            if (signError || !signed?.signedUrl) return res.sendStatus(404);
            const download = await axios.get(signed.signedUrl, { responseType: 'stream', timeout: 15000 });
            res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${String(file.name || 'comprobante').replace(/["\\\r\n]/g, '_')}"`);
            download.data.pipe(res);
            return;
        } catch { return res.sendStatus(404); }
    });
    let backgroundSyncRunning = false;
    const syncInBackground = async () => {
        if (backgroundSyncRunning || !googleConfig()) return;
        backgroundSyncRunning = true;
        try {
            if (await getIntegration(supabaseAdmin)) await syncAllProviderInvoices(supabaseAdmin, googleConfig());
        } catch (error) {
            console.error('Sincronización automática de comprobantes pendiente:', error.response?.status || error.code || error.message);
        } finally { backgroundSyncRunning = false; }
    };
    const initialSync = setTimeout(syncInBackground, 45000);
    const periodicSync = setInterval(syncInBackground, 6 * 60 * 60 * 1000);
    initialSync.unref?.();
    periodicSync.unref?.();
}

module.exports = { registrarRutasFacturas };

