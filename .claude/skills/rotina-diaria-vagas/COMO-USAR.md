# Rotina diária das vagas: como usar

Esta pasta guarda o agente que atualiza as vagas do Home Office Hub todo dia. As instruções dele estão no `SKILL.md`. Ele coleta as vagas, confere se cada vaga nova é remota e aberta a quem mora no Brasil, manda as de especialista para as áreas, escreve os resumos em português, publica o site e termina com um relatório curto.

O robô do GitHub ("Atualizar vagas") continua rodando sozinho de manhã. Esta rotina completa o trabalho dele: só ela lê micro1 e TELUS, revisa as vagas e escreve os resumos.

## O que precisa

- Uma máquina com internet no Brasil. micro1 e TELUS recusam servidores de fora, inclusive os do GitHub.
- Python 3.12 ou mais novo.
- Git, com permissão de push no `main` deste repositório.
- Claude Code: o app para computador ou o programa de terminal.

## Rodar à mão

Abra o Claude Code na pasta do repositório e digite `/rotina-diaria-vagas`, ou peça "rode a rotina diária de vagas".

## Rodar todo dia sozinho

No app do Claude para computador, crie uma tarefa agendada:
- pasta: a deste repositório;
- horário: todo dia às 17h (depois do robô do GitHub, que costuma terminar até umas 13h30);
- texto da tarefa: `/rotina-diaria-vagas`.

Libere a tarefa para rodar Python e Git sem pedir aprovação a cada comando. Sem isso, ela para no primeiro comando esperando alguém clicar, e o dia passa sem atualização.

## Sem máquina ligada

Dá para rodar o mesmo agente dentro do GitHub, com a Claude Code GitHub Action num workflow agendado e uma chave da API da Anthropic nos secrets. O custo é cobrado por uso, e micro1 e TELUS ficam de fora, a não ser que o workflow rode num runner próprio instalado numa máquina no Brasil.

## Onde ver o que aconteceu

- O relatório aparece no fim de cada rodada.
- O diário de todas as rodadas fica em `rotina-diaria.log`, na raiz do repositório. Ele é só da máquina que roda a rotina e não vai para o Git.
