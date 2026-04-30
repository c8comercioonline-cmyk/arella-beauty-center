require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE SETUP (sql.js) ──
let db;
const DB_PATH = process.env.DB_PATH || './arella.db';

async function initDatabase() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  let data = null;
  if (fs.existsSync(DB_PATH)) {
    data = fs.readFileSync(DB_PATH);
  }
  db = new SQL.Database(data);
  createTables();
  seedData();

  // Salva o banco a cada 5 minutos para minimizar perda de dados
  setInterval(saveDatabase, 5 * 60 * 1000);

  if (process.env.RAILWAY_ENVIRONMENT) {
    console.warn('⚠️  ATENÇÃO: Rodando no Railway com banco de arquivos. Dados podem ser perdidos ao reiniciar o container.');
    console.warn('⚠️  Recomendado: migrar para PostgreSQL para persistência garantida.');
  }

  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function createTables() {
  db.run(`
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
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS contatos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefone TEXT,
      mensagem TEXT NOT NULL,
      lido INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      subtitulo TEXT,
      imagem_url TEXT,
      texto_botao TEXT,
      link_botao TEXT,
      posicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      tipo TEXT DEFAULT 'hero',
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      imagem_url TEXT,
      posicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS equipe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cargo TEXT,
      categoria TEXT DEFAULT 'est',
      foto_url TEXT,
      instagram TEXT,
      whatsapp TEXT,
      posicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS galeria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imagem_url TEXT NOT NULL,
      posicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS depoimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      texto TEXT NOT NULL,
      nome TEXT NOT NULL,
      funcao TEXT,
      tempo_cliente TEXT,
      posicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS instagram (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imagem_url TEXT NOT NULL,
      posicao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS seo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pagina TEXT UNIQUE,
      titulo TEXT,
      descricao TEXT,
      keywords TEXT,
      imagem_og TEXT
    )
  `);
}

// Helper para converter resultado sql.js em array de objetos
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0 };
}

