# 07 — Interface web

## Direção escolhida: Queue Social

A interface será minimalista, direta e mobile-first. A hierarquia principal é:

1. Música atual.
2. Fila do que tocará em seguida.
3. Busca e resultados acessíveis na parte inferior.

A estética deve lembrar um produto musical moderno e a familiaridade do Spotify,
sem copiar sua interface, marca ou componentes proprietários.

## Base visual

- Canvas principal escuro, próximo de preto com tom azul-marinho.
- Verde-esmeralda como acento primário.
- Violeta reservado para estados secundários e ambientação.
- Tipografia moderna, legível e sem excesso de pesos.
- Separadores leves em vez de muitos cards.
- Sombras raras; bordas apenas quando melhorarem a distinção.
- Áreas de toque com pelo menos 44px.

## Mobile-first

Viewport de referência: `390 × 844`.

O desktop deve ampliar o mesmo modelo mental, sem transformar a experiência em
outro produto. Em telas maiores, a fila e a busca podem ocupar colunas paralelas,
enquanto o player permanece visível.

## Estrutura da tela inicial

### Cabeçalho

- Nome Waves.
- Indicador de disponibilidade do sistema/bot.
- Sem navegação complexa na fase 1.

### Música atual

- Capa.
- Título e artistas.
- Nome de quem solicitou, quando houver.
- Estado lógico do player.
- Barra de progresso apenas visual/indeterminada na fase 1.
- Botão Skip destacado.
- Texto discreto informando que áudio real chegará na fase 2.

### Fila

- Título e total de itens.
- Linhas compactas e tocáveis.
- Posição, capa, título, artistas e solicitante.
- Alça de reordenação.
- Ação de remoção em menu contextual ou gesto acessível equivalente.
- Primeiro item em espera levemente destacado.
- Estado de atualização por polling discreto.

### Busca inferior

- Área persistente ou painel inferior.
- Campo de busca.
- Resultados diretamente abaixo do campo.
- Capa, título, artistas, duração e ação de adicionar.
- Estados de vazio, carregamento, erro e nenhum resultado.
- A busca não deve esconder permanentemente a música atual nem a fila.

## Interações

- Busca com debounce.
- Adicionar deve fornecer feedback imediato.
- Fila atualiza a cada 2 ou 3 segundos.
- Reordenação deve funcionar por controles acessíveis; drag and drop é adicional.
- Skip exige bloqueio temporário do botão durante a requisição.
- Falhas usam mensagens curtas e acionáveis.

## Componentes previstos

- `PlayerBar.vue`
- `QueuePanel.vue`
- `TrackCard.vue`
- `SpotifySearch.vue`

Composables:

- `useSpotifySearch`
- `useQueue`
- `usePlayerState`

## Estados obrigatórios

- Inicial/carregando.
- Fila vazia.
- Sem música atual.
- Busca vazia.
- Buscando.
- Sem resultados.
- Spotify indisponível.
- API indisponível.
- Mutação em andamento.
- Mutação concluída.

## Acessibilidade

- Contraste compatível com WCAG AA.
- Foco visível.
- Botões com nomes acessíveis.
- Operações de fila disponíveis sem drag and drop.
- Imagens com texto alternativo adequado.
- Preferência por movimento reduzido respeitada.
