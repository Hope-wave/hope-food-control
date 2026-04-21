# Hope Food Control (MVP)

Aplicacao web simples para controle de estoque de alimentos da Base Hope (Igreja Onda Dura), com foco em baixo custo, simplicidade e uso rapido.

## Tecnologias

- Backend: Node.js + Express
- Frontend: HTML, CSS e JavaScript puro
- Banco de dados: Firebase Firestore
- Autenticacao: login simples com sessao e perfis (`volunteer`, `admin`)

## Funcionalidades

### Voluntario

- Login no sistema
- Cadastro de alimento com:
  - nome
  - quantidade
  - peso (kg)
  - data de validade
- Geracao automatica de ID curto unico no formato letra+numero (ex: `A1`) para etiquetagem fisica
- Registro de saida de alimento por ID

### Administrador

- Login no sistema
- Tabela completa do estoque com:
  - ID
  - nome
  - quantidade
  - peso
  - data de validade
  - status
- Alerta para alimentos que vencem em ate 30 dias

### Regras automaticas de status

- `normal`: validade acima de 30 dias
- `proximo`: validade entre 0 e 30 dias
- `vencido`: validade anterior a data atual

## Estrutura de pastas

```txt
hope-food-control/
├── public/
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── src/
│   ├── auth.js
│   ├── firebase.js
│   └── inventory.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Como rodar o projeto

1. Instale dependencias:

```bash
npm install
```

2. Crie o arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

3. Configure no `.env`:

- `SESSION_SECRET`
- usuarios e senhas (admin e voluntario)
- credenciais do Firebase (`FIREBASE_SERVICE_ACCOUNT_PATH` ou `FIREBASE_SERVICE_ACCOUNT_JSON`)
- `FIREBASE_PROJECT_ID` (se necessario)

### Configuracao rapida do Firebase (recomendado)

1. No Console Firebase, acesse `Project settings > Service accounts`.
2. Clique em `Generate new private key` e salve o arquivo JSON na raiz do projeto com nome `firebase-service-account.json`.
3. No `.env`, mantenha:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_PROJECT_ID=seu-project-id
```

4. Inicie o projeto e valide no terminal:
   - Se conectou no Firestore: `Firebase conectado com sucesso ao Firestore.`
   - Se nao conectou: `Firebase nao configurado. Rodando em modo local (dados em memoria).`

4. Execute:

```bash
npm run dev
```

5. Abra no navegador:

- [http://localhost:3000](http://localhost:3000)

## Observacoes importantes

- Este MVP usa login simples (usuario/senha definidos no `.env`) para reduzir custo e complexidade.
- O Firestore precisa estar habilitado no projeto Firebase.
- Em ambiente de producao, recomenda-se:
  - usar HTTPS
  - sessao com `cookie.secure = true`
  - senhas com hash
  - logs/auditoria adicionais
