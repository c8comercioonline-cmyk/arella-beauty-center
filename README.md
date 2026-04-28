# 🌸 Arella Beauty Center — Site Completo v2.0

Site profissional com backend completo para a Arella Beauty Center.

## ✅ Funcionalidades

- **Agendamento online** com banco de dados SQLite
- **Confirmação automática** por email (configurável)
- **Formulário de contato** funcional
- **Painel admin** completo com:
  - Dashboard com estatísticas em tempo real
  - Gestão de agendamentos (confirmar, concluir, cancelar, excluir)
  - Caixa de entrada de contatos
  - Configurações do site (sem precisar editar código)
  - Configuração de email SMTP
  - Alterar senha do admin
- **Horários disponíveis** em tempo real (evita conflitos)
- **WhatsApp** integrado com mensagem pré-preenchida
- **Fotos reais** da equipe e serviços (Unsplash)

## 🚀 Deploy no Railway

### Via GitHub (Recomendado)
1. Crie um repo no GitHub e faça upload desta pasta
2. Acesse [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Selecione o repositório
4. Railway faz o deploy automaticamente ✅

### Via CLI
```bash
npm install -g @railway/cli
railway login
cd arella-fullstack
railway init
railway up
```

## ⚙️ Configuração

### Acessar o painel admin
- Dê **duplo clique** na logo do site
- Ou use **Ctrl+Shift+A**
- Senha padrão: `arella2025`

### Configurar Email (para confirmações automáticas)
1. Entre no painel admin → **Email / SMTP**
2. Use Gmail + [senha de app](https://myaccount.google.com/apppasswords)
3. Salve e teste agendando um horário

## 📁 Estrutura
```
arella-fullstack/
├── public/
│   └── index.html      ← Frontend completo
├── server.js           ← Backend Express + SQLite
├── package.json
├── railway.json
├── .env.example
└── README.md
```

## 🗃️ Banco de Dados
SQLite automático, sem configuração. No Railway, o DB persiste em disco.
Para backup: baixe o arquivo `arella.db` do servidor.
