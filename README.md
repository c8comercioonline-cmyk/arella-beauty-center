# Arella Beauty Center

Site oficial da Arella Beauty Center - Estética Avançada em Belo Horizonte.

## Deploy no Railway

### Opção 1: Via GitHub (Recomendado)
1. Faça upload desta pasta para um repositório no GitHub
2. Acesse [railway.app](https://railway.app)
3. Clique em "New Project" → "Deploy from GitHub repo"
4. Selecione o repositório
5. Railway detecta automaticamente e faz o deploy ✅

### Opção 2: Via Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Estrutura
```
arella-railway/
├── public/
│   └── index.html    ← Site completo (tudo embutido)
├── server.js         ← Servidor Express
├── package.json      ← Dependências
├── railway.json      ← Config Railway
└── .gitignore
```

## Painel Administrativo
- Clique na **logo no rodapé** para abrir
- Senha: `arella2025`

## WhatsApp
- Atualize o número no painel admin → aba "Contato"
