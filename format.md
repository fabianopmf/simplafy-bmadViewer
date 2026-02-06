# Contrato de formato dos MDs — BMAD Viewer

Este documento descreve o que o viewer espera dos arquivos Markdown em `_bmad-output/planning-artifacts/`. Se o BMAD (ou outra ferramenta) alterar a **estrutura** abaixo, os parsers em `parsers.js` podem precisar de ajuste para que o dashboard e as listas continuem funcionando.

---

## 1. index.md

- **Seções**: o viewer procura títulos de nível 3 como delimitadores de seção: `### Nome da Seção`.
- **Links para documentos**: dentro de cada bloco entre dois `###`, links no formato `](arquivo.md)` ou `](./arquivo.md)` são listados na navegação.
- **Efeito**: a lista lateral de documentos e o card "Documentos" do dashboard são montados a partir disso. Se o index deixar de usar `###` para seções ou mudar o formato dos links, a navegação pode ficar vazia ou incompleta.

---

## 2. prd.md

### 2.1 Métricas de totais (resumo do dashboard)

- **RF**: uma linha contendo literalmente `**Total RFs**` e três números em colunas de tabela (implementados, planejados, total), por exemplo:
  - `| **Total RFs**              | **50**       | **36**    | **86** |`
- **RNF**: uma linha contendo literalmente `**Total RNFs**` e dois números (implementados, planejados), por exemplo:
  - `| **Total RNFs**  | **25**       | **2**     | **27** |`
- **Regex usados**: `**Total RFs**` com `\*\*(\d+)\*\*` para os três números; `**Total RNFs**` com `\*\*(\d+)\*\*` para os dois números.

### 2.2 Tabelas de RF (Requisitos Funcionais)

- Tabelas em Markdown onde:
  - cada linha de dados começa com `|`;
  - a linha de separação contém `| ------` (ou similar);
  - a primeira coluna de conteúdo após `|` pode ser o cabeçalho `RF` (ignorada);
  - linhas de dados têm ID na segunda coluna no formato `RF-NNN` (ex.: `RF-001`, `RF-117`);
  - há ao menos uma coluna com status contendo a palavra `IMPLEMENTADO` ou `PLANEJADO` (a última coluna não vazia é usada como status).
- A segunda coluna é o ID; a terceira é tratada como descrição/capacidade; o status é detectado na última coluna preenchida.
- **Persona (opcional):** coluna com valores **Paciente**, **Médico**, **Secretária** ou **Interno**. Usada para:
  - Filtrar requisitos no Mapa de Contexto
  - Filtrar listas de RF/RNF por persona
  - Exibir badge de persona nos itens
- **Prioridade (opcional):** coluna com número (ex.: `1`, `2`) ou P1/P2/P3 (tratado como 1, 2, 3). Usada para:
  - Ordenar listagens de RF/RNF
  - Exibir badge de prioridade nos itens
  - Se ausente, usa a ordem do documento

**Exemplo completo:**  
`| RF     | Capacidade | Persona    | Prioridade | Status    |`  
`| RF-005 | ...        | Secretária | 1          | PLANEJADO |`

### 2.3 Tabelas de RNF (Requisitos Não Funcionais)

- Mesma estrutura das tabelas de RF, com ID no formato `RNF-NNN` (ex.: `RNF-001`).
- Cabeçalho de ID `RNF` na primeira coluna de dados é ignorado.
- Status: `IMPLEMENTADO` ou `PLANEJADO` na última coluna não vazia.
- **Persona (opcional):** igual aos RF — valores **Paciente**, **Médico**, **Secretária** ou **Interno**; usados para filtrar por persona no Mapa de Contexto.
- **Prioridade (opcional):** igual aos RF — coluna opcional "Prioridade" para itens planejados; o viewer ordena "RNF planejados" por essa prioridade; se ausente, usa a ordem do documento.

---

## 3. epics.md

### 3.1 Métricas no frontmatter

- YAML frontmatter no topo do arquivo (entre `---`), com:
  - `totalEpics: N` (número)
  - `totalStories: N` (número)
- Usado para os números exibidos nos cards do dashboard. Se faltar, o viewer usa defaults (14 épicos, 64 stories).

### 3.2 Títulos de Épicos e Histórias

- **Épicos**: linhas no formato `### Épico N: Título`, onde `N` é um número (ex.: `### Épico 1: Prontuário Eletrônico (EMR)`).
- **Histórias**: linhas no formato `#### História N.M: Título`, onde `N` e `M` são números (ex.: `#### História 1.1: Estados de Comparecimento em Agendamentos`).
- O viewer usa esses títulos para montar as listas "Épicos" e "Stories" no dashboard e para scroll/destaque ao clicar em um item. Mudar o padrão (por exemplo outro nível de heading ou outro texto) exige alteração dos regex em `parseEpicsLists`.

