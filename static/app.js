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
  teams.value = 'Team A\nTeam B'; // default to 2 teams
  const lanes = el('input', { type: 'number', id: 'lanes', value: 8 });
  const submit = el('button', { onclick: async (e) => {
    e.preventDefault();
    const body = { title: title.value, date: date.value || new Date().toISOString().slice(0,10), teams: teams.value.split('\n').map(s=>s.trim()).filter(Boolean), lanes: parseInt(lanes.value || '8') };
    const res = await fetch('/api/meets', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) {
      const meet = await res.json();
      loadMeet(meet.id);
    } else {
      alert('Error creating meet');
    }
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
  header.appendChild(el('th', {}, 'Exhibition'));
  table.appendChild(header);
  const laneSelects = [];
  const exhibitionChecks = [];
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
    const chk = el('input', { type: 'checkbox', id: 'exh_'+i });
    if (currentMeet.exhibition_lanes && currentMeet.exhibition_lanes[i]) chk.checked = true;
    tr.appendChild(el('td', {}, chk));
    exhibitionChecks.push(chk);
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  const pointsDiv = el('div', { style: 'margin-top: 20px;' });
  pointsDiv.appendChild(el('h3', {}, 'Points Configuration'));
  
  // Individual
  pointsDiv.appendChild(el('h4', {}, 'Individual Events'));
  const indTable = el('table');
  const indHeader = el('tr');
  indHeader.appendChild(el('th', {}, 'Place'));
  indHeader.appendChild(el('th', {}, 'Points'));
  indTable.appendChild(indHeader);
  const indInputs = [];
  for (let i=0; i<8; i++) {
    const tr = el('tr');
    tr.appendChild(el('td', {}, (i+1) + (i===0?'st':i===1?'nd':i===2?'rd':'th')));
    const inp = el('input', { type: 'number', value: currentMeet.points_individual[i] || 0 });
    tr.appendChild(el('td', {}, inp));
    indInputs.push(inp);
    indTable.appendChild(tr);
  }
  pointsDiv.appendChild(indTable);
  
  // Relay
  pointsDiv.appendChild(el('h4', {}, 'Relay Events'));
  const relTable = el('table');
  const relHeader = el('tr');
  relHeader.appendChild(el('th', {}, 'Place'));
  relHeader.appendChild(el('th', {}, 'Points'));
  relTable.appendChild(relHeader);
  const relInputs = [];
  for (let i=0; i<8; i++) {
    const tr = el('tr');
    tr.appendChild(el('td', {}, (i+1) + (i===0?'st':i===1?'nd':i===2?'rd':'th')));
    const inp = el('input', { type: 'number', value: currentMeet.points_relay[i] || 0 });
    tr.appendChild(el('td', {}, inp));
    relInputs.push(inp);
    relTable.appendChild(tr);
  }
  pointsDiv.appendChild(relTable);
  
  wrap.appendChild(pointsDiv);
  const saveBtn = el('button', { onclick: async ()=>{
    const lane_team = laneSelects.map(s => s.value || null);
    const exhibition_lanes = exhibitionChecks.map(c => c.checked);
    const points_individual = indInputs.map(inp => parseInt(inp.value) || 0);
    const points_relay = relInputs.map(inp => parseInt(inp.value) || 0);
    try {
      const res = await fetch('/api/meets/'+currentMeet.id+'/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ lane_team, exhibition_lanes, points_individual, points_relay }) });
      if (res.ok) {
        // reload meet
        const m = await api('/api/meets/' + currentMeet.id);
        currentMeet = m;
      } else {
        alert('Error saving config: ' + res.status);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
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
      
      // Validation: unique placements, no overlap with DQs, cover all non-exhibition lanes
      const nonExhibitionLanes = new Set();
      for (let i=1; i<=currentMeet.lanes; i++) {
        if (!currentMeet.exhibition_lanes[i-1]) nonExhibitionLanes.add(i);
      }
      const placementSet = new Set(placements);
      const dqSet = new Set(dqs);
      if (placementSet.size !== placements.length) {
        alert('Error: Duplicate lane numbers in placements.');
        return;
      }
      if ([...placementSet].some(l => dqSet.has(l))) {
        alert('Error: Lane cannot be both in placements and DQs.');
        return;
      }
      const usedLanes = new Set([...placementSet, ...dqSet]);
      for (let lane of nonExhibitionLanes) {
        if (!usedLanes.has(lane)) {
          alert('Error: All non-exhibition lanes must be accounted for (placements or DQs).');
          return;
        }
      }
      
      try {
        const res = await fetch('/api/meets/'+currentMeet.id+'/results', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ event_index: idx, placements, disqualified: dqs }) });
        if (res.ok) {
          // alert('Saved');
          // Optionally reload meet to update currentMeet.results
          const m = await api('/api/meets/' + currentMeet.id);
          currentMeet = m;
        } else {
          alert('Error saving: ' + res.status);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }}, 'Save');
    tr.appendChild(el('td', {}, btn));
    table.appendChild(tr);

    // Pre-fill with existing results
    if (currentMeet.results && currentMeet.results[idx]) {
      const res = currentMeet.results[idx];
      res.placements.forEach((lane, place) => {
        if (place < placeInputs.length) {
          placeInputs[place].value = lane;
        }
      });
      dqInp.value = res.disqualified.join(', ');
    }
  });
  container.appendChild(table);
  main.appendChild(container);
}

async function showDetails() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'Select a meet first'));
  main.appendChild(el('h2', {}, 'Details'));
  const scores = await api('/api/meets/'+currentMeet.id+'/scores');
  const container = el('div');

  // Overall scores
  const overall = el('div');
  overall.appendChild(el('h3', {}, 'Overall Scores'));
  const overallList = el('ul');
  currentMeet.teams.forEach(t => overallList.appendChild(el('li', {}, t.name + ': ' + (scores.team_scores[t.id] || 0) + ' points')));
  overall.appendChild(overallList);
  container.appendChild(overall);

  // Per event details
  scores.per_event.forEach((eventDetail, idx) => {
    const eventDiv = el('div', { style: 'margin-top: 20px; border: 1px solid #ccc; padding: 10px;' });
    eventDiv.appendChild(el('h4', {}, (idx+1) + '. ' + eventDetail.event_name + (eventDetail.is_relay ? ' (Relay)' : '')));
    
    if (eventDetail.placements.length === 0) {
      eventDiv.appendChild(el('p', {}, 'No results entered yet.'));
    } else {
      const table = el('table');
      const header = el('tr');
      header.appendChild(el('th', {}, 'Place'));
      header.appendChild(el('th', {}, 'Lane'));
      header.appendChild(el('th', {}, 'Team'));
      header.appendChild(el('th', {}, 'Points'));
      table.appendChild(header);
      
      eventDetail.placements.forEach(p => {
        const team = currentMeet.teams.find(t => t.id === p.team_id);
        const tr = el('tr');
        tr.appendChild(el('td', {}, p.place + (p.place === 1 ? 'st' : p.place === 2 ? 'nd' : p.place === 3 ? 'rd' : 'th')));
        tr.appendChild(el('td', {}, p.lane));
        tr.appendChild(el('td', {}, team ? team.name : 'Unknown'));
        tr.appendChild(el('td', {}, p.points));
        table.appendChild(tr);
      });
      eventDiv.appendChild(table);
      
      // Points awarded summary
      const pointsDiv = el('div');
      pointsDiv.appendChild(el('p', {}, 'Points Awarded:'));
      const pointsList = el('ul');
      Object.keys(eventDetail.points_awarded).forEach(teamId => {
        const team = currentMeet.teams.find(t => t.id === teamId);
        pointsList.appendChild(el('li', {}, (team ? team.name : 'Unknown') + ': ' + eventDetail.points_awarded[teamId]));
      });
      pointsDiv.appendChild(pointsList);
      eventDiv.appendChild(pointsDiv);
    }
    container.appendChild(eventDiv);
  });

  main.appendChild(container);
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
