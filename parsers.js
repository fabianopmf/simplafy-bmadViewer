/**
 * Parsers defensivos para o BMAD Viewer.
 * Cada função pode receber formato inesperado; em caso de erro retorna valor seguro (listas vazias ou defaults).
 * Contrato esperado dos MDs: ver format.md nesta pasta.
 */

function safeParse(fn, fallback) {
  try {
    const result = fn();
    return result != null ? result : fallback;
  } catch (_) {
    return fallback;
  }
}

export function extractDocListFromIndex(raw) {
  return safeParse(function () {
    const list = [];
    if (!raw || typeof raw !== 'string') return list;
    const sectionRe = /^###\s+(.+)$/gm;
    let match;
    const sections = [];
    while ((match = sectionRe.exec(raw)) !== null) {
      sections.push({ title: match[1].trim(), start: match.index });
    }
    sections.push({ title: 'Outros', start: raw.length });
    for (let i = 0; i < sections.length - 1; i++) {
      const block = raw.slice(sections[i].start, sections[i + 1].start);
      const linkRe2 = /\]\((\.\/)?([^)]+\.md)\)/g;
      let linkMatch;
      const seen = new Set();
      while ((linkMatch = linkRe2.exec(block)) !== null) {
        const path = linkMatch[2].replace(/^\.\//, '');
        if (path.endsWith('.md') && !seen.has(path)) {
          seen.add(path);
          list.push({ section: sections[i].title, path: path });
        }
      }
    }
    return list;
  }, []);
}

const DEFAULT_METRICS = { rfImpl: 50, rfPlan: 36, rnfImpl: 25, rnfPlan: 2 };

export function parsePrdMetrics(text) {
  return safeParse(function () {
    let rfImpl = 50,
      rfPlan = 36,
      rnfImpl = 25,
      rnfPlan = 2;
    if (!text || typeof text !== 'string') return { rfImpl, rfPlan, rnfImpl, rnfPlan };
    const rfMatch = text.match(
      /\*\*Total RFs\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/
    );
    if (rfMatch) {
      rfImpl = parseInt(rfMatch[1], 10) || rfImpl;
      rfPlan = parseInt(rfMatch[2], 10) || rfPlan;
    }
    const rnfMatch = text.match(/\*\*Total RNFs\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/);
    if (rnfMatch) {
      rnfImpl = parseInt(rnfMatch[1], 10) || rnfImpl;
      rnfPlan = parseInt(rnfMatch[2], 10) || rnfPlan;
    }
    return { rfImpl, rfPlan, rnfImpl, rnfPlan };
  }, DEFAULT_METRICS);
}

export function parseEpicsMetrics(text) {
  return safeParse(
    function () {
      let epics = 14,
        stories = 64;
      if (!text || typeof text !== 'string') return { epics, stories };
      const epicMatch = text.match(/totalEpics:\s*(\d+)/);
      if (epicMatch) epics = parseInt(epicMatch[1], 10) || epics;
      const storyMatch = text.match(/totalStories:\s*(\d+)/);
      if (storyMatch) stories = parseInt(storyMatch[1], 10) || stories;
      return { epics, stories };
    },
    { epics: 14, stories: 64 }
  );
}

const PERSONAS = ['paciente', 'médico', 'medico', 'secretária', 'secretaria', 'interno'];

function isPersonaValue(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return PERSONAS.some(function (p) {
    const pNorm = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t === pNorm || t === p;
  });
}

function normalizePersona(s) {
  if (!s || typeof s !== 'string') return '';
  const t = s.trim().toLowerCase();
  if (/^paciente$/i.test(t)) return 'Paciente';
  if (/^m[eé]dico$/i.test(t)) return 'Médico';
  if (/^secret[aá]ria$/i.test(t)) return 'Secretária';
  if (/^interno$/i.test(t)) return 'Interno';
  return '';
}

