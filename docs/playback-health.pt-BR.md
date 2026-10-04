# Playback Health

[English](playback-health.md)

Uma execução usa `playbackAttemptId`; retries físicos compartilham esse ID.
O período seleciona execuções pelo **primeiro início**, em `[from, to)`, e mostra
o resultado conhecido mais recente, incluindo retries que cruzam o período.
`errorCode` filtra erros terminais por padrão. Use `errorScope=encountered` para
incluir erros recuperados por retry. Taxas por provedor usam sucessos e falhas
terminais como denominador; cancelamentos e execuções incompletas ficam separados.

O bot renova tentativas ativas pelo heartbeat, inclusive pausadas/em resolução.
Tentativas sem heartbeat por 2 minutos são reconciliadas no próximo heartbeat
ou consulta de saúde. Reinícios encerram tentativas anteriores não pertencentes
ao novo runtime. Desligamento e cancelamento intencional diferem de perda de voz.
A entrega faz até 3 tentativas (backoff de 250/500 ms); esgotamento gera log seguro.
Uma API inacessível não pode receber o resultado final: a reconciliação cobre essa lacuna.

Consultas usam paginação por cursor sem limite de registros. `dataCompleteness`
informa lacunas conhecidas e cobertura da retenção, não garante captura de todo evento.
Grupos de telemetria concluídos expiram após 90 dias, verificados no máximo a cada
hora durante a manutenção. Fila e histórico musical são preservados. Faça backup
do SQLite antes das migrações. Remover linhas libera páginas reutilizáveis, mas
não reduz imediatamente o arquivo. Monitore espaço do banco/WAL e leituras longas;
planeje compactação offline separadamente, se necessária.

O catálogo de músicas com falhas permanece após a retenção da telemetria. Ele
guarda contagens de sucessos e falhas terminais e o último código, classe e etapa
da falha; a migração importa a telemetria histórica ainda disponível. O Playback
Health mostra as 50 faixas com mais falhas. Após duas falhas terminais
`SOURCE_NOT_FOUND` ou `SOURCE_GEO_BLOCKED` desde o último sucesso, a faixa do
Spotify fica fora das sugestões do autoplay por sete dias após a última falha.
Falhas operacionais não causam essa suspensão. Um sucesso zera a sequência de
falhas de conteúdo. A música ainda pode ser pedida manualmente.

Os tempos medem resolução da fonte, preparo do recurso (`fetchLatencyMs`, incluindo
fetch/demux), primeiro estado `Playing` e duração reproduzida pelo recurso.
Primeiro áudio é estimativa do player, não medição nos ouvintes do Discord.
Amostras históricas ausentes permanecem nulas. P50 exige 5 amostras; P95 exige 20.
A classificação usa códigos/status estruturados seguros, nunca URLs assinadas ou
mensagens brutas; um 403 ambíguo não é interpretado como restrição geográfica.

Atualize web e bot juntos após a migração. O deploy continua manual.
