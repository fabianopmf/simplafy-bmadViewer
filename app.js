(function () {
  'use strict';

  // Theme: apply saved preference (light/dark) before first paint
  const THEME_KEY = 'bmad-viewer-theme';
  const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY)) || 'dark';
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(savedTheme === 'light' ? 'theme-light' : 'theme-dark');

  // Produção: simplafy.com.br/bmadviewer (BASE = ''). Desenvolvimento local: /bmad-viewer/ (BASE = '../')
  const path = window.location.pathname || '';
  const isProduction = path === '/bmadviewer' || path === '/bmadviewer/' || path.startsWith('/bmadviewer/');
  const BASE = isProduction ? '' : (path.includes('/bmad-viewer/') ? '../' : '');
  const CAPABILITIES_URL = BASE + 'planning-artifacts/capabilities.yaml';
  const SPRINT_STATUS_URL = BASE + 'implementation-artifacts/sprint-status.yaml';
  const STORIES_BASE = BASE + 'implementation-artifacts/stories/';

  let state = {
    capabilities: [],
    themes: [],
    sprint: null,
    capabilityProgress: {},
    view: 'dashboard',
    filters: { theme: 'all', priority: 'all', status: 'all' },
    sortBy: 'number',
    kanbanGroupBy: 'stories',
    expandedThemes: {},
    expandedCapabilities: {},
    expandedEpics: {},
    expandedStories: {},
    storyContentCache: {}
  };

  const TITLES = {
    dashboard: 'Dashboard',
    themes: 'By Theme',
    capabilities: 'By Capabilities',
    epics: 'By Epics',
    stories: 'By Stories',
    kanban: 'Kanban'
  };

  const EPIC_NAMES = {
    'epic-1': 'EMR - Electronic Medical Record',
    'epic-2': 'Clinical AI Assistant',
    'epic-3': 'Digital Prescriptions',
    'epic-4': 'Payment Split',
    'epic-5': 'Teleconsultation',
    'epic-6': 'TISS Billing',
    'epic-7': 'Automations',
    'epic-8': 'AI Evolution',
    'epic-9': 'Patient Experience',
    'epic-10': 'Calendar UX',
    'epic-11': 'Public Scheduling',
    'epic-12': '2FA Security',
    'epic-13': 'Custom Plans',
    'epic-14': 'Observability',
    'epic-15': 'Re-engagement',
    'epic-16': 'New Channels',
    'epic-17': 'Team Management',
    'epic-18': 'CRM & Leads',
    'epic-19': 'Infrastructure',
    'epic-20': 'Custom Email',
    'epic-21': 'Compliance & Security'
  };

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  /** True if key is an epic key (e.g. epic-1, epic-21), not a story key (e.g. 1-1-xxx). */
  function isEpicKey(key) {
    return typeof key === 'string' && /^epic-\d+$/.test(key);
  }

  /** Format date (and time if available) from YAML source. Returns { dateStr, timeStr } for display. */
  function formatDateFromSource(raw) {
    if (raw == null) return { dateStr: '--', timeStr: '' };
    let dateObj = null;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return { dateStr: '--', timeStr: '' };
      dateObj = new Date(trimmed);
      if (isNaN(dateObj.getTime())) return { dateStr: trimmed, timeStr: '' };
    } else if (raw instanceof Date && !isNaN(raw.getTime())) {
      dateObj = raw;
    } else {
      return { dateStr: '--', timeStr: '' };
    }
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = y + '-' + m + '-' + d;
    const hasTime = raw instanceof Date || (typeof raw === 'string' && /T|\d{1,2}:\d{2}/.test(raw));
    const timeStr = hasTime
      ? String(dateObj.getHours()).padStart(2, '0') + ':' + String(dateObj.getMinutes()).padStart(2, '0')
      : '';
    return { dateStr, timeStr };
  }

  // Extract themes from YAML comments
  function extractThemes(raw) {
    const themes = [];
    let currentTheme = null;
    raw.split('\n').forEach(line => {
      const temaMatch = line.match(/^\s*#\s*TEMA:\s*(.+)$/);
      if (temaMatch) {
        currentTheme = temaMatch[1].replace(/[🏥💰🤖🚀👥📊🔌⚙️📜🔬]/g, '').replace(/\s+/g, ' ').trim();
      }
      const idMatch = line.match(/^  - id:\s*(\S+)$/);
      if (idMatch && currentTheme) {
        const id = idMatch[1];
        const existing = themes.find(t => t.name === currentTheme);
        if (existing) existing.capabilityIds.push(id);
        else themes.push({ name: currentTheme, capabilityIds: [id] });
      }
    });
    return themes;
  }

  // Compute progress for each capability
  function computeProgress(capabilities, sprint) {
    const devStatus = sprint?.development_status || {};
    const progress = {};
    capabilities.forEach(cap => {
      const epics = cap.links?.epics || [];
      let total = 0, done = 0, inProgress = 0;
      epics.forEach(epicKey => {
        const epicNum = epicKey.replace('epic-', '');
        Object.keys(devStatus).forEach(key => {
          if (isEpicKey(key) || key === 'generated' || key === 'project') return;
          if (key.startsWith(epicNum + '-')) {
            total++;
            const st = String(devStatus[key]).toLowerCase();
            if (st === 'done') done++;
            else if (['in-progress', 'review', 'qa-review'].some(x => st.includes(x))) inProgress++;
          }
        });
      });
      let status = 'backlog';
      if (total > 0) {
        if (done === total) status = 'done';
        else if (done > 0 || inProgress > 0) status = 'in-progress';
      }
      progress[cap.id] = { total, done, inProgress, status };
    });
    return progress;
  }

  // Load data
  async function loadData() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

    try {
      const [capRes, sprintRes] = await Promise.all([
        fetch(CAPABILITIES_URL + '?v=' + Date.now()),
        fetch(SPRINT_STATUS_URL + '?v=' + Date.now())
      ]);

      const capText = capRes.ok ? await capRes.text() : '';
      const sprintText = sprintRes.ok ? await sprintRes.text() : '';

      const capObj = window.jsyaml?.load ? window.jsyaml.load(capText) : null;
      const sprintObj = window.jsyaml?.load && sprintText ? window.jsyaml.load(sprintText) : null;

      state.capabilities = capObj?.capabilities || [];
      state.themes = extractThemes(capText);
      state.sprint = sprintObj;
      state.capabilityProgress = computeProgress(state.capabilities, state.sprint);

      const rawDate = sprintObj?.generated ?? capObj?.updated;
      const { dateStr, timeStr } = formatDateFromSource(rawDate);
      const loadTime = new Date();
      const loadTimeStr = String(loadTime.getHours()).padStart(2, '0') + ':' + String(loadTime.getMinutes()).padStart(2, '0');
      const displayStr = timeStr ? dateStr + ' ' + timeStr : dateStr + ' · ' + loadTimeStr;
      document.getElementById('last-updated').textContent = displayStr;
      document.getElementById('last-updated').title = 'Data dos artefatos: ' + dateStr + (timeStr ? ' ' + timeStr : '') + ' · Carregado às ' + loadTimeStr;
      updateMetrics();
      renderView();
    } catch (err) {
      content.innerHTML = '<div class="error">Error loading data. Check console.</div>';
    }
  }

  // Update header metrics
  function updateMetrics() {
    const devStatus = state.sprint?.development_status || {};
    let storiesTotal = 0, storiesDone = 0, epicsTotal = 0, epicsDone = 0;

    Object.keys(devStatus).forEach(key => {
      if (isEpicKey(key)) {
        epicsTotal++;
        if (devStatus[key] === 'done') epicsDone++;
      } else if (!isEpicKey(key) && key !== 'generated' && key !== 'project') {
        storiesTotal++;
        if (devStatus[key] === 'done') storiesDone++;
      }
    });

    // Themes: average % complete across themes (same as dashboard)
    let themePctSum = 0, themeCount = 0;
    state.themes.forEach(t => {
      const caps = (state.capabilities || []).filter(c => c.theme_id === t.id);
      let done = 0, total = 0;
      caps.forEach(c => {
        const p = state.capabilityProgress[c.id];
        if (p?.total > 0) { total += p.total; done += p.done; }
      });
      const pct = total ? Math.round((done / total) * 100) : 0;
      themePctSum += pct;
      themeCount++;
    });
    const themesTotal = state.themes.length;
    const themesPct = themeCount ? Math.round(themePctSum / themeCount) : 0;

    const capsDone = Object.values(state.capabilityProgress).filter(p => p.status === 'done').length;
    const capPct = state.capabilities.length ? Math.round((capsDone / state.capabilities.length) * 100) : 0;
    const epicPct = epicsTotal ? Math.round((epicsDone / epicsTotal) * 100) : 0;
    const storyPct = storiesTotal ? Math.round((storiesDone / storiesTotal) * 100) : 0;
    const overallPct = storiesTotal ? Math.round((storiesDone / storiesTotal) * 100) : 0;

    // Themes metric
    document.getElementById('metric-themes-count').textContent = themesTotal;
    document.getElementById('metric-themes-pct').textContent = `${themesPct}%`;
    document.getElementById('metric-themes-bar').style.width = `${themesPct}%`;

    // Capabilities metric
    document.getElementById('metric-capabilities-count').textContent = `${capsDone}/${state.capabilities.length}`;
    document.getElementById('metric-capabilities-pct').textContent = `${capPct}%`;
    document.getElementById('metric-capabilities-bar').style.width = `${capPct}%`;

    // Epics metric
    document.getElementById('metric-epics-count').textContent = `${epicsDone}/${epicsTotal}`;
    document.getElementById('metric-epics-pct').textContent = `${epicPct}%`;
    document.getElementById('metric-epics-bar').style.width = `${epicPct}%`;

    // Stories metric
    document.getElementById('metric-stories-count').textContent = `${storiesDone}/${storiesTotal}`;
    document.getElementById('metric-stories-pct').textContent = `${storyPct}%`;
    document.getElementById('metric-stories-bar').style.width = `${storyPct}%`;

    // Click handlers
    document.querySelector('[data-metric="themes"]').onclick = () => navigateTo('themes');
    document.querySelector('[data-metric="capabilities"]').onclick = () => navigateTo('capabilities');
    document.querySelector('[data-metric="epics"]').onclick = () => navigateTo('epics');
    document.querySelector('[data-metric="stories"]').onclick = () => navigateTo('stories');
  }

  function navigateTo(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = TITLES[view] || 'Dashboard';
    renderView();
  }

  // Build capability number map
  function getCapNumberMap() {
    let num = 0;
    const map = {};
    state.themes.forEach(theme => {
      theme.capabilityIds.forEach(id => {
        num++;
        map[id] = { number: num, theme: theme.name };
      });
    });
    return map;
  }

  // RENDER VIEWS
  function renderDashboard() {
    const devStatus = state.sprint?.development_status || {};

    // Themes: total + average completeness (per-theme % then average)
    let themePctSum = 0, themeCount = 0;
    state.themes.forEach(theme => {
      const caps = state.capabilities.filter(c => theme.capabilityIds.includes(c.id));
      let done = 0, total = 0;
      caps.forEach(c => {
        const p = state.capabilityProgress[c.id];
        if (p?.total > 0) { total += p.total; done += p.done; }
      });
      const pct = total ? Math.round((done / total) * 100) : 0;
      themePctSum += pct;
      themeCount++;
    });
    const themesTotal = state.themes.length;
    const themesPct = themeCount ? Math.round(themePctSum / themeCount) : 0;

    // Capabilities: total + % done
    const capsDone = Object.values(state.capabilityProgress).filter(p => p.status === 'done').length;
    const capabilitiesTotal = state.capabilities.length;
    const capabilitiesPct = capabilitiesTotal ? Math.round((capsDone / capabilitiesTotal) * 100) : 0;

    // Epics: total + % done
    let epicsTotal = 0, epicsDone = 0;
    Object.keys(devStatus).forEach(key => {
      if (isEpicKey(key)) {
        epicsTotal++;
        if (devStatus[key] === 'done') epicsDone++;
      }
    });
    const epicsPct = epicsTotal ? Math.round((epicsDone / epicsTotal) * 100) : 0;

    // Stories: total + % done
    let storiesTotal = 0, storiesDone = 0;
    Object.keys(devStatus).forEach(key => {
      if (!isEpicKey(key) && key !== 'generated' && key !== 'project') {
        storiesTotal++;
        if (devStatus[key] === 'done') storiesDone++;
      }
    });
    const storiesPct = storiesTotal ? Math.round((storiesDone / storiesTotal) * 100) : 0;

    let html = '<div class="dashboard-home">';
    html += '<div class="dashboard-blocks">';

    html += `<div class="dashboard-block" data-nav="themes">
      <h3 class="dashboard-block__title">Themes</h3>
      <div class="dashboard-block__count">${themesTotal}</div>
      <div class="dashboard-block__label">total</div>
      <div class="dashboard-block__bar"><div class="dashboard-block__fill" style="width:${themesPct}%"></div></div>
      <div class="dashboard-block__pct">${themesPct}% complete</div>
    </div>`;

    html += `<div class="dashboard-block" data-nav="capabilities">
      <h3 class="dashboard-block__title">Capabilities</h3>
      <div class="dashboard-block__count">${capsDone}/${capabilitiesTotal}</div>
      <div class="dashboard-block__label">done / total</div>
      <div class="dashboard-block__bar"><div class="dashboard-block__fill" style="width:${capabilitiesPct}%"></div></div>
      <div class="dashboard-block__pct">${capabilitiesPct}% complete</div>
    </div>`;

    html += `<div class="dashboard-block" data-nav="epics">
      <h3 class="dashboard-block__title">Epics</h3>
      <div class="dashboard-block__count">${epicsDone}/${epicsTotal}</div>
      <div class="dashboard-block__label">done / total</div>
      <div class="dashboard-block__bar"><div class="dashboard-block__fill" style="width:${epicsPct}%"></div></div>
      <div class="dashboard-block__pct">${epicsPct}% complete</div>
    </div>`;

    html += `<div class="dashboard-block" data-nav="stories">
      <h3 class="dashboard-block__title">Stories</h3>
      <div class="dashboard-block__count">${storiesDone}/${storiesTotal}</div>
      <div class="dashboard-block__label">done / total</div>
      <div class="dashboard-block__bar"><div class="dashboard-block__fill" style="width:${storiesPct}%"></div></div>
      <div class="dashboard-block__pct">${storiesPct}% complete</div>
    </div>`;

    html += '</div></div>';
    return html;
  }

  function renderThemes() {
    const capMap = getCapNumberMap();
    let themes = state.themes;
    if (state.filters.theme && state.filters.theme !== 'all') {
      themes = state.themes.filter(t => t.name === state.filters.theme);
    }
    let html = renderFilterBar();
    html += `<div class="results-summary">${themes.length} theme${themes.length !== 1 ? 's' : ''}</div>`;
    html += '<div class="listing-list">';
    themes.forEach((theme, idx) => {
      const originalIdx = state.themes.indexOf(theme);
      const caps = state.capabilities.filter(c => theme.capabilityIds.includes(c.id));
      let done = 0, total = 0;
      caps.forEach(c => {
        const p = state.capabilityProgress[c.id];
        if (p?.total > 0) { total += p.total; done += p.done; }
      });
      const pct = total ? Math.round((done / total) * 100) : 0;
      const isExpanded = state.expandedThemes[originalIdx];
      html += `<div class="listing-theme-block">`;
      html += `<div class="listing-row listing-row--theme" data-theme-index="${originalIdx}" role="button" tabindex="0">`;
      html += `<span class="listing-row__chevron" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>`;
      html += `<span class="listing-num">${originalIdx + 1}</span>`;
      html += `<span class="listing-main">${escapeHtml(theme.name)}</span>`;
      html += `<span class="listing-meta">${caps.length} capabilities</span>`;
      html += `<span class="listing-meta">${done}/${total} stories</span>`;
      html += `<div class="listing-bar"><div class="listing-bar__fill" style="width:${pct}%"></div></div>`;
      html += `<span class="listing-pct">${pct}%</span>`;
      html += '</div>';
      if (isExpanded && caps.length) {
        html += '<div class="listing-row-expanded">';
        html += '<div class="listing-expanded-header">Capabilities</div>';
        caps.forEach(c => {
          const progress = state.capabilityProgress[c.id] || {};
          const status = progress.status || 'backlog';
          const label = progress.total ? `${progress.done}/${progress.total}` : '-';
          const num = capMap[c.id]?.number ?? '-';
          html += `<div class="listing-capability-item">
            <span class="listing-capability-num">${escapeHtml(String(num))}</span>
            <span class="listing-capability-name">${escapeHtml(c.name || c.id)}</span>
            <span class="listing-capability-status status-${status}">${status}</span>
            <span class="listing-capability-progress">${label}</span>
          </div>`;
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderCapabilities() {
    const capMap = getCapNumberMap();
    let allCaps = [];
    state.themes.forEach(theme => {
      theme.capabilityIds.forEach(id => {
        const cap = state.capabilities.find(c => c.id === id);
        if (cap) {
          allCaps.push({ cap, progress: state.capabilityProgress[id] || {}, theme: theme.name, number: capMap[id]?.number });
        }
      });
    });

    // Apply filters
    if (state.filters.theme !== 'all') allCaps = allCaps.filter(c => c.theme === state.filters.theme);
    if (state.filters.priority !== 'all') allCaps = allCaps.filter(c => String(c.cap.priority) === state.filters.priority);
    if (state.filters.status !== 'all') allCaps = allCaps.filter(c => c.progress.status === state.filters.status);

    // Sort
    allCaps.sort((a, b) => {
      if (state.sortBy === 'number') return a.number - b.number;
      if (state.sortBy === 'priority') return (a.cap.priority || 3) - (b.cap.priority || 3);
      if (state.sortBy === 'status') {
        const order = { done: 0, 'in-progress': 1, backlog: 2 };
        return (order[a.progress.status] || 2) - (order[b.progress.status] || 2);
      }
      if (state.sortBy === 'name') return a.cap.name.localeCompare(b.cap.name);
      return 0;
    });

    const devStatus = state.sprint?.development_status || {};
    let html = renderFilterBar();
    html += `<div class="results-summary">${allCaps.length} capabilities</div>`;
    html += '<div class="listing-list">';
    allCaps.forEach(({ cap, progress, theme, number }) => {
      const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
      const isExpanded = state.expandedCapabilities[cap.id];
      const epicKeys = cap.links?.epics || [];
      html += `<div class="listing-capability-block">`;
      html += `<div class="listing-row listing-row--capability" data-cap-id="${escapeHtml(cap.id)}" role="button" tabindex="0">`;
      html += `<span class="listing-row__chevron" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>`;
      html += `<span class="listing-num">${number}</span>`;
      html += `<span class="listing-main">${escapeHtml(cap.name)}</span>`;
      html += `<span class="listing-meta">${escapeHtml(theme)}</span>`;
      html += `<span class="listing-meta">P${cap.priority || 1}</span>`;
      html += `<span class="listing-status status-${progress.status || 'backlog'}">${progress.status || 'backlog'}</span>`;
      html += `<div class="listing-bar"><div class="listing-bar__fill" style="width:${pct}%"></div></div>`;
      html += `<span class="listing-pct">${progress.done || 0}/${progress.total || 0} · ${pct}%</span>`;
      html += '</div>';
      if (isExpanded) {
        html += '<div class="listing-row-expanded">';
        html += '<div class="listing-expanded-header">Epics</div>';
        if (epicKeys.length) {
          epicKeys.forEach(epicKey => {
            const epicStatus = devStatus[epicKey] || 'backlog';
            const epicName = EPIC_NAMES[epicKey] || epicKey;
            const stories = getStoriesForEpic(epicKey, devStatus);
            const done = stories.filter(s => s.status === 'done').length;
            const total = stories.length;
            const epicPct = total ? Math.round((done / total) * 100) : 0;
            html += `<div class="listing-epic-item">
              <span class="listing-epic-name">${escapeHtml(epicName)}</span>
              <span class="listing-epic-status status-${epicStatus}">${epicStatus}</span>
              <span class="listing-epic-progress">${done}/${total} · ${epicPct}%</span>
            </div>`;
          });
        } else {
          html += '<p class="listing-expanded-empty">No epics linked to this capability yet.</p>';
        }
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderEpics() {
    let seq = state.sprint?.development_sequence || [];
    const devStatus = state.sprint?.development_status || {};
    if (state.filters.status && state.filters.status !== 'all') {
      seq = seq.filter(epicKey => (devStatus[epicKey] || 'backlog') === state.filters.status);
    }

    let html = renderFilterBar();
    html += `<div class="results-summary">${seq.length} epic${seq.length !== 1 ? 's' : ''}</div>`;
    html += '<div class="listing-list">';
    seq.forEach((epicKey, idx) => {
      const name = EPIC_NAMES[epicKey] || epicKey;
      const epicStatus = devStatus[epicKey] || 'backlog';
      const stories = getStoriesForEpic(epicKey, devStatus);
      const done = stories.filter(s => s.status === 'done').length;
      const total = stories.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const caps = state.capabilities.filter(c => c.links?.epics?.includes(epicKey));
      const isExpanded = state.expandedEpics[epicKey];

      html += `<div class="listing-epic-block">`;
      html += `<div class="listing-row listing-row--epic" data-epic-key="${escapeHtml(epicKey)}" role="button" tabindex="0">`;
      html += `<span class="listing-row__chevron" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>`;
      html += `<span class="listing-num">${idx + 1}</span>`;
      html += `<span class="listing-main">${escapeHtml(name)}</span>`;
      html += `<span class="listing-meta">${caps.length} capabilities</span>`;
      html += `<span class="listing-meta">${done}/${total} stories</span>`;
      html += `<span class="listing-status status-${epicStatus}">${epicStatus}</span>`;
      html += `<div class="listing-bar"><div class="listing-bar__fill" style="width:${pct}%"></div></div>`;
      html += `<span class="listing-pct">${pct}%</span>`;
      html += '</div>';
      if (isExpanded && stories.length) {
        html += '<div class="listing-row-expanded">';
        html += '<div class="listing-expanded-header">Stories</div>';
        stories.forEach(story => {
          html += `<div class="listing-story-item">
            <span class="listing-story-id">${escapeHtml(story.id)}</span>
            <span class="listing-story-status status-${story.status || 'backlog'}">${story.status || 'backlog'}</span>
          </div>`;
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderStories() {
    const devStatus = state.sprint?.development_status || {};
    let stories = [];
    Object.keys(devStatus).forEach(key => {
      if (isEpicKey(key) || key === 'generated' || key === 'project') return;
      stories.push({ id: key, status: devStatus[key] });
    });

    // Apply filters
    if (state.filters.status !== 'all') stories = stories.filter(s => s.status === state.filters.status);

    let html = renderFilterBar();
    html += `<div class="results-summary">${stories.length} stories</div>`;
    html += '<div class="listing-list">';
    stories.forEach((story, idx) => {
      const epicNum = story.id.split('-')[0];
      const isExpanded = state.expandedStories[story.id];
      html += `<div class="listing-story-block">`;
      html += `<div class="listing-row listing-row--story" data-story-id="${escapeHtml(story.id)}" role="button" tabindex="0">`;
      html += `<span class="listing-row__chevron" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>`;
      html += `<span class="listing-num">${idx + 1}</span>`;
      html += `<span class="listing-main">${escapeHtml(story.id)}</span>`;
      html += `<span class="listing-meta">Epic ${epicNum}</span>`;
      html += `<span class="listing-status status-${story.status}">${story.status}</span>`;
      html += '</div>';
      if (isExpanded) {
        html += `<div class="listing-row-expanded listing-story-detail-wrap" data-story-id="${escapeHtml(story.id)}">`;
        if (state.storyContentCache[story.id] !== undefined) {
          html += `<div class="listing-story-detail listing-story-detail--md">${renderStoryMarkdown(state.storyContentCache[story.id])}</div>`;
        } else {
          html += '<div class="listing-story-detail listing-story-detail--loading">Loading...</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderStoryMarkdown(text) {
    if (!text) return '';
    if (typeof window.marked !== 'undefined') {
      try {
        if (window.marked.use) window.marked.use({ gfm: true, breaks: true });
        else if (window.marked.setOptions) window.marked.setOptions({ gfm: true, breaks: true });
        return window.marked.parse(text);
      } catch (e) { return escapeHtml(text); }
    }
    return escapeHtml(text);
  }

  function loadStoryContent(storyId, containerEl) {
    if (!containerEl || !storyId) return;
    if (state.storyContentCache[storyId] !== undefined) {
      containerEl.classList.remove('listing-story-detail--loading');
      containerEl.classList.add('listing-story-detail--md');
      containerEl.innerHTML = renderStoryMarkdown(state.storyContentCache[storyId]);
      return;
    }
    const url = STORIES_BASE + storyId + '.md?v=' + Date.now();
    fetch(url)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(r.statusText)))
      .then(text => {
        state.storyContentCache[storyId] = text;
        containerEl.classList.remove('listing-story-detail--loading');
        containerEl.classList.add('listing-story-detail--md');
        containerEl.innerHTML = renderStoryMarkdown(text);
      })
      .catch(() => {
        state.storyContentCache[storyId] = '';
        containerEl.classList.remove('listing-story-detail--loading');
        containerEl.textContent = 'Story file not found or could not be loaded.';
      });
  }

  function statusToColumn(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'done') return 'done';
    if (s === 'in-progress') return 'in-progress';
    if (s === 'review' || s === 'qa-review') return 'review';
    if (s === 'ready-for-dev') return 'ready-for-dev';
    return 'backlog';
  }

  function renderKanban() {
    const devStatus = state.sprint?.development_status || {};
    const groupBy = state.kanbanGroupBy || 'stories';
    const columns = [
      { id: 'backlog', label: 'Backlog' },
      { id: 'ready-for-dev', label: 'Ready' },
      { id: 'in-progress', label: 'In Progress' },
      { id: 'review', label: 'Review' },
      { id: 'done', label: 'Done' }
    ];

    const byColumn = { backlog: [], 'ready-for-dev': [], 'in-progress': [], review: [], done: [] };

    if (groupBy === 'stories') {
      Object.keys(devStatus).forEach(key => {
        if (isEpicKey(key) || key === 'generated' || key === 'project') return;
        const col = statusToColumn(devStatus[key]);
        if (byColumn[col]) byColumn[col].push({ id: key, label: key });
      });
    } else if (groupBy === 'epics') {
      const seq = state.sprint?.development_sequence || [];
      seq.forEach(epicKey => {
        if (!isEpicKey(epicKey)) return;
        const status = devStatus[epicKey] || 'backlog';
        const col = statusToColumn(status);
        if (byColumn[col]) byColumn[col].push({ id: epicKey, label: EPIC_NAMES[epicKey] || epicKey });
      });
    } else if (groupBy === 'capabilities') {
      (state.capabilities || []).forEach(cap => {
        const progress = state.capabilityProgress[cap.id] || {};
        const status = progress.status || 'backlog';
        const col = statusToColumn(status);
        if (byColumn[col]) byColumn[col].push({ id: cap.id, label: cap.name || cap.id });
      });
    } else if (groupBy === 'themes') {
      (state.themes || []).forEach(theme => {
        const capIds = theme.capabilityIds || [];
        let status = 'backlog';
        if (capIds.length) {
          const progressList = capIds.map(id => state.capabilityProgress[id]?.status).filter(Boolean);
          const allDone = progressList.length && progressList.every(s => s === 'done');
          const anyDone = progressList.some(s => s === 'done');
          const anyInProgress = progressList.some(s => s === 'in-progress');
          if (allDone) status = 'done';
          else if (anyDone || anyInProgress) status = 'in-progress';
        }
        const col = statusToColumn(status);
        if (byColumn[col]) byColumn[col].push({ id: theme.name, label: theme.name });
      });
    }

    const options = [
      { value: 'stories', label: 'Stories' },
      { value: 'epics', label: 'Epics' },
      { value: 'capabilities', label: 'Capabilities' },
      { value: 'themes', label: 'Themes' }
    ];

    let html = '<div class="kanban-wrap">';
    html += '<div class="kanban-toolbar">';
    html += '<label for="kanban-group" class="kanban-toolbar__label">Show:</label>';
    html += '<select id="kanban-group" class="kanban-toolbar__select">';
    options.forEach(opt => {
      html += `<option value="${opt.value}" ${groupBy === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`;
    });
    html += '</select>';
    html += '</div>';
    html += '<div class="kanban-board">';
    columns.forEach(col => {
      const items = byColumn[col.id] || [];
      html += `<div class="kanban-column" data-column="${col.id}">`;
      html += `<h4 class="kanban-column__title">${col.label} <span class="kanban-column__count">${items.length}</span></h4>`;
      html += '<div class="kanban-cards">';
      items.forEach(item => {
        html += `<div class="kanban-card">${escapeHtml(item.label)}</div>`;
      });
      html += '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  // Helper functions
  function getStoriesForEpic(epicKey, devStatus) {
    const num = epicKey.replace('epic-', '');
    return Object.keys(devStatus || {})
      .filter(key => !isEpicKey(key) && key !== 'generated' && key !== 'project' && key.startsWith(num + '-'))
      .map(key => ({ id: key, status: devStatus[key] }));
  }

  function renderCapabilityRow(cap, progress, number) {
    const status = progress.status || 'backlog';
    const label = progress.total ? `${progress.done}/${progress.total}` : '-';
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return `<div class="capability-row" data-cap-id="${escapeHtml(cap.id)}">
      <span class="capability-row__number">${number}</span>
      <span class="capability-row__name">${escapeHtml(cap.name)}</span>
      <span class="capability-row__priority p${cap.priority || 1}">P${cap.priority || 1}</span>
      <span class="capability-row__status status-${status}">${status}</span>
      <span class="capability-row__progress">${label} (${pct}%)</span>
    </div>`;
  }

  function renderFilterBar() {
    const themeVal = state.filters.theme || 'all';
    const priorityVal = state.filters.priority || 'all';
    const statusVal = state.filters.status || 'all';
    const sortVal = state.sortBy || 'number';
    const themeOpts = state.themes.map((t, i) => {
      const sel = themeVal === t.name ? ' selected' : '';
      return `<option value="${escapeHtml(t.name)}"${sel}>${i + 1}. ${escapeHtml(t.name)}</option>`;
    }).join('');
    return `<div class="filters-bar">
      <div class="filter-group"><label>Theme:</label>
        <select id="filter-theme"><option value="all"${themeVal === 'all' ? ' selected' : ''}>All</option>${themeOpts}</select>
      </div>
      <div class="filter-group"><label>Priority:</label>
        <select id="filter-priority"><option value="all"${priorityVal === 'all' ? ' selected' : ''}>All</option><option value="1"${priorityVal === '1' ? ' selected' : ''}>P1</option><option value="2"${priorityVal === '2' ? ' selected' : ''}>P2</option><option value="3"${priorityVal === '3' ? ' selected' : ''}>P3</option></select>
      </div>
      <div class="filter-group"><label>Status:</label>
        <select id="filter-status"><option value="all"${statusVal === 'all' ? ' selected' : ''}>All</option><option value="backlog"${statusVal === 'backlog' ? ' selected' : ''}>Backlog</option><option value="ready-for-dev"${statusVal === 'ready-for-dev' ? ' selected' : ''}>Ready</option><option value="in-progress"${statusVal === 'in-progress' ? ' selected' : ''}>In Progress</option><option value="review"${statusVal === 'review' ? ' selected' : ''}>Review</option><option value="qa-review"${statusVal === 'qa-review' ? ' selected' : ''}>QA Review</option><option value="done"${statusVal === 'done' ? ' selected' : ''}>Done</option></select>
      </div>
      <div class="filter-group"><label>Sort:</label>
        <select id="sort-by"><option value="number"${sortVal === 'number' ? ' selected' : ''}>Number</option><option value="priority"${sortVal === 'priority' ? ' selected' : ''}>Priority</option><option value="status"${sortVal === 'status' ? ' selected' : ''}>Status</option><option value="name"${sortVal === 'name' ? ' selected' : ''}>Name</option></select>
      </div>
      <button id="clear-filters" class="btn-clear">Clear</button>
    </div>`;
  }

  function renderCapabilitiesTable(caps) {
    let html = `<div class="results-summary">${caps.length} capabilities found</div>`;
    html += '<div class="capabilities-table">';
    html += '<div class="table-header"><span>#</span><span>Theme</span><span>Capability</span><span>Priority</span><span>Status</span><span>Progress</span></div>';
    caps.forEach(({ cap, progress, theme, number }) => {
      html += renderCapabilityRow(cap, progress, number);
    });
    html += '</div>';
    return html;
  }

  // Main render
  function renderView() {
    const content = document.getElementById('content');
    const view = state.view;

    if (view === 'dashboard') content.innerHTML = renderDashboard();
    else if (view === 'themes') content.innerHTML = renderThemes();
    else if (view === 'capabilities') content.innerHTML = renderCapabilities();
    else if (view === 'epics') content.innerHTML = renderEpics();
    else if (view === 'stories') content.innerHTML = renderStories();
    else if (view === 'kanban') content.innerHTML = renderKanban();
    else content.innerHTML = renderDashboard();

    document.body.classList.toggle('view-dashboard', view === 'dashboard');

    attachEventListeners();
  }

  function attachEventListeners() {
    // Filter handlers
    document.getElementById('filter-theme')?.addEventListener('change', e => { state.filters.theme = e.target.value; renderView(); });
    document.getElementById('filter-priority')?.addEventListener('change', e => { state.filters.priority = e.target.value; renderView(); });
    document.getElementById('filter-status')?.addEventListener('change', e => { state.filters.status = e.target.value; renderView(); });
    document.getElementById('sort-by')?.addEventListener('change', e => { state.sortBy = e.target.value; renderView(); });
    document.getElementById('clear-filters')?.addEventListener('click', () => {
      state.filters = { theme: 'all', priority: 'all', status: 'all' };
      state.sortBy = 'number';
      renderView();
    });
    document.getElementById('kanban-group')?.addEventListener('change', e => { state.kanbanGroupBy = e.target.value; renderView(); });

    // Theme (light/dark) selector in header
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = document.body.classList.contains('theme-light') ? 'light' : 'dark';
      themeSelect.addEventListener('change', function () {
        const isLight = this.value === 'light';
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add(isLight ? 'theme-light' : 'theme-dark');
        try { localStorage.setItem(THEME_KEY, this.value); } catch (e) {}
      });
    }

    // Theme row click -> expand/collapse capabilities
    document.querySelectorAll('.listing-row--theme').forEach(el => {
      const idx = el.getAttribute('data-theme-index');
      if (idx === null) return;
      const toggle = () => {
        const n = parseInt(idx, 10);
        state.expandedThemes[n] = !state.expandedThemes[n];
        renderView();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // Capability row click -> expand/collapse epics
    document.querySelectorAll('.listing-row--capability').forEach(el => {
      const capId = el.getAttribute('data-cap-id');
      if (!capId) return;
      const toggle = () => {
        state.expandedCapabilities[capId] = !state.expandedCapabilities[capId];
        renderView();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // Epic row click -> expand/collapse stories
    document.querySelectorAll('.listing-row--epic').forEach(el => {
      const epicKey = el.getAttribute('data-epic-key');
      if (!epicKey) return;
      const toggle = () => {
        state.expandedEpics[epicKey] = !state.expandedEpics[epicKey];
        renderView();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // Story row click -> expand/collapse detail (content from implementation-artifacts/stories/*.md)
    document.querySelectorAll('.listing-row--story').forEach(el => {
      const storyId = el.getAttribute('data-story-id');
      if (!storyId) return;
      const toggle = () => {
        state.expandedStories[storyId] = !state.expandedStories[storyId];
        renderView();
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // Load story detail content for expanded rows that are still loading
    document.querySelectorAll('.listing-story-detail-wrap[data-story-id]').forEach(wrap => {
      const id = wrap.getAttribute('data-story-id');
      const detail = wrap.querySelector('.listing-story-detail');
      if (detail && detail.classList.contains('listing-story-detail--loading')) loadStoryContent(id, detail);
    });

    // Dashboard block click -> navigate to listing
    document.querySelectorAll('.dashboard-block').forEach(el => {
      el.addEventListener('click', () => {
        const view = el.getAttribute('data-nav');
        if (view) navigateTo(view);
      });
    });

    // Story card - no detail panel
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.getAttribute('data-view')));
  });

  // Init
  loadData();
})();