function parsePriority(s) {
  if (s === undefined || s === null) return undefined;
  const t = String(s).trim().toUpperCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^P(\d+)$/);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseTableRows(text, idHeader, idPattern, statusImpl, statusPlan) {
  const impl = [];
  const plan = [];
  if (!text || typeof text !== 'string') return { impl, plan };
  const lines = text.split('\n');
  let currentSection = '';
  const sectionRe = /^###\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = line.match(sectionRe);
    if (sectionMatch && !line.startsWith('|')) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    if (!line.startsWith('|') || line.startsWith('| ------')) continue;
    const parts = line.split('|').map(function (p) {
      return (p || '').trim();
    });
    if (parts.length < 4) continue;
    const id = parts[1];
    if (id === idHeader) continue;
    if (!idPattern.test(id)) continue;
    const capability = parts[2] || '';
    let status = '';
    for (let k = parts.length - 1; k >= 2; k--) {
      if (parts[k]) {
        status = (parts[k] || '').replace(/\s+/g, ' ').trim().toUpperCase();
        break;
      }
    }
    let persona = '';
    let rawPriority;
    if (parts.length >= 7) {
      persona = normalizePersona(parts[3]);
      rawPriority = parsePriority(parts[4]);
    } else if (parts.length >= 6) {
      if (isPersonaValue(parts[3])) {
        persona = normalizePersona(parts[3]);
        rawPriority = undefined;
      } else {
        rawPriority = parsePriority(parts[3]);
      }
    } else {
      rawPriority = undefined;
    }
    const item = { id: id, capability: capability, section: currentSection };
    if (persona) item.persona = persona;
    if (status.indexOf(statusImpl) !== -1) {
      impl.push(item);
    } else if (status.indexOf(statusPlan) !== -1) {
      item.priority = rawPriority !== undefined ? rawPriority : plan.length + 1;
      plan.push(item);
    }
  }
  plan.sort(function (a, b) {
    return (a.priority || 999) - (b.priority || 999);
  });
  return { impl, plan };
}

export function parsePrdRfLists(text) {
  return safeParse(
    function () {
      const { impl: rfImpl, plan: rfPlan } = parseTableRows(
        text,
        'RF',
        /^RF-\d+$/i,
        'IMPLEMENTADO',
        'PLANEJADO'
      );
      return { rfImpl, rfPlan };
    },
    { rfImpl: [], rfPlan: [] }
  );
}

export function parsePrdRnfLists(text) {
  return safeParse(
    function () {
      const { impl: rnfImpl, plan: rnfPlan } = parseTableRows(
        text,
        'RNF',
        /^RNF-\d+$/i,
        'IMPLEMENTADO',
        'PLANEJADO'
      );
      return { rnfImpl, rnfPlan };
    },
    { rnfImpl: [], rnfPlan: [] }
  );
}

export function parseEpicsLists(text) {
  return safeParse(
    function () {
      const epics = [];
      const stories = [];
      if (!text || typeof text !== 'string') return { epics, stories };
      const epicRe = /^### Épico (\d+):\s*(.+)$/;
      const storyRe = /^#### História (\d+)\.(\d+):\s*(.+)$/;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const em = line.match(epicRe);
        if (em) {
          epics.push({ id: parseInt(em[1], 10), title: (em[2] || '').trim() });
          continue;
        }
        const sm = line.match(storyRe);
        if (sm) {
          stories.push({
            id: sm[1] + '.' + sm[2],
            epicId: parseInt(sm[1], 10),
            title: (sm[3] || '').trim(),
          });
        }
      }
      return { epics, stories };
    },
    { epics: [], stories: [] }
  );
}

/**
 * Normaliza o objeto já parseado do roadmap-negocio.yaml.
 * Retorna { capabilities: [], sync_metadata: {} } com estrutura defensiva.
 */
export function parseRoadmapYamlFromObject(obj) {
  return safeParse(
    function () {
      const capabilities = [];
      const raw = obj && obj.capabilities;
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          const c = raw[i];
          if (!c || typeof c !== 'object') continue;
          const cap = {
            id: c.id || '',
            title: c.title || '',
            description: typeof c.description === 'string' ? c.description : '',
            value_proposition: c.value_proposition || '',
            priority: typeof c.priority === 'number' ? c.priority : i + 1,
            status: c.status || 'backlog',
            depends_on: Array.isArray(c.depends_on) ? c.depends_on : [],
            links: {
              frs: Array.isArray(c.links && c.links.frs) ? c.links.frs : [],
              rnfs: Array.isArray(c.links && c.links.rnfs) ? c.links.rnfs : [],
              epics: Array.isArray(c.links && c.links.epics) ? c.links.epics : [],
              stories: Array.isArray(c.links && c.links.stories) ? c.links.stories : [],
            },
            progress: {
              stories_total:
                typeof (c.progress && c.progress.stories_total) === 'number'
                  ? c.progress.stories_total
                  : 0,
              stories_done:
                typeof (c.progress && c.progress.stories_done) === 'number'
                  ? c.progress.stories_done
                  : 0,
              stories_in_progress:
                typeof (c.progress && c.progress.stories_in_progress) === 'number'
                  ? c.progress.stories_in_progress
                  : 0,
            },
          };
          capabilities.push(cap);
        }
      }
      const sync_metadata =
        obj && obj.sync_metadata && typeof obj.sync_metadata === 'object'
          ? {
              source_prd: obj.sync_metadata.source_prd,
              source_epics: obj.sync_metadata.source_epics,
              source_sprint_status: obj.sync_metadata.source_sprint_status,
              capability_count: obj.sync_metadata.capability_count,
              strategy: obj.sync_metadata.strategy || '',
            }
          : {};
      return { capabilities, sync_metadata };
    },
    { capabilities: [], sync_metadata: {} }
  );
}