// ── SEED DEFAULT DATA ──
function seedData() {
  const hasSlides = queryOne('SELECT COUNT(*) as c FROM slides')?.c || 0;
  if (!hasSlides) {
    runSql('INSERT INTO slides (titulo, subtitulo, imagem_url, texto_botao, link_botao, posicao, ativo, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Bem-vinda ao', 'Arella\nBeauty\nCenter', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1920&h=1080&fit=crop&q=80', 'Agendar Agora', '#age', 0, 1, 'hero']);
    runSql('INSERT INTO slides (titulo, subtitulo, imagem_url, texto_botao, link_botao, posicao, ativo, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Estética Avançada', 'Tratamentos que\nTransformam', 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1920&h=1080&fit=crop&q=80', 'Conhecer Serviços', '#servicos', 1, 1, 'hero']);
    runSql('INSERT INTO slides (titulo, subtitulo, imagem_url, texto_botao, link_botao, posicao, ativo, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Belo Horizonte, MG', 'Existimos para que seja\nvocê mesma', 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1920&h=1080&fit=crop&q=80', 'Nossa História', '#sobre', 2, 1, 'hero']);
  }

  const hasServicos = queryOne('SELECT COUNT(*) as c FROM servicos')?.c || 0;
  if (!hasServicos) {
    runSql('INSERT INTO servicos (nome, descricao, imagem_url, posicao, ativo) VALUES (?, ?, ?, ?, ?)',
      ['Limpeza de Pele', 'Tratamento profundo que remove impurezas e renova a luminosidade da pele.', 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&h=900&fit=crop&q=80', 0, 1]);
    runSql('INSERT INTO servicos (nome, descricao, imagem_url, posicao, ativo) VALUES (?, ?, ?, ?, ?)',
      ['Harmonização Facial', 'Procedimentos avançados para harmonizar e realçar sua beleza natural.', 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=700&h=900&fit=crop&q=80', 1, 1]);
    runSql('INSERT INTO servicos (nome, descricao, imagem_url, posicao, ativo) VALUES (?, ?, ?, ?, ?)',
      ['Design de Sobrancelha', 'Técnicas exclusivas para um olhar impecável e natural.', 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&h=900&fit=crop&q=80', 2, 1]);
    runSql('INSERT INTO servicos (nome, descricao, imagem_url, posicao, ativo) VALUES (?, ?, ?, ?, ?)',
      ['Estética Corporal', 'Modelagem, drenagem e tratamentos de alta tecnologia para o seu corpo.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&h=900&fit=crop&q=80', 3, 1]);
  }

  const hasEquipe = queryOne('SELECT COUNT(*) as c FROM equipe')?.c || 0;
  if (!hasEquipe) {
    runSql('INSERT INTO equipe (nome, cargo, categoria, foto_url, instagram, whatsapp, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Camila Arantes', 'Esteticista Sênior', 'est', 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=750&fit=crop&q=85', 'https://instagram.com/espacoarella', '5531999999999', 0, 1]);
    runSql('INSERT INTO equipe (nome, cargo, categoria, foto_url, instagram, whatsapp, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Fernanda Lima', 'Maquiadora', 'maq', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=750&fit=crop&q=85', 'https://instagram.com/espacoarella', '5531999999999', 1, 1]);
    runSql('INSERT INTO equipe (nome, cargo, categoria, foto_url, instagram, whatsapp, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Juliana Melo', 'Especialista em Harmonização', 'est', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=600&h=750&fit=crop&q=85', 'https://instagram.com/espacoarella', '5531999999999', 2, 1]);
    runSql('INSERT INTO equipe (nome, cargo, categoria, foto_url, instagram, whatsapp, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Patricia Costa', 'Nail Artist', 'nail', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=750&fit=crop&q=85', 'https://instagram.com/espacoarella', '5531999999999', 3, 1]);
  }

  const hasGaleria = queryOne('SELECT COUNT(*) as c FROM galeria')?.c || 0;
  if (!hasGaleria) {
    runSql('INSERT INTO galeria (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=900&h=1200&fit=crop&q=80', 0, 1]);
    runSql('INSERT INTO galeria (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&h=600&fit=crop&q=80', 1, 1]);
    runSql('INSERT INTO galeria (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&h=600&fit=crop&q=80', 2, 1]);
    runSql('INSERT INTO galeria (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=600&h=600&fit=crop&q=80', 3, 1]);
    runSql('INSERT INTO galeria (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&h=600&fit=crop&q=80', 4, 1]);
  }

  const hasDepoimentos = queryOne('SELECT COUNT(*) as c FROM depoimentos')?.c || 0;
  if (!hasDepoimentos) {
    runSql('INSERT INTO depoimentos (texto, nome, funcao, tempo_cliente, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      ['Experiência incrível do início ao fim. A equipe é extremamente profissional e o resultado superou todas as expectativas.', 'Ana Paula S.', 'Cliente', 'Cliente há 3 anos', 0, 1]);
    runSql('INSERT INTO depoimentos (texto, nome, funcao, tempo_cliente, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      ['Ambiente luxuoso e acolhedor. Fiz harmonização facial e o resultado ficou absolutamente natural. Recomendo!', 'Mariana L.', 'Cliente', 'Cliente há 1 ano', 1, 1]);
    runSql('INSERT INTO depoimentos (texto, nome, funcao, tempo_cliente, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      ['Não troco o Arella por nada. Além dos resultados maravilhosos, me sinto acolhida cada vez que entro lá.', 'Fernanda R.', 'Cliente', 'Cliente há 5 anos', 2, 1]);
    runSql('INSERT INTO depoimentos (texto, nome, funcao, tempo_cliente, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      ['A limpeza de pele foi transformadora! Minha pele nunca esteve tão luminosa. Atendimento impecável e ambiente incrível.', 'Beatriz S.', 'Cliente', 'Cliente há 8 meses', 3, 1]);
    runSql('INSERT INTO depoimentos (texto, nome, funcao, tempo_cliente, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      ['Fiz maquiagem para meu casamento com a equipe da Arella. Ficou perfeito, durou o dia todo e me senti diva!', 'Camila P.', 'Noiva', 'Noiva 2024', 4, 1]);
    runSql('INSERT INTO depoimentos (texto, nome, funcao, tempo_cliente, posicao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      ['Vim uma vez e me apaixonei. Profissionais que realmente ouvem o que você quer e entregam muito além do esperado.', 'Larissa M.', 'Cliente', 'Cliente há 2 anos', 5, 1]);
  }

  const hasInstagram = queryOne('SELECT COUNT(*) as c FROM instagram')?.c || 0;
  if (!hasInstagram) {
    runSql('INSERT INTO instagram (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&h=900&fit=crop&q=80', 0, 1]);
    runSql('INSERT INTO instagram (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=700&h=900&fit=crop&q=80', 1, 1]);
    runSql('INSERT INTO instagram (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&h=900&fit=crop&q=80', 2, 1]);
    runSql('INSERT INTO instagram (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&h=900&fit=crop&q=80', 3, 1]);
    runSql('INSERT INTO instagram (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&h=600&fit=crop&q=80', 4, 1]);
    runSql('INSERT INTO instagram (imagem_url, posicao, ativo) VALUES (?, ?, ?)', ['https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&h=600&fit=crop&q=80', 5, 1]);
  }

  const hasSeo = queryOne('SELECT COUNT(*) as c FROM seo')?.c || 0;
  if (!hasSeo) {
    runSql('INSERT INTO seo (pagina, titulo, descricao, keywords, imagem_og) VALUES (?, ?, ?, ?, ?)',
      ['home', 'Arella Beauty Center — Estética Avançada em BH', 'Arella Beauty Center — Estética avançada em Belo Horizonte. Limpeza de pele, harmonização facial, laser, peeling e muito mais.', 'estetica bh, beleza bh, harmonização facial, limpeza de pele, arella beauty', '']);
  }

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
    sobre_imagem: '',
    esp_nome: 'Nome da Especialista',
    esp_cargo: 'Fundadora & Esteticista',
    esp_foto: '',
    esp_creds: 'Especialista em Estética Avançada\nHarmonização Facial · Dermato-Estética\n+8 anos de experiência em BH',
    esp_citacao: '"Beleza não é um padrão — é a expressão mais autêntica de quem você é. Estou aqui para te ajudar a brilhar do seu jeito."',
    stat_anos: '8+',
    stat_clientes: '2k+',
    stat_servicos: '30+',
    hero_subtitulo: 'A Arte do Cuidado',
    logo_url: '/logo.png',
  };

  for (const [k, v] of Object.entries(configDefaults)) {
    const exists = queryOne('SELECT chave FROM configuracoes WHERE chave = ?', [k]);
    if (!exists) {
      runSql('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)', [k, v]);
    }
  }
}

// ── GOOGLE CALENDAR SETUP ──
let calendarClient = null;

function getCalendarClient() {
  if (calendarClient) return calendarClient;

  const cfg = getConfigPublica();

  // Lê das variáveis de ambiente primeiro, depois do banco
  const calEmail = process.env.GOOGLE_CAL_EMAIL || cfg.google_cal_email;
  const rawKey = process.env.GOOGLE_CAL_PRIVATE_KEY || cfg.google_cal_private_key;

  if (!calEmail || !rawKey) {
    console.log('Google Calendar: credenciais não configuradas');
    return null;
  }

  try {
    let privateKey = rawKey;

    // Converter \n literal (barra invertida + n) para quebra de linha real
    privateKey = privateKey.replace(/\\n/g, '\n');

    // Remover possiveis aspas extras
    privateKey = privateKey.replace(/^["']|["']$/g, '');

    // Normalizar dashes (4 -> 5, 6 -> 5)
    privateKey = privateKey.replace(/^(-{4,})/, '-----');
    privateKey = privateKey.replace(/(-{4,})$/, '-----');

    // Limpar espacos em branco extras
    privateKey = privateKey.trim();

    calendarClient = new google.auth.JWT(
      calEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/calendar']
    );
    return calendarClient;
  } catch (e) {
    console.error('Google Calendar: erro ao configurar credenciais:', e.message);
    return null;
  }
}

async function createCalendarEvent(appointment) {
  const cfg = getConfigPublica();

  // Ler de env OU do banco
  const calendarId = process.env.GOOGLE_CAL_CALENDAR_ID || cfg.google_cal_calendar_id;

  if (!calendarId) {
    console.log('Google Calendar: calendar_id não configurado');
    return null;
  }

  const auth = getCalendarClient();
  if (!auth) return null;

  const calEmail = process.env.GOOGLE_CAL_EMAIL || cfg.google_cal_email;

  try {
    const calendar = google.calendar({ version: 'v3', auth });

    // Converter data e horário para formato ISO
    const [year, month, day] = appointment.data.split('-');
    const [hour, minute] = appointment.horario.split(':');

    const startDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // +1 hora

    const event = {
      summary: `✨ ${appointment.servico} - ${appointment.nome}`,
      description: `
🌸 *Arella Beauty Center*

👤 Cliente: ${appointment.nome}
📱 Telefone: ${appointment.telefone}
${appointment.email ? `📧 Email: ${appointment.email}` : ''}
${appointment.observacoes ? `\n📝 Obs: ${appointment.observacoes}` : ''}

_Agendado via site_
      `.trim(),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    // Se tem email do cliente, convida ele
    if (appointment.email) {
      event.attendees = [
        { email: appointment.email },
      ];
      event.sendUpdates = 'all';
    }

    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: event,
    });

    console.log('Google Calendar: evento criado', response.data.id);
    return response.data.id;
  } catch (e) {
    console.error('Google Calendar: erro ao criar evento:', e.message);
    return null;
  }
}

// ── EMAIL TRANSPORTER ──
function getTransporter() {
  const cfg = getConfigPublica();
  if (!cfg.email_smtp_user) return null;
  return nodemailer.createTransport({
    host: cfg.email_smtp_host,
    port: parseInt(cfg.email_smtp_port),
    secure: false,
    auth: { user: cfg.email_smtp_user, pass: cfg.email_smtp_pass },
  });
}

function getConfigPublica() {
  const rows = queryAll('SELECT chave, valor FROM configuracoes');
  return Object.fromEntries(rows.map(r => [r.chave, r.valor]));
}

// ── FILE UPLOAD (Multer) ──
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo não permitido. Use: jpg, png, webp, gif, svg.'));
  }
});

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { erro: 'Muitas requisições, tente em breve.' } });
app.use('/api/', apiLimiter);

// ── API: UPLOAD ──
app.post('/api/upload', adminAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ ok: true, url, filename: req.file.filename, originalName: req.file.originalname });
});

app.post('/api/upload-url', adminAuth, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ erro: 'URL é obrigatória.' });
  res.json({ ok: true, url });
});

