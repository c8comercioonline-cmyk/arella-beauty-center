require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE SETUP ──
const db = new Database(process.env.DB_PATH || './arella.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT NOT NULL,
    servico TEXT NOT NULL,
    data TEXT NOT NULL,
    horario TEXT NOT NULL,
    observacoes TEXT,
    status TEXT DEFAULT 'pendente',
    criado_em TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS contatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    mensagem TEXT NOT NULL,
    lido INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// Configurações padrão
const configDefaults = {
  whatsapp: '5531999999999',
  email_contato: 'contato@arellabh.com.br',
  email_smtp_host: 'smtp.gmail.com',
  email_smtp_port: '587',
  email_smtp_user: '',
  email_smtp_pass: '',
  horarios: 'Segunda a Sexta: 9h–19h | Sábados: 9h–16h',
  endereco: 'Belo Horizonte, MG',
  instagram: 'https://instagram.com/espacoarella',
  admin_senha: 'arella2025',
  sobre_texto: 'O Arella Beauty Center nasceu do desejo de transformar o cuidado pessoal em uma experiência única e sensorial.',
};

const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(configDefaults)) {
  insertConfig.run(k, v);
}

// ── EMAIL TRANSPORTER ──
function getTransporter() {
  const cfg = getConfig();
  if (!cfg.email_smtp_user) return null;
  return nodemailer.createTransport({
    host: cfg.email_smtp_host,
    port: parseInt(cfg.email_smtp_port),
    secure: false,
    auth: { user: cfg.email_smtp_user, pass: cfg.email_smtp_pass },
  });
}

function getConfig() {
  const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
  return Object.fromEntries(rows.map(r => [r.chave, r.valor]));
}

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { erro: 'Muitas requisições, tente em breve.' } });
app.use('/api/', apiLimiter);