---

---

## 4. roadmap-negocio.yaml (Roadmap de Negócio)

- **Propósito:** Camada go-to-market que associa capacidades comerciais a FRs, RNFs, épicos e stories. O viewer usa este arquivo como **elemento central e superior** da Home: a primeira seção do dashboard é "Roadmap de Negócio (Capabilities)".
- **Estrutura esperada:**
  - Raiz: `project`, `version`, `last_updated`, `description` (texto), `capabilities` (lista), `sync_metadata` (objeto).
  - **sync_metadata:** `source_prd`, `source_epics`, `source_sprint_status`, `capability_count`, `strategy` (ex.: "Core Clínico → Monetização → Expansão → UX/Segurança").
  - **Cada capability:** `id`, `title`, `description`, `value_proposition`, `priority` (número), `status` (ex.: backlog), `depends_on` (lista opcional de ids), `links` (objeto com `frs`, `rnfs`, `epics`, `stories` — listas de IDs), `progress` (objeto com `stories_total`, `stories_done`, `stories_in_progress`).
- **Fases:** O viewer agrupa capabilities por prioridade: 1–4 = Fase 1 (Core Clínico), 5–7 = Fase 2 (Monetização), 8–11 = Fase 3 (Expansão e Automação), 12+ = Fase 4 (UX e Segurança).
- **Drill-down:** Ao clicar em "Ver detalhes" numa capability, o viewer exibe FRs, RNFs, épicos e stories linkados; cada item abre o documento correspondente (prd.md ou epics.md) com scroll quando possível.
- **Parser:** `parseRoadmapYamlFromObject(parsed)` em `parsers.js` normaliza o objeto já parseado (js-yaml) e retorna `{ capabilities: [], sync_metadata: {} }`. Em erro, retorna listas vazias.

---

## 5. viewer-latest-docs.json (Implementation Readiness Report — sempre o mais novo)

- **Propósito:** O relatório de Implementation Readiness é atualizado com novas cargas; não controlamos a criação do arquivo. O manifesto indica qual arquivo é o **mais recente** para o viewer abrir.
- **Local:** `_bmad-output/planning-artifacts/viewer-latest-docs.json`.
- **Estrutura:** Objeto JSON com pelo menos `implementation_readiness_report`: string com o nome do arquivo do relatório mais recente (ex.: `"implementation-readiness-report-2026-01-28.md"`).
- **Quem atualiza:** Quem faz o upload/carga do novo relatório deve atualizar este JSON para apontar para o novo arquivo.
- **Viewer:** No carregamento, o viewer faz fetch deste arquivo e substitui o path de qualquer documento na lista (extraída do index.md) que corresponda ao padrão `implementation-readiness-report*.md` pelo path indicado no manifesto. Assim o item "Implementation Readiness Report" no menu abre sempre o arquivo mais novo.

---

## 6. Dashboard e Filtros

### 6.1 Mapa de Contexto

- **Filtro por Status:** Planejado vs Implantado
  - Alterna entre listas rfPlan/rnfPlan e rfImpl/rnfImpl
  - Atualiza contagens em tempo real
- **Filtro por Persona:** Todas, Paciente, Médico, Secretária, Interno
  - Filtra itens pela coluna Persona das tabelas
  - Atualiza contagens e listas dinamicamente

### 6.2 Listas de RF/RNF

- **Filtro por Categoria:** dropdown populado dinamicamente com seções únicas
  - Extrai valores da coluna "section" dos itens
  - Ordena alfabeticamente
- **Filtro por Persona:** mesmo comportamento do Mapa de Contexto
  - Filtragem cumulativa (categoria AND persona)
  - Preserva seleção ao mudar filtros
  - Reseta ao trocar de lista

---

## Comportamento em caso de formato inesperado

- **Parsers** (`parsers.js`): cada função está envolvida em tratamento seguro; em erro ou formato não reconhecido retornam listas vazias ou valores default (ex.: 50 RF impl, 36 planejados).
- **Dashboard**: se o parse falhar ou devolver dados inválidos, o viewer chama `buildDashboard(null)` e exibe os valores default; a página e a leitura dos documentos continuam normais.
- **Listas (RF, RNF, épicos, stories)**: se não houver itens parseados, é exibido "Nenhum item disponível." ao abrir a lista do card.
- **Filtros**: se não houver dados para filtrar, os selects mostram apenas "Todas" e a lista fica vazia.

Assim, mudanças de **conteúdo** (novos RFs, novos épicos) são refletidas sem alteração de código. Mudanças de **formato** (estrutura de tabela, padrão de títulos, nome dos campos) podem exigir atualização dos parsers e, se aplicável, deste contrato.
