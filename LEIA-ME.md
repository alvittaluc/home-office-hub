# 🚀 Home Office Hub — Guia de Instalação (Fase 1)

Este guia é para colocar seu site **no ar de graça** e fazê-lo **se atualizar sozinho** todo dia. Não precisa saber programar — é só seguir os passos.

---

## 📦 O que tem nesta pasta

| Arquivo | O que é |
|---|---|
| `index.html` | O site em si (o que os alunos veem) |
| `vagas.json` | A lista de vagas (atualizada automaticamente) |
| `coletor.py` | O "robô" que busca as vagas novas |
| `.github/workflows/atualizar-vagas.yml` | Faz o robô rodar sozinho todo dia |
| `LEIA-ME.md` | Este guia |

---

## ✅ Como funciona (resumo)

```
Todo dia de manhã:
  1. O robô (coletor.py) busca vagas novas nas empresas
  2. Ele filtra só as do Brasil / em Português
  3. Salva no vagas.json
  4. O site mostra as novas vagas sozinho
  5. Vagas que fecharam somem automaticamente
```

Você não precisa fazer nada depois de configurado. ✨

---

## 🛠️ PARTE 1 — Testar no seu computador (opcional, 5 min)

Se quiser ver funcionando antes de publicar:

1. Instale o **Python** (se não tiver): https://python.org → botão "Download"
2. Abra a pasta do projeto
3. Rode o coletor. No Windows, abra o "Prompt de Comando" na pasta e digite:
   ```
   python coletor.py
   ```
   No Mac/Linux:
   ```
   python3 coletor.py
   ```
4. Ele vai buscar as vagas e atualizar o `vagas.json`
5. Para ver o site, na mesma pasta digite:
   ```
   python -m http.server 8000
   ```
   E abra no navegador: http://localhost:8000

> ⚠️ **Importante:** o site precisa ser aberto por um servidor (o comando acima), não dando duplo-clique no arquivo. Isso é porque ele "lê" o vagas.json, e navegadores bloqueiam essa leitura em arquivos abertos direto.

---

## 🌐 PARTE 2 — Publicar de graça no GitHub (15 min)

O GitHub vai **hospedar o site** e **rodar o robô** — tudo gratuito.

### Passo 1 — Criar conta
- Vá em https://github.com e crie uma conta grátis

### Passo 2 — Criar o repositório
1. Clique no `+` no topo → **New repository**
2. Nome: `home-office-hub` (ou o que quiser)
3. Marque **Public**
4. Clique em **Create repository**

### Passo 3 — Enviar os arquivos
1. Na página do repositório, clique em **uploading an existing file**
2. Arraste **todos** os arquivos desta pasta (incluindo a pasta `.github`)
3. Clique em **Commit changes**

> 💡 Se a pasta `.github` não subir arrastando, veja a dica no final.

### Passo 4 — Ligar o site (GitHub Pages)
1. No repositório, vá em **Settings** (Configurações)
2. Menu lateral → **Pages**
3. Em "Branch", escolha **main** e pasta **/ (root)**
4. Clique em **Save**
5. Espere ~1 minuto. Vai aparecer um link tipo:
   `https://SEU-USUARIO.github.io/home-office-hub/`
6. **Esse é o link que você manda pros alunos!** 🎉

### Passo 5 — Ligar o robô automático
1. No repositório, vá na aba **Actions**
2. Se pedir, clique em **"I understand my workflows, enable them"**
3. Pronto! O robô vai rodar todo dia às 5h (horário do Brasil)
4. Para rodar **agora** e testar: Actions → "Atualizar vagas" → **Run workflow**

---

## 🔧 Como adicionar/remover empresas

Abra o arquivo `coletor.py` e edite as listas no topo:

```python
EMPRESAS_LEVER = {
    "welocalize": "weloglobal",   # nome interno : slug da URL
    "rws":        "rws",
}

EMPRESAS_WORKABLE = {
    "toloka": "toloka-annotators",
}
```

**Como descobrir o "slug":** é a parte que vem depois de `jobs.lever.co/` ou `apply.workable.com/` no link da empresa.

Depois de editar, se você tiver colocado no GitHub, é só subir o arquivo novo — o robô usa a versão nova no próximo run.

Para o site reconhecer uma empresa nova visualmente (logo, cor), avise que eu adiciono ela no `index.html`.

---

## ❓ Perguntas comuns

**O robô roda quanto custa?**
Nada. O GitHub dá 2.000 minutos grátis por mês e o robô usa segundos por dia.

**E se uma empresa não tiver vagas para o Brasil hoje?**
Ela simplesmente não aparece. Quando abrir vaga BR, aparece de novo sozinha.

**As empresas OneForma, Telus, Outlier vão entrar automático?**
Ainda não — elas não usam Lever/Workable. Isso é a **Fase 3** (scrapers), que fazemos depois.

**Posso mudar o horário do robô?**
Sim, no arquivo `.github/workflows/atualizar-vagas.yml`, na linha do `cron`.

---

## 📌 Dica: se a pasta `.github` não subir

O GitHub às vezes esconde pastas que começam com ponto. Se o robô não aparecer na aba Actions:
1. No repositório, clique em **Add file → Create new file**
2. No nome, digite exatamente: `.github/workflows/atualizar-vagas.yml`
3. Cole o conteúdo do arquivo (peça pra mim se precisar)
4. Commit

---

## 🎯 Próximas fases (quando quiser)

- **Fase 2:** plugar agregadores (Remotive, RemoteOK) → mais vagas de graça
- **Fase 3:** scrapers para OneForma, Telus, CrowdGen
- **Fase 4:** LinkedIn seguro via alertas de email + n8n
- **Fase 5:** transformar em "app" instalável (PWA)

Qualquer dúvida em qualquer passo, é só chamar! 🙂