// ── API: PUBLIC SITE CONTENT ──
app.get('/api/site', (req, res) => {
  const cfg = getConfigPublica();
  res.json({
    slides: queryAll('SELECT * FROM slides WHERE ativo = 1 ORDER BY posicao ASC'),
    servicos: queryAll('SELECT * FROM servicos WHERE ativo = 1 ORDER BY posicao ASC'),
    equipe: queryAll('SELECT * FROM equipe WHERE ativo = 1 ORDER BY posicao ASC'),
    galeria: queryAll('SELECT * FROM galeria WHERE ativo = 1 ORDER BY posicao ASC'),
    depoimentos: queryAll('SELECT * FROM depoimentos WHERE ativo = 1 ORDER BY posicao ASC'),
    instagram: queryAll('SELECT * FROM instagram WHERE ativo = 1 ORDER BY posicao ASC'),
    config: {
      whatsapp: cfg.whatsapp,
      horarios: cfg.horarios,
      endereco: cfg.endereco,
      instagram: cfg.instagram,
      sobre_texto: cfg.sobre_texto,
      sobre_imagem: cfg.sobre_imagem,
      esp_nome: cfg.esp_nome,
      esp_cargo: cfg.esp_cargo,
      esp_foto: cfg.esp_foto,
      esp_creds: cfg.esp_creds,
      esp_citacao: cfg.esp_citacao,
      stat_anos: cfg.stat_anos,
      stat_clientes: cfg.stat_clientes,
      stat_servicos: cfg.stat_servicos,
      hero_subtitulo: cfg.hero_subtitulo,
      logo_url: cfg.logo_url,
    },
    seo: queryOne('SELECT * FROM seo WHERE pagina = ?', ['home'])
  });
});