// ── API: AGENDAMENTOS ──
app.post('/api/agendamentos', (req, res) => {
  try {
    const { nome, email, telefone, servico, data, horario, observacoes } = req.body;
    if (!nome || !telefone || !servico || !data || !horario) {
      return res.status(400).json({ erro: 'Campos obrigatórios: nome, telefone, serviço, data, horário.' });
    }

    const stmt = db.prepare(`
      INSERT INTO agendamentos (nome, email, telefone, servico, data, horario, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(nome, email || '', telefone, servico, data, horario, observacoes || '');

    // Enviar email de confirmação
    const cfg = getConfig();
    const transporter = getTransporter();
    if (transporter) {
      const dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
      // Email para o cliente
      if (email) {
        transporter.sendMail({
          from: `"Arella Beauty Center" <${cfg.email_smtp_user}>`,
          to: email,
          subject: '✨ Seu agendamento foi recebido — Arella Beauty Center',
          html: `
            <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#050D28;color:#fff;padding:40px">
              <div style="text-align:center;margin-bottom:32px">
                <h1 style="font-size:32px;font-weight:300;color:#C9A96E;letter-spacing:4px">ARELLA</h1>
                <p style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.5);text-transform:uppercase">Beauty Center</p>
              </div>
              <h2 style="font-size:24px;font-weight:300;margin-bottom:24px">Olá, ${nome}! 🌸</h2>
              <p style="color:rgba(255,255,255,0.7);line-height:1.8">Seu agendamento foi recebido com sucesso. Nossa equipe entrará em contato em breve para confirmar.</p>
              <div style="background:rgba(201,169,110,0.1);border:1px solid rgba(201,169,110,0.3);padding:24px;margin:28px 0">
                <p><strong style="color:#C9A96E">Serviço:</strong> ${servico}</p>
                <p><strong style="color:#C9A96E">Data:</strong> ${dataFmt}</p>
                <p><strong style="color:#C9A96E">Horário:</strong> ${horario}</p>
                ${observacoes ? `<p><strong style="color:#C9A96E">Obs:</strong> ${observacoes}</p>` : ''}
              </div>
              <p style="color:rgba(255,255,255,0.5);font-size:12px">Dúvidas? Fale conosco pelo WhatsApp: <a href="https://wa.me/${cfg.whatsapp}" style="color:#C9A96E">(31) 9 9999-9999</a></p>
              <div style="border-top:1px solid rgba(201,169,110,0.2);margin-top:32px;padding-top:20px;text-align:center">
                <p style="font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:2px">ARELLA BEAUTY CENTER · BELO HORIZONTE</p>
              </div>
            </div>`,
        }).catch(console.error);
      }
      // Notificação interna
      transporter.sendMail({
        from: `"Sistema Arella" <${cfg.email_smtp_user}>`,
        to: cfg.email_contato,
        subject: `📅 Novo agendamento: ${nome} — ${servico} em ${dataFmt}`,
        html: `<p><strong>Nome:</strong> ${nome}<br><strong>Tel:</strong> ${telefone}<br><strong>Email:</strong> ${email||'—'}<br><strong>Serviço:</strong> ${servico}<br><strong>Data:</strong> ${dataFmt} às ${horario}<br><strong>Obs:</strong> ${observacoes||'—'}</p>`,
      }).catch(console.error);
    }

    res.json({ ok: true, id: result.lastInsertRowid, mensagem: 'Agendamento recebido com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar agendamento.' });
  }
});

app.get('/api/agendamentos', adminAuth, (req, res) => {
  const { data, status } = req.query;
  let q = 'SELECT * FROM agendamentos WHERE 1=1';
  const params = [];
  if (data) { q += ' AND data = ?'; params.push(data); }
  if (status) { q += ' AND status = ?'; params.push(status); }
  q += ' ORDER BY data ASC, horario ASC';
  res.json(db.prepare(q).all(...params));
});

app.put('/api/agendamentos/:id', adminAuth, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/agendamentos/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM agendamentos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── API: CONTATO ──
app.post('/api/contato', (req, res) => {
  try {
    const { nome, email, telefone, mensagem } = req.body;
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ erro: 'Nome, email e mensagem são obrigatórios.' });
    }
    db.prepare('INSERT INTO contatos (nome, email, telefone, mensagem) VALUES (?, ?, ?, ?)').run(nome, email, telefone || '', mensagem);

    const cfg = getConfig();
    const transporter = getTransporter();
    if (transporter) {
      transporter.sendMail({
        from: `"${nome}" <${cfg.email_smtp_user}>`,
        to: cfg.email_contato,
        replyTo: email,
        subject: `📩 Contato via site: ${nome}`,
        html: `<p><strong>Nome:</strong> ${nome}<br><strong>Email:</strong> ${email}<br><strong>Tel:</strong> ${telefone||'—'}</p><p><strong>Mensagem:</strong><br>${mensagem}</p>`,
      }).catch(console.error);
    }

    res.json({ ok: true, mensagem: 'Mensagem enviada com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

app.get('/api/contatos', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM contatos ORDER BY criado_em DESC').all());
});

app.put('/api/contatos/:id/lido', adminAuth, (req, res) => {
  db.prepare('UPDATE contatos SET lido = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── API: CONFIGURAÇÕES ──
app.get('/api/config/publica', (req, res) => {
  const cfg = getConfig();
  res.json({
    whatsapp: cfg.whatsapp,
    horarios: cfg.horarios,
    endereco: cfg.endereco,
    instagram: cfg.instagram,
    sobre_texto: cfg.sobre_texto,
  });
});

app.get('/api/config', adminAuth, (req, res) => {
  const cfg = getConfig();
  delete cfg.admin_senha;
  res.json(cfg);
});

app.put('/api/config', adminAuth, (req, res) => {
  const updates = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)');
  for (const [k, v] of Object.entries(updates)) {
    if (k !== 'admin_senha') stmt.run(k, v);
  }
  res.json({ ok: true });
});

// ── API: STATS ──
app.get('/api/stats', adminAuth, (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const mes = hoje.slice(0, 7);
  res.json({
    hoje: db.prepare("SELECT COUNT(*) as c FROM agendamentos WHERE data = ?").get(hoje).c,
    mes: db.prepare("SELECT COUNT(*) as c FROM agendamentos WHERE data LIKE ?").get(mes + '%').c,
    total: db.prepare("SELECT COUNT(*) as c FROM agendamentos").get().c,
    pendentes: db.prepare("SELECT COUNT(*) as c FROM agendamentos WHERE status = 'pendente'").get().c,
    contatos_nao_lidos: db.prepare("SELECT COUNT(*) as c FROM contatos WHERE lido = 0").get().c,
  });
});

// ── API: AUTH ──
app.post('/api/auth', (req, res) => {
  const { senha } = req.body;
  const cfg = getConfig();
  if (senha === cfg.admin_senha) {
    res.json({ ok: true, token: Buffer.from(`arella:${senha}:${Date.now()}`).toString('base64') });
  } else {
    res.status(401).json({ erro: 'Senha incorreta.' });
  }
});

function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-token'] || req.query.token;
  const cfg = getConfig();
  if (!auth) return res.status(401).json({ erro: 'Token necessário.' });
  try {
    const decoded = Buffer.from(auth, 'base64').toString();
    if (decoded.startsWith(`arella:${cfg.admin_senha}:`)) return next();
  } catch {}
  res.status(401).json({ erro: 'Token inválido.' });
}

// ── API: HORÁRIOS DISPONÍVEIS ──
app.get('/api/horarios-disponiveis', (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ erro: 'Data necessária.' });
  const ocupados = db.prepare("SELECT horario FROM agendamentos WHERE data = ? AND status != 'cancelado'").all(data).map(r => r.horario);
  const todos = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30'];
  const disponiveis = todos.filter(h => !ocupados.includes(h));
  res.json({ disponiveis, ocupados });
});

// ── MAIN ROUTE ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`✨ Arella Beauty Center rodando na porta ${PORT}`));
