/**
 * Testes dos parsers do BMAD Viewer.
 * Executar na pasta viewer: node test/run-parsers.mjs
 * Ou na raiz do viewer: pnpm test (se package.json tiver script test).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  extractDocListFromIndex,
  parsePrdMetrics,
  parseEpicsMetrics,
  parsePrdRfLists,
  parsePrdRnfLists,
  parseEpicsLists
} from '../parsers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
    return false;
  }
  console.log('OK:', msg);
  return true;
}

const indexRaw = readFixture('index-sample.md');
const docList = extractDocListFromIndex(indexRaw);
ok(Array.isArray(docList), 'extractDocListFromIndex retorna array');
ok(docList.length >= 2, 'index sample tem pelo menos 2 documentos (prd, epics)');
ok(docList.some(d => d.path === 'prd.md'), 'index contém prd.md');
ok(docList.some(d => d.path === 'epics.md'), 'index contém epics.md');

const prdRaw = readFixture('prd-sample.md');
const prdMetrics = parsePrdMetrics(prdRaw);
ok(prdMetrics.rfImpl === 1 && prdMetrics.rfPlan === 1, 'parsePrdMetrics total RFs 1+1');
ok(prdMetrics.rnfImpl === 1 && prdMetrics.rnfPlan === 1, 'parsePrdMetrics total RNFs 1+1');

const rfLists = parsePrdRfLists(prdRaw);
ok(Array.isArray(rfLists.rfImpl) && Array.isArray(rfLists.rfPlan), 'parsePrdRfLists retorna arrays');
ok(rfLists.rfImpl.length === 1 && rfLists.rfImpl[0].id === 'RF-001', 'parsePrdRfLists RF-001 implementado');
ok(rfLists.rfPlan.length === 1 && rfLists.rfPlan[0].id === 'RF-002', 'parsePrdRfLists RF-002 planejado');
ok(rfLists.rfPlan[0].priority === 1, 'parsePrdRfLists RF planejado tem prioridade por ordem');

const rnfLists = parsePrdRnfLists(prdRaw);
ok(Array.isArray(rnfLists.rnfImpl) && Array.isArray(rnfLists.rnfPlan), 'parsePrdRnfLists retorna arrays');
ok(rnfLists.rnfImpl.length === 1 && rnfLists.rnfImpl[0].id === 'RNF-001', 'parsePrdRnfLists RNF-001 implementado');
ok(rnfLists.rnfPlan.length === 1 && rnfLists.rnfPlan[0].id === 'RNF-002', 'parsePrdRnfLists RNF-002 planejado');
ok(rnfLists.rnfPlan[0].priority === 1, 'parsePrdRnfLists RNF planejado tem prioridade por ordem');

const epicsRaw = readFixture('epics-sample.md');
const epicsMetrics = parseEpicsMetrics(epicsRaw);
ok(epicsMetrics.epics === 2 && epicsMetrics.stories === 3, 'parseEpicsMetrics 2 épicos, 3 stories');

const epicsLists = parseEpicsLists(epicsRaw);
ok(Array.isArray(epicsLists.epics) && epicsLists.epics.length === 2, 'parseEpicsLists 2 épicos');
ok(Array.isArray(epicsLists.stories) && epicsLists.stories.length === 3, 'parseEpicsLists 3 histórias');
ok(epicsLists.epics[0].id === 1 && epicsLists.epics[0].title.includes('Prontuário'), 'parseEpicsLists Épico 1 título');
ok(epicsLists.stories[0].id === '1.1' && epicsLists.stories[0].title.includes('Comparecimento'), 'parseEpicsLists História 1.1');

// Prioridade explícita na coluna: ordenação por prioridade
const prdWithPriority = `
| RF     | Capacidade | Prioridade | Status    |
| ------ | ---------- | ---------- | --------- |
| RF-010 | Segundo    | 2          | PLANEJADO |
| RF-020 | Primeiro   | 1          | PLANEJADO |
`;
const rfWithPrio = parsePrdRfLists(prdWithPriority);
ok(rfWithPrio.rfPlan.length === 2, 'parsePrdRfLists com coluna Prioridade retorna 2 planejados');
ok(rfWithPrio.rfPlan[0].id === 'RF-020' && rfWithPrio.rfPlan[0].priority === 1, 'ordenacao por prioridade: primeiro e 1');
ok(rfWithPrio.rfPlan[1].id === 'RF-010' && rfWithPrio.rfPlan[1].priority === 2, 'ordenacao por prioridade: segundo e 2');

// Comportamento defensivo: entrada vazia ou inválida
ok(extractDocListFromIndex('').length === 0, 'extractDocListFromIndex("") retorna []');
ok(extractDocListFromIndex(null).length === 0, 'extractDocListFromIndex(null) retorna []');
const emptyPrd = parsePrdMetrics('');
ok(emptyPrd.rfImpl === 50 && emptyPrd.rnfPlan === 2, 'parsePrdMetrics("") retorna defaults');
const emptyRf = parsePrdRfLists('');
ok(emptyRf.rfImpl.length === 0 && emptyRf.rfPlan.length === 0, 'parsePrdRfLists("") retorna listas vazias');
const emptyEpics = parseEpicsLists('');
ok(emptyEpics.epics.length === 0 && emptyEpics.stories.length === 0, 'parseEpicsLists("") retorna listas vazias');

// Entrada que não é string (não deve quebrar)
const prdNull = parsePrdMetrics(null);
ok(prdNull && typeof prdNull.rfImpl === 'number', 'parsePrdMetrics(null) retorna objeto default');

if (failed > 0) {
  console.error('\nTotal de falhas:', failed);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
