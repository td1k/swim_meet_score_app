const main = document.getElementById('main');

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

function clear() { main.innerHTML = ''; }

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const k of Object.keys(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else e.setAttribute(k, props[k]);
  }
  for (const c of children) if (c) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

async function showMeets() {
  clear();
  const meets = await api('/api/meets');
  const list = el('div');
  meets.forEach(m => {
    const btn = el('button', { onclick: () => loadMeet(m.id) }, m.title + ' (' + m.date + ')');
    list.appendChild(btn);
  });
  main.appendChild(el('h2', {}, 'Meets'));
  main.appendChild(list);
}

function showCreate() {
  clear();
  const form = el('form');
  const title = el('input', { type: 'text', placeholder: 'Meet Title', id: 'title' });
  const date = el('input', { type: 'text', placeholder: 'YYYY-MM-DD', id: 'date' });
  const teams = el('textarea', { placeholder: 'One team per line', id: 'teams' });
  const lanes = el('input', { type: 'number', id: 'lanes', value: 8 });
  const submit = el('button', { onclick: async (e) => {
    e.preventDefault();
    const body = { title: title.value, date: date.value || new Date().toISOString().slice(0,10), teams: teams.value.split('\n').map(s=>s.trim()).filter(Boolean), lanes: parseInt(lanes.value || '8') };
    const res = await fetch('/api/meets', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const meet = await res.json();
    loadMeet(meet.id);
  }}, 'Create');
  form.appendChild(el('div', {}, title));
  form.appendChild(el('div', {}, date));
  form.appendChild(el('div', {}, lanes));
  form.appendChild(el('div', {}, teams));
  form.appendChild(el('div', {}, submit));
  main.appendChild(el('h2', {}, 'Create Meet'));
  main.appendChild(form);
}

let currentMeet = null;

async function loadMeet(id) {
  const m = await api('/api/meets/' + id);
  currentMeet = m;
  showMeetDetail();
}

function showMeetDetail() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'No meet selected'));
  main.appendChild(el('h2', {}, currentMeet.title + ' (' + currentMeet.date + ')'));
  const teams = el('ul');
  currentMeet.teams.forEach(t => teams.appendChild(el('li', {}, t.name)));
  main.appendChild(el('h3', {}, 'Teams'));
  main.appendChild(teams);
}

function showConfig() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'Select a meet first'));
  main.appendChild(el('h2', {}, 'Configure Meet'));
  const wrap = el('div');
  wrap.appendChild(el('div', {}, 'Lanes: ' + currentMeet.lanes));
  // lane assignment
  const table = el('table');
  const header = el('tr');
  header.appendChild(el('th', {}, 'Lane'));
  header.appendChild(el('th', {}, 'Team'));
  table.appendChild(header);
  const laneSelects = [];
  for (let i=0;i<currentMeet.lanes;i++){
    const tr = el('tr');
    tr.appendChild(el('td', {}, ''+(i+1)));
    const sel = el('select', { id: 'lane_'+i });
    sel.appendChild(el('option', { value: '' }, '---'));
    currentMeet.teams.forEach(t => {
      const opt = el('option', { value: t.id }, t.name);
      if (currentMeet.lane_team[i] && currentMeet.lane_team[i] === t.id) opt.selected = true;
      sel.appendChild(opt);
    });
    tr.appendChild(el('td', {}, sel));
    laneSelects.push(sel);
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  const saveBtn = el('button', { onclick: async ()=>{
    const lane_team = laneSelects.map(s => s.value || null);
    await fetch('/api/meets/'+currentMeet.id+'/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ lane_team }) });
    alert('Saved');
    // reload meet
    const m = await api('/api/meets/' + currentMeet.id);
    currentMeet = m;
  }}, 'Save Config');
  wrap.appendChild(saveBtn);
  main.appendChild(wrap);
}

function showResultsEntry() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'Select a meet first'));
  main.appendChild(el('h2', {}, 'Results Entry'));
  const container = el('div');
  const table = el('table');
  // header
  const header = el('tr');
  header.appendChild(el('th', {}, 'Event'));
  for (let p=1; p<=8; p++) { // assume up to 8 places
    header.appendChild(el('th', {}, p + (p===1?'st':p===2?'nd':p===3?'rd':'th')));
  }
  header.appendChild(el('th', {}, 'DQ Lanes'));
  header.appendChild(el('th', {}, 'Action'));
  table.appendChild(header);
  // rows
  currentMeet.events.forEach((ev, idx) => {
    const tr = el('tr');
    tr.appendChild(el('td', {}, (idx+1)+'. '+ev.name + (ev.is_relay ? ' (Relay)' : '')));
    const placeInputs = [];
    for (let p=0; p<8; p++) {
      const inp = el('input', { type: 'number', min: 1, max: currentMeet.lanes, id: 'ev_'+idx+'_p'+p });
      tr.appendChild(el('td', {}, inp));
      placeInputs.push(inp);
    }
    const dqInp = el('input', { type: 'text', placeholder: 'e.g. 1,3', id: 'dq_'+idx });
    tr.appendChild(el('td', {}, dqInp));
    const btn = el('button', { onclick: async ()=>{
      const placements = placeInputs.map(inp => parseInt(inp.value)).filter(n => !isNaN(n) && n >=1 && n <= currentMeet.lanes);
      const dqs = dqInp.value.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n) && n >=1 && n <= currentMeet.lanes);
      await fetch('/api/meets/'+currentMeet.id+'/results', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ event_index: idx, placements, disqualified: dqs }) });
      alert('Saved');
    }}, 'Save');
    tr.appendChild(el('td', {}, btn));
    table.appendChild(tr);
  });
  container.appendChild(table);
  main.appendChild(container);
}

async function showDetails() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'Select a meet first'));
  main.appendChild(el('h2', {}, 'Details'));
  const scores = await api('/api/meets/'+currentMeet.id+'/scores');
  const tbody = el('div');
  currentMeet.teams.forEach(t => {
    const pts = scores.team_scores[t.id] || 0;
    const row = el('div', {}, t.name + ': ' + pts);
    tbody.appendChild(row);
  });
  main.appendChild(tbody);
}

async function showSummary() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'Select a meet first'));
  main.appendChild(el('h2', {}, 'Summary'));
  const scores = await api('/api/meets/'+currentMeet.id+'/scores');
  const list = el('ul');
  currentMeet.teams.forEach(t => list.appendChild(el('li', {}, t.name + ': ' + (scores.team_scores[t.id] || 0))));
  main.appendChild(list);
}

document.getElementById('meetsBtn').addEventListener('click', showMeets);
document.getElementById('createBtn').addEventListener('click', showCreate);
document.getElementById('configBtn').addEventListener('click', showConfig);
document.getElementById('resultsBtn').addEventListener('click', showResultsEntry);
document.getElementById('detailsBtn').addEventListener('click', showDetails);
document.getElementById('summaryBtn').addEventListener('click', showSummary);

showMeets();