// ── API: AGENDAMENTOS ──
app.post('/api/agendamentos', (req, res) => {
  try {
    const { nome, email, telefone, servico, data, horario, observacoes } = req.body;
    if (!nome || !telefone || !servico || !data || !horario) {
      return res.status(400).json({ erro: 'Campos obrigatórios: nome, telefone, serviço, data, horário.' });
    }

    const result = runSql(
      'INSERT INTO agendamentos (nome, email, telefone, servico, data, horario, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, email || '', telefone, servico, data, horario, observacoes || '']
    );

    // Criar evento no Google Calendar
    const appointment = { nome, email, telefone, servico, data, horario, observacoes };
    createCalendarEvent(appointment).catch(console.error);

    const cfg = getConfigPublica();
    const transporter = getTransporter();
    if (transporter) {
      const dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
      if (email) {
        transporter.sendMail({
          from: `"Arella Beauty Center" <${cfg.email_smtp_user}>`,
          to: email,
          subject: '✨ Seu agendamento foi recebido — Arella Beauty Center',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#050D28;color:#fff;padding:40px">
            <div style="text-align:center;margin-bottom:32px"><h1 style="font-size:32px;font-weight:300;color:#C9A96E;letter-spacing:4px">ARELLA</h1><p style="font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.5);text-transform:uppercase">Beauty Center</p></div>
            <h2 style="font-size:24px;font-weight:300;margin-bottom:24px">Olá, ${nome}! 🌸</h2>
            <p style="color:rgba(255,255,255,0.7);line-height:1.8">Seu agendamento foi recebido com sucesso.</p>
            <div style="background:rgba(201,169,110,0.1);border:1px solid rgba(201,169,110,0.3);padding:24px;margin:28px 0">
              <p><strong style="color:#C9A96E">Serviço:</strong> ${servico}</p>
              <p><strong style="color:#C9A96E">Data:</strong> ${dataFmt}</p>
              <p><strong style="color:#C9A96E">Horário:</strong> ${horario}</p>
              ${observacoes ? `<p><strong style="color:#C9A96E">Obs:</strong> ${observacoes}</p>` : ''}
            </div>
            <p style="color:rgba(255,255,255,0.5);font-size:12px">Dúvidas? Fale conosco pelo WhatsApp: <a href="https://wa.me/${cfg.whatsapp}" style="color:#C9A96E">(31) 9 9999-9999</a></p>
          </div>`,
        }).catch(console.error);
      }
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
  res.json(queryAll(q, params));
});

app.put('/api/agendamentos/:id', adminAuth, (req, res) => {
  const { status } = req.body;
  runSql('UPDATE agendamentos SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/agendamentos/:id', adminAuth, (req, res) => {
  runSql('DELETE FROM agendamentos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ── API: CONTATO ──
app.post('/api/contato', (req, res) => {
  try {
    const { nome, email, telefone, mensagem } = req.body;
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ erro: 'Nome, email e mensagem são obrigatórios.' });
    }
    runSql('INSERT INTO contatos (nome, email, telefone, mensagem) VALUES (?, ?, ?, ?)', [nome, email, telefone || '', mensagem]);

    const cfg = getConfigPublica();
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
  res.json(queryAll('SELECT * FROM contatos ORDER BY criado_em DESC'));
});

app.put('/api/contatos/:id/lido', adminAuth, (req, res) => {
  runSql('UPDATE contatos SET lido = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ── API: CONFIGURAÇÕES ──
app.get('/api/config/publica', (req, res) => {
  res.json(getConfigPublica());
});

app.get('/api/config', adminAuth, (req, res) => {
  res.json(getConfigPublica());
});

app.put('/api/config', adminAuth, (req, res) => {
  const updates = req.body;
  for (const [k, v] of Object.entries(updates)) {
    if (k !== 'admin_senha') {
      const exists = queryOne('SELECT chave FROM configuracoes WHERE chave = ?', [k]);
      if (exists) {
        runSql('UPDATE configuracoes SET valor = ? WHERE chave = ?', [v, k]);
      } else {
        runSql('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)', [k, v]);
      }
    }
  }
  res.json({ ok: true });
});

// ── API: STATS ──
app.get('/api/stats', adminAuth, (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const mes = hoje.slice(0, 7);
  res.json({
    hoje: queryOne("SELECT COUNT(*) as c FROM agendamentos WHERE data = ?", [hoje])?.c || 0,
    mes: queryOne("SELECT COUNT(*) as c FROM agendamentos WHERE data LIKE ?", [mes + '%'])?.c || 0,
    total: queryOne("SELECT COUNT(*) as c FROM agendamentos")?.c || 0,
    pendentes: queryOne("SELECT COUNT(*) as c FROM agendamentos WHERE status = 'pendente'")?.c || 0,
    contatos_nao_lidos: queryOne("SELECT COUNT(*) as c FROM contatos WHERE lido = 0")?.c || 0,
  });
});

// ── API: AUTH ──
app.post('/api/auth', (req, res) => {
  const { senha } = req.body;
  const cfg = getConfigPublica();
  if (senha === cfg.admin_senha) {
    res.json({ ok: true, token: Buffer.from(`arella:${senha}:${Date.now()}`).toString('base64') });
  } else {
    res.status(401).json({ erro: 'Senha incorreta.' });
  }
});

function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-token'] || req.query.token;
  const cfg = getConfigPublica();
  if (!auth) return res.status(401).json({ erro: 'Token necessário.' });
  try {
    const decoded = Buffer.from(auth, 'base64').toString();
    if (decoded.startsWith(`arella:${cfg.admin_senha}:`)) return next();
  } catch {}
  res.status(401).json({ erro: 'Token inválido.' });
}

// ── API: CRUD CMS genérico ──
function cruda(table) {
  app.get(`/api/admin/${table}`, adminAuth, (req, res) => {
    res.json(queryAll(`SELECT * FROM ${table} ORDER BY posicao ASC, id ASC`));
  });

  app.post(`/api/admin/${table}`, adminAuth, (req, res) => {
    const { posicao, ativo, ...fields } = req.body;
    const keys = Object.keys(fields);
    const vals = Object.values(fields);
    const cols = [...keys, 'posicao', 'ativo'];
    const params = [...vals, posicao ?? 0, ativo ?? 1];
    const placeholders = cols.map(() => '?').join(', ');
    const result = runSql(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, params);
    res.json({ ok: true, id: result.lastInsertRowid });
  });

  app.put(`/api/admin/${table}/:id`, adminAuth, (req, res) => {
    const fields = req.body;
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const vals = Object.values(fields);
    runSql(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ ok: true });
  });

  app.delete(`/api/admin/${table}/:id`, adminAuth, (req, res) => {
    runSql(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  });
}

['slides', 'servicos', 'equipe', 'galeria', 'depoimentos', 'instagram'].forEach(t => cruda(t));

// ── API: SEO ──
app.get('/api/admin/seo', adminAuth, (req, res) => {
  res.json(queryAll('SELECT * FROM seo'));
});

app.put('/api/admin/seo/:id', adminAuth, (req, res) => {
  const { titulo, descricao, keywords, imagem_og } = req.body;
  runSql('UPDATE seo SET titulo = ?, descricao = ?, keywords = ?, imagem_og = ? WHERE id = ?',
    [titulo, descricao, keywords, imagem_og, req.params.id]);
  res.json({ ok: true });
});

// ── API: HORÁRIOS DISPONÍVEIS ──
app.get('/api/horarios-disponiveis', (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ erro: 'Data necessária.' });
  const ocupados = queryAll("SELECT horario FROM agendamentos WHERE data = ? AND status != 'cancelado'", [data]).map(r => r.horario);
  const todos = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30'];
  const disponiveis = todos.filter(h => !ocupados.includes(h));
  res.json({ disponiveis, ocupados });
});

// ── MAIN ROUTE ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ──
initDatabase().then(() => {
  app.listen(PORT, () => console.log(`✨ Arella Beauty Center rodando na porta ${PORT}`));
}).catch(err => {
  console.error('Erro ao iniciar banco de dados:', err);
  process.exit(1);
});
