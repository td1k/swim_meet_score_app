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
    else if (k === 'class') e.className = props[k];
    else e.setAttribute(k, props[k]);
  }
  for (const c of children) if (c) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

async function showMeets() {
  clear();
  try {
    const meets = await api('/api/meets');
    
    const h2 = el('h2', { class: 'mb-3' }, 'Meets');
    main.appendChild(h2);
    
    if (meets.length === 0) {
      const noMeetsDiv = el('div', { class: 'alert alert-info' }, 
        'No meets found. Click "Create Meet" to get started.'
      );
      main.appendChild(noMeetsDiv);
    } else {
      const list = el('div', { class: 'list-group' });
      meets.forEach(m => {
        const btn = el('button', { class: 'list-group-item list-group-item-action', onclick: () => loadMeet(m.id) }, m.title + ' (' + m.date + ')');
        list.appendChild(btn);
      });
      main.appendChild(list);
    }
  } catch (error) {
    const errorDiv = el('div', { class: 'alert alert-danger' }, 'Error loading meets: ' + error.message);
    main.appendChild(errorDiv);
  }
}

function showCreate() {
  clear();
  const form = el('form', { class: 'container-fluid' });
  const titleGroup = el('div', { class: 'mb-3' });
  titleGroup.appendChild(el('label', { class: 'form-label', for: 'title' }, 'Meet Title'));
  const title = el('input', { class: 'form-control', type: 'text', placeholder: 'Meet Title', id: 'title' });
  titleGroup.appendChild(title);
  form.appendChild(titleGroup);
  
  const dateGroup = el('div', { class: 'mb-3' });
  dateGroup.appendChild(el('label', { class: 'form-label', for: 'date' }, 'Date (YYYY-MM-DD)'));
  const date = el('input', { class: 'form-control', type: 'text', placeholder: 'YYYY-MM-DD', id: 'date' });
  dateGroup.appendChild(date);
  form.appendChild(dateGroup);
  
  const lanesGroup = el('div', { class: 'mb-3' });
  lanesGroup.appendChild(el('label', { class: 'form-label', for: 'lanes' }, 'Number of Lanes'));
  const lanes = el('input', { class: 'form-control', type: 'number', id: 'lanes', value: 8 });
  lanesGroup.appendChild(lanes);
  form.appendChild(lanesGroup);
  
  const teamsGroup = el('div', { class: 'mb-3' });
  teamsGroup.appendChild(el('label', { class: 'form-label', for: 'teams' }, 'Teams (one per line, format: "Full Name:Short Name" or just "Full Name")'));
  const teams = el('textarea', { class: 'form-control', placeholder: 'Team A:TMA\nTeam B:TMB', id: 'teams', rows: 4 });
  teams.value = 'Team A:TMA\nTeam B:TMB'; // default to 2 teams
  teamsGroup.appendChild(teams);
  form.appendChild(teamsGroup);
  
  const submit = el('button', { class: 'btn btn-primary', onclick: async (e) => {
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
  form.appendChild(submit);
  main.appendChild(el('h2', { class: 'mb-3' }, 'Create Meet'));
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
  const teamsCard = el('div', { class: 'card' });
  const teamsBody = el('div', { class: 'card-body' });
  teamsBody.appendChild(el('h5', { class: 'card-title' }, 'Teams'));
  const teams = el('ul', { class: 'list-group list-group-flush' });
  currentMeet.teams.forEach(t => teams.appendChild(el('li', { class: 'list-group-item' }, t.name + ' (' + t.short_name + ')')));
  teamsBody.appendChild(teams);
  teamsCard.appendChild(teamsBody);
  main.appendChild(teamsCard);
}

function showConfig() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', {}, 'Select a meet first'));
  main.appendChild(el('h2', {}, 'Configure Meet'));
  const wrap = el('div', { class: 'container-fluid' });
  wrap.appendChild(el('div', { class: 'alert alert-info' }, 'Lanes: ' + currentMeet.lanes));
  // lane assignment
  const laneCard = el('div', { class: 'card mb-3' });
  const laneBody = el('div', { class: 'card-body' });
  laneBody.appendChild(el('h5', { class: 'card-title' }, 'Lane Assignments'));
  const table = el('table', { class: 'table table-striped' });
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
    const sel = el('select', { class: 'form-select', id: 'lane_'+i });
    sel.appendChild(el('option', { value: '' }, '---'));
    currentMeet.teams.forEach(t => {
      const opt = el('option', { value: t.id }, t.name);
      if (currentMeet.lane_team[i] && currentMeet.lane_team[i] === t.id) opt.selected = true;
      sel.appendChild(opt);
    });
    tr.appendChild(el('td', {}, sel));
    laneSelects.push(sel);
    const chk = el('input', { class: 'form-check-input', type: 'checkbox', id: 'exh_'+i });
    if (currentMeet.exhibition_lanes && currentMeet.exhibition_lanes[i]) chk.checked = true;
    tr.appendChild(el('td', {}, chk));
    exhibitionChecks.push(chk);
    table.appendChild(tr);
  }
  laneBody.appendChild(table);
  laneCard.appendChild(laneBody);
  wrap.appendChild(laneCard);
  const pointsCard = el('div', { class: 'card mb-3' });
  const pointsBody = el('div', { class: 'card-body' });
  pointsBody.appendChild(el('h5', { class: 'card-title' }, 'Points Configuration'));
  
  // Individual
  pointsBody.appendChild(el('h6', {}, 'Individual Events'));
  const indTable = el('table', { class: 'table table-striped' });
  const indHeader = el('tr');
  indHeader.appendChild(el('th', {}, 'Place'));
  indHeader.appendChild(el('th', {}, 'Points'));
  indTable.appendChild(indHeader);
  const indInputs = [];
  for (let i=0; i<8; i++) {
    const tr = el('tr');
    tr.appendChild(el('td', {}, (i+1) + (i===0?'st':i===1?'nd':i===2?'rd':'th')));
    const inp = el('input', { class: 'form-control', type: 'number', value: currentMeet.points_individual[i] || 0 });
    tr.appendChild(el('td', {}, inp));
    indInputs.push(inp);
    indTable.appendChild(tr);
  }
  pointsBody.appendChild(indTable);
  
  // Relay
  pointsBody.appendChild(el('h6', {}, 'Relay Events'));
  const relTable = el('table', { class: 'table table-striped' });
  const relHeader = el('tr');
  relHeader.appendChild(el('th', {}, 'Place'));
  relHeader.appendChild(el('th', {}, 'Points'));
  relTable.appendChild(relHeader);
  const relInputs = [];
  for (let i=0; i<8; i++) {
    const tr = el('tr');
    tr.appendChild(el('td', {}, (i+1) + (i===0?'st':i===1?'nd':i===2?'rd':'th')));
    const inp = el('input', { class: 'form-control', type: 'number', value: currentMeet.points_relay[i] || 0 });
    tr.appendChild(el('td', {}, inp));
    relInputs.push(inp);
    relTable.appendChild(tr);
  }
  pointsBody.appendChild(relTable);
  pointsCard.appendChild(pointsBody);
  wrap.appendChild(pointsCard);
  const saveBtn = el('button', { class: 'btn btn-primary', onclick: async ()=>{
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
  const container = el('div', { class: 'container-fluid' });
  const table = el('table', { class: 'table table-striped' });
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
      const inp = el('input', { class: 'form-control', type: 'number', min: 1, max: currentMeet.lanes, id: 'ev_'+idx+'_p'+p });
      tr.appendChild(el('td', {}, inp));
      placeInputs.push(inp);
    }
    const dqInp = el('input', { class: 'form-control', type: 'text', placeholder: 'e.g. 1,3', id: 'dq_'+idx });
    tr.appendChild(el('td', {}, dqInp));
    const btn = el('button', { class: 'btn btn-primary', onclick: async ()=>{
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
  const overallCard = el('div', { class: 'card mb-3' });
  const overallBody = el('div', { class: 'card-body' });
  overallBody.appendChild(el('h5', { class: 'card-title' }, 'Overall Scores'));
  const overallList = el('ul', { class: 'list-group list-group-flush' });
  currentMeet.teams.forEach(t => overallList.appendChild(el('li', { class: 'list-group-item d-flex justify-content-between align-items-center' }, t.short_name, el('span', { class: 'badge bg-primary rounded-pill' }, (scores.team_scores[t.id] || 0) + ' points'))));
  overallBody.appendChild(overallList);
  overallCard.appendChild(overallBody);
  container.appendChild(overallCard);

  // Per event details
  scores.per_event.forEach((eventDetail, idx) => {
    const eventCard = el('div', { class: 'card mb-3' });
    const eventBody = el('div', { class: 'card-body' });
    eventBody.appendChild(el('h5', { class: 'card-title' }, (idx+1) + '. ' + eventDetail.event_name + (eventDetail.is_relay ? ' (Relay)' : '')));
    
    if (eventDetail.placements.length === 0) {
      eventBody.appendChild(el('p', { class: 'text-muted' }, 'No results entered yet.'));
    } else {
      const table = el('table', { class: 'table table-striped' });
      const thead = el('thead');
      const header = el('tr');
      header.appendChild(el('th', {}, 'Place'));
      header.appendChild(el('th', {}, 'Lane'));
      header.appendChild(el('th', {}, 'Team'));
      header.appendChild(el('th', {}, 'Points'));
      thead.appendChild(header);
      table.appendChild(thead);
      const tbody = el('tbody');
      eventDetail.placements.forEach(p => {
        const team = currentMeet.teams.find(t => t.id === p.team_id);
        const tr = el('tr');
        tr.appendChild(el('td', {}, p.place + (p.place === 1 ? 'st' : p.place === 2 ? 'nd' : p.place === 3 ? 'rd' : 'th')));
        tr.appendChild(el('td', {}, p.lane));
        tr.appendChild(el('td', {}, team ? team.short_name : 'Unknown'));
        tr.appendChild(el('td', {}, p.points));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      eventBody.appendChild(table);
      
      // Points awarded summary
      eventBody.appendChild(el('h6', {}, 'Points Awarded:'));
      const pointsList = el('ul', { class: 'list-group' });
      Object.keys(eventDetail.points_awarded).forEach(teamId => {
        const team = currentMeet.teams.find(t => t.id === teamId);
        pointsList.appendChild(el('li', { class: 'list-group-item d-flex justify-content-between align-items-center' }, (team ? team.short_name : 'Unknown'), el('span', { class: 'badge bg-primary rounded-pill' }, eventDetail.points_awarded[teamId])));
      });
      eventBody.appendChild(pointsList);
    }
    eventCard.appendChild(eventBody);
    container.appendChild(eventCard);
  });

  main.appendChild(container);
}

async function showSummary() {
  clear();
  if (!currentMeet) return main.appendChild(el('div', { class: 'alert alert-warning' }, 'Select a meet first'));
  main.appendChild(el('h2', { class: 'mb-4 text-center' }, 'Scoreboard'));
  const scores = await api('/api/meets/'+currentMeet.id+'/scores');
  
  // Find last event and next event
  let lastEvent = null;
  let nextEvent = null;
  for (let i = currentMeet.events.length - 1; i >= 0; i--) {
    if (currentMeet.results[i]) {
      lastEvent = currentMeet.events[i];
      break;
    }
  }
  for (let i = 0; i < currentMeet.events.length; i++) {
    if (!currentMeet.results[i]) {
      nextEvent = currentMeet.events[i];
      break;
    }
  }
  
  const container = el('div', { class: 'container-fluid' });
  
  // Current Scores - Top box with teams side by side
  const scoresCard = el('div', { class: 'card mb-4' });
  const scoresBody = el('div', { class: 'card-body' });
  scoresBody.appendChild(el('h3', { class: 'card-title text-center mb-4' }, 'Current Scores'));
  
  const scoresRow = el('div', { class: 'row' });
  currentMeet.teams.forEach(t => {
    const score = scores.team_scores[t.id] || 0;
    const teamCol = el('div', { class: 'col text-center mb-3' });
    teamCol.appendChild(el('div', { class: 'h5 mb-2' }, t.short_name));
    teamCol.appendChild(el('div', { class: 'display-4 font-weight-bold text-primary' }, score.toString()));
    scoresRow.appendChild(teamCol);
  });
  scoresBody.appendChild(scoresRow);
  scoresCard.appendChild(scoresBody);
  container.appendChild(scoresCard);
  
  // Events row - current event on left, next event on right
  const eventsRow = el('div', { class: 'row' });
  
  // Current/Last Event on left
  const currentEventCol = el('div', { class: 'col-md-6' });
  const currentCard = el('div', { class: 'card' });
  const currentBody = el('div', { class: 'card-body text-center' });
  currentBody.appendChild(el('h5', { class: 'card-title' }, 'Current Event'));
  if (lastEvent) {
    currentBody.appendChild(el('p', { class: 'h4 mb-3' }, lastEvent.name + (lastEvent.is_relay ? ' (Relay)' : '')));
    // Show points from last event
    const lastEventIndex = currentMeet.events.findIndex(e => e.name === lastEvent.name);
    if (lastEventIndex >= 0 && scores.per_event[lastEventIndex]) {
      const points = scores.per_event[lastEventIndex].points_awarded;
      const pointsList = el('ul', { class: 'list-group list-group-flush' });
      Object.keys(points).forEach(teamId => {
        const team = currentMeet.teams.find(t => t.id === teamId);
        pointsList.appendChild(el('li', { class: 'list-group-item d-flex justify-content-between' }, 
          el('span', {}, team ? team.short_name : 'Unknown'),
          el('span', { class: 'badge bg-primary' }, points[teamId])
        ));
      });
      currentBody.appendChild(pointsList);
    }
  } else {
    currentBody.appendChild(el('p', { class: 'text-muted' }, 'No events completed yet'));
  }
  currentCard.appendChild(currentBody);
  currentEventCol.appendChild(currentCard);
  eventsRow.appendChild(currentEventCol);
  
  // Next Event on right
  const nextEventCol = el('div', { class: 'col-md-6' });
  const nextCard = el('div', { class: 'card' });
  const nextBody = el('div', { class: 'card-body text-center' });
  nextBody.appendChild(el('h5', { class: 'card-title' }, 'Next Event'));
  if (nextEvent) {
    nextBody.appendChild(el('p', { class: 'h4' }, nextEvent.name + (nextEvent.is_relay ? ' (Relay)' : '')));
  } else {
    nextBody.appendChild(el('p', { class: 'text-muted' }, 'All events completed'));
  }
  nextCard.appendChild(nextBody);
  nextEventCol.appendChild(nextCard);
  eventsRow.appendChild(nextEventCol);
  
  container.appendChild(eventsRow);
  
  main.appendChild(container);
}

document.getElementById('meetsBtn').addEventListener('click', showMeets);
document.getElementById('createBtn').addEventListener('click', showCreate);
document.getElementById('configBtn').addEventListener('click', showConfig);
document.getElementById('resultsBtn').addEventListener('click', showResultsEntry);
document.getElementById('detailsBtn').addEventListener('click', showDetails);
document.getElementById('summaryBtn').addEventListener('click', showSummary);

showMeets();
