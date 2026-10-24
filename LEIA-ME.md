# XZBIT Intelligence 7.0 — Automação gratuita

O site é **HTML5**. O motor de coleta roda **automaticamente no GitHub Actions**, portanto não depende do navegador ou do PC ligados.

## Publicar (conta GitHub gratuita)

1. Crie um repositório **PUBLIC** em https://github.com/new com nome `xzbit-intelligence` (ou outro nome). Não insira dados privados no repositório.
2. Envie para a **raiz** todos os arquivos e pastas deste ZIP, **inclusive `.github/workflows/monitor.yml`** e `.nojekyll`. O GitHub permite **Add file > Upload files**. Confira que `index.html` está na raiz e `.github` não foi omitida.
3. Abra **Settings > Actions > General** e, em Workflow permissions, habilite **Read and write permissions**; salve. Isso autoriza o GitHub Actions a gravar dados coletados em `data/state.json`.
4. Abra **Settings > Pages** e em Build and deployment selecione **Source: GitHub Actions**.
5. Abra **Actions > XZBIT - Coleta e publicacao automatica > Run workflow > Run workflow**. Autorize a execução do workflow se o GitHub solicitar.
6. Confira se todas as etapas ficaram verdes. A URL será `https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/`. Também aparecerá no menu Pages.
7. Depois disso, a coleta será programada a cada 15 minutos (`7,22,37,52`). Pode sofrer atrasos; não é monitoramento em tempo real com garantia de SLA.

## Conectar Telegram (opcional)

1. No Telegram, crie um bot com @BotFather e obtenha o token.
2. Descubra o `chat_id` autorizado a receber alertas, adicionando o bot ao chat e consultando o ID com segurança.
3. Em **Settings > Secrets and variables > Actions**, crie segredos `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.
4. Somente novas vulnerabilidades CISA com ransomware marcado como conhecido recebem aviso neste piloto. A primeira execução é baseline e não envia milhares de alertas antigos. Não coloque credenciais no HTML ou no repositório.

## O que realmente é coletado

- **CISA KEV**: vulnerabilidades com exploração conhecida. Não equivale a ataques bancários confirmados.
- **Alternative.me**: Fear & Greed atual e anterior com horário.
- **DefiLlama**: TVL por rede. TVL não é fluxo líquido.
- **DEX Screener**: boosts de tokens. São *promoções pagas*; não equivalem a oportunidades.

Os dados ficam em `data/state.json`, visíveis no site e acessíveis para auditoria. O site recarrega a página de dados a cada 2 minutos quando aberto, **mas a coleta funciona mesmo fechado**.

## Relatórios e limitações

O MVP produz **base estruturada** para relatório, mas ainda **não cria PDFs automaticamente** e **não monitora X, Arkham ou movimentos whale específicos**. O site NÃO exige acesso pago para funcionar, mas o serviço GitHub tem limites e pode suspender workflows agendados em repositórios públicos sem atividade por 60 dias. O agendamento não é garantia de detecção em tempo real. Política de uso público e privacidade devem ser respeitadas.

Erro de API é apresentado como falha; o sistema conserva último dado bem-sucedido e seu timestamp. O monitor armazena os últimos 650 eventos e 2016 coletas de série temporal. No primeiro ciclo o site fica sem dados até a execução inicial.

## Segurança

Repositório público: nunca registre chaves, dados de assinantes ou conteúdo exclusivo. Guarde tokens somente em GitHub Actions Secrets. Este piloto tem **painel público sem autenticação**; futura administração privada exigirá outro backend. Evite habilitar comentários externos e aceite pull requests apenas após revisão.
