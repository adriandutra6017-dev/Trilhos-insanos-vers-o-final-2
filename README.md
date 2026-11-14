# Trilhos Insanos — servidor inicial

Inclui o jogo HTML e um servidor Node.js sem dependências externas, com rankings semanais.

## Rodar no PC
1. Instale Node.js 18 ou mais recente.
2. Extraia a pasta do projeto.
3. Abra um terminal dentro da pasta e execute `npm start` (ou `node server.js`).
4. Abra `http://localhost:8080` no navegador.

## Mapas (World Tour)
No menu, toque em **🗺️ MAPA** para escolher onde correr. A escolha fica salva no navegador.
- 🗽 Nova York (original)
- 🎰 Las Vegas — neon, cassinos, roda-gigante e pirâmide com feixe de luz
- 🗼 Paris — pôr do sol, prédios com telhado mansarda, cafés e Torre Eiffel
- 🏯 Tóquio — neon, cerejeiras, lanternas, Torre de Tóquio, pagode e Monte Fuji
- 🏖️ Rio de Janeiro — casas coloridas, palmeiras, Cristo Redentor e Pão de Açúcar
- 🔺 Cairo — casas de arenito, minaretes, pirâmides e esfinge

Cada mapa muda céu, neblina, iluminação, chão, cor dos trens e cenário. Para criar outro, adicione uma função `buildXxx()` e uma entrada em `MAPS` no `index.html`.

## Treinamento
No menu **🗺️ MAPA**, a seção 🎯 TREINAMENTO tem 5 pistas de prática (Pistas, Pulos, Deslize, Trens e No Coin). Duram 75s (No Coin: 120s), sem game over, sem ranking e sem ganhar moedas.

## 2 jogadores online (X1 No Coin)
Botão **🌐 2 JOGADORES ONLINE**: um jogador cria a sala e passa o código de 4 letras; o outro entra e o criador toca em COMEÇAR. Quem pegar uma moeda ou bater é eliminado; vence quem sobreviver por mais tempo. Os dois recebem a mesma sequência de obstáculos (mesma semente). Precisa do servidor rodando (`npm start`), e para jogar com amigos pela internet o servidor precisa estar publicado (HTTPS). As salas ficam na memória do servidor.
Rotas: `POST /api/rooms`, `/api/rooms/join`, `/api/rooms/:codigo/start|sync|leave`.

## API
- `GET /api/health` — verifica se o servidor está ativo.
- `GET /api/leaderboards` — devolve os 10 melhores da semana por pontuação e maior tempo sem coletar moedas.
- `POST /api/runs` — recebe `{ "name": "Jogador", "score": 123, "noCoinSeconds": 45 }`.

A semana é calculada em UTC. Os resultados ficam em `data/runs.json` e são guardados no servidor, não no navegador. O servidor mantém o melhor resultado por nome em cada semana e limita requisições básicas por IP.

## Antes de publicar
Este é um backend inicial, não um serviço já hospedado na internet. Para publicação pública, use HTTPS, banco de dados persistente, moderação/limites adicionais contra resultados falsos e configure backups. O ranking atual é uma classificação casual: os resultados enviados pelo cliente podem ser adulterados por alguém que manipule o navegador.
