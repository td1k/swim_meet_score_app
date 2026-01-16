use actix_files::Files;
use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder, middleware::Logger};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use chrono::NaiveDate;
use rusqlite::{params, Result as SqlResult};
use tokio_rusqlite::Connection as AsyncConnection;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Team {
    id: Uuid,
    name: String,
    short_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Event {
    name: String,
    is_relay: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Meet {
    id: Uuid,
    title: String,
    date: NaiveDate,
    teams: Vec<Team>,
    lanes: usize,
    lane_team: Vec<Option<Uuid>>,
    exhibition_lanes: Vec<bool>,
    points_individual: Vec<i32>,
    points_relay: Vec<i32>,
    events: Vec<Event>,
    // per-event placements: list of lane numbers in finish order
    results: Vec<Option<ResultsForEvent>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ResultsForEvent {
    placements: Vec<usize>,
    disqualified: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CreateMeetRequest {
    title: String,
    date: String,
    teams: Vec<String>,
    lanes: Option<usize>,
}

type Db = AsyncConnection;

async fn init_db() -> SqlResult<Db> {
    let conn = AsyncConnection::open("./data/swim_meet.db").await?;
    
    // Create tables
    conn.call(|conn| {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS meets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                lanes INTEGER NOT NULL,
                points_individual TEXT NOT NULL,
                points_relay TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                meet_id TEXT NOT NULL,
                name TEXT NOT NULL,
                short_name TEXT NOT NULL,
                FOREIGN KEY (meet_id) REFERENCES meets (id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meet_id TEXT NOT NULL,
                name TEXT NOT NULL,
                is_relay BOOLEAN NOT NULL,
                FOREIGN KEY (meet_id) REFERENCES meets (id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS lane_team (
                meet_id TEXT NOT NULL,
                lane INTEGER NOT NULL,
                team_id TEXT,
                PRIMARY KEY (meet_id, lane),
                FOREIGN KEY (meet_id) REFERENCES meets (id),
                FOREIGN KEY (team_id) REFERENCES teams (id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS exhibition_lanes (
                meet_id TEXT NOT NULL,
                lane INTEGER NOT NULL,
                is_exhibition BOOLEAN NOT NULL,
                PRIMARY KEY (meet_id, lane),
                FOREIGN KEY (meet_id) REFERENCES meets (id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS results (
                meet_id TEXT NOT NULL,
                event_index INTEGER NOT NULL,
                placements TEXT NOT NULL,
                disqualified TEXT NOT NULL,
                PRIMARY KEY (meet_id, event_index),
                FOREIGN KEY (meet_id) REFERENCES meets (id)
            )",
            [],
        )?;

        Ok::<(), rusqlite::Error>(())
    }).await?;
    
    Ok(conn)
}

async fn load_meet(conn: &AsyncConnection, meet_id: &str) -> SqlResult<Option<Meet>> {
    let meet_id_owned = meet_id.to_string();
    let meet_id_for_query = meet_id_owned.clone();
    let meet_data = conn.call(move |conn| {
        let result = conn.query_row(
            "SELECT id, title, date, lanes, points_individual, points_relay FROM meets WHERE id = ?",
            params![meet_id_for_query],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i32>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            }
        );
        
        match result {
            Ok(data) => Ok(Some(data)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }).await?;
    
    if meet_data.is_none() {
        return Ok(None);
    }
    
    let (id_str, title, date_str, lanes, points_individual_str, points_relay_str) = meet_data.unwrap();
    let id = Uuid::parse_str(&id_str).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d").map_err(|_| rusqlite::Error::InvalidQuery)?;
    let points_individual: Vec<i32> = serde_json::from_str(&points_individual_str).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let points_relay: Vec<i32> = serde_json::from_str(&points_relay_str).map_err(|_| rusqlite::Error::InvalidQuery)?;
    
    // Load teams
    let meet_id_clone = meet_id_owned.clone();
    let teams = conn.call(move |conn| {
        let mut stmt = conn.prepare("SELECT id, name, short_name FROM teams WHERE meet_id = ? ORDER BY id")?;
        let teams = stmt.query_map(params![meet_id_clone], |row| {
            Ok(Team {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap(),
                name: row.get(1)?,
                short_name: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok::<Vec<Team>, rusqlite::Error>(teams)
    }).await?;
    
    // Load events
    let meet_id_clone2 = meet_id_owned.clone();
    let events = conn.call(move |conn| {
        let mut stmt = conn.prepare("SELECT name, is_relay FROM events WHERE meet_id = ? ORDER BY id")?;
        let events = stmt.query_map(params![meet_id_clone2], |row| {
            Ok(Event {
                name: row.get(0)?,
                is_relay: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok::<Vec<Event>, rusqlite::Error>(events)
    }).await?;
    
    // Load lane_team
    let meet_id_clone3 = meet_id_owned.clone();
    let lane_team = conn.call(move |conn| {
        let mut stmt = conn.prepare("SELECT lane, team_id FROM lane_team WHERE meet_id = ? ORDER BY lane")?;
        let mut lane_team_map = vec![None; lanes as usize];
        let rows = stmt.query_map(params![meet_id_clone3], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, Option<String>>(1)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        
        for (lane, team_id_opt) in rows {
            let team_id = team_id_opt.and_then(|s| Uuid::parse_str(&s).ok());
            lane_team_map[lane as usize] = team_id;
        }
        Ok::<Vec<Option<Uuid>>, rusqlite::Error>(lane_team_map)
    }).await?;
    
    // Load exhibition_lanes
    let meet_id_clone4 = meet_id_owned.clone();
    let exhibition_lanes = conn.call(move |conn| {
        let mut stmt = conn.prepare("SELECT lane, is_exhibition FROM exhibition_lanes WHERE meet_id = ? ORDER BY lane")?;
        let mut exhibition_map = vec![false; lanes as usize];
        let rows = stmt.query_map(params![meet_id_clone4], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, bool>(1)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        
        for (lane, is_exhibition) in rows {
            exhibition_map[lane as usize] = is_exhibition;
        }
        Ok::<Vec<bool>, rusqlite::Error>(exhibition_map)
    }).await?;
    
    // Load results
    let events_len = events.len();
    let meet_id_clone5 = meet_id_owned.clone();
    let results = conn.call(move |conn| {
        let mut stmt = conn.prepare("SELECT event_index, placements, disqualified FROM results WHERE meet_id = ? ORDER BY event_index")?;
        let mut results_map = vec![None; events_len];
        let rows = stmt.query_map(params![meet_id_clone5], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        
        for (event_index, placements_str, disqualified_str) in rows {
            let placements: Vec<usize> = serde_json::from_str(&placements_str).unwrap_or_default();
            let disqualified: Vec<usize> = serde_json::from_str(&disqualified_str).unwrap_or_default();
            results_map[event_index as usize] = Some(ResultsForEvent { placements, disqualified });
        }
        Ok::<Vec<Option<ResultsForEvent>>, rusqlite::Error>(results_map)
    }).await?;
    
    Ok(Some(Meet {
        id,
        title,
        date,
        teams,
        lanes: lanes as usize,
        lane_team,
        exhibition_lanes,
        points_individual,
        points_relay,
        events,
        results,
    }))
}

#[get("/api/meets")]
async fn list_meets(db: web::Data<Db>) -> impl Responder {
    let meet_ids = db.call(|conn| {
        let mut stmt = conn.prepare("SELECT id FROM meets")?;
        let ids = stmt.query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok::<Vec<String>, rusqlite::Error>(ids)
    }).await.unwrap_or_default();
    
    let mut meets = Vec::new();
    for meet_id in meet_ids {
        if let Ok(Some(meet)) = load_meet(&db, &meet_id).await {
            meets.push(meet);
        }
    }
    
    HttpResponse::Ok().json(meets)
}

#[post("/api/meets")]
async fn create_meet(db: web::Data<Db>, body: web::Json<CreateMeetRequest>) -> impl Responder {
    let req = body.into_inner();
    let date = NaiveDate::parse_from_str(&req.date, "%Y-%m-%d").unwrap_or_else(|_| chrono::Local::now().date_naive());
    let teams: Vec<Team> = req
        .teams
        .into_iter()
        .map(|n| {
            let parts: Vec<&str> = n.split(':').collect();
            let name = parts[0].trim().to_string();
            let short_name = if parts.len() > 1 { parts[1].trim().to_string() } else { name.clone() };
            Team { id: Uuid::new_v4(), name, short_name }
        })
        .collect();
    let lanes = req.lanes.unwrap_or(8);
    let lane_team: Vec<Option<Uuid>> = (0..lanes).map(|i| Some(teams[i % teams.len()].id)).collect();
    let exhibition_lanes = vec![false; lanes];
    let default_ind = vec![8, 6, 5, 4, 3, 2, 1];
    let default_relay = vec![6, 4, 3, 2, 1];
    let default_events = vec![
        Event { name: "200 Medley Relay".into(), is_relay: true },
        Event { name: "200 Free".into(), is_relay: false },
        Event { name: "200 IM".into(), is_relay: false },
        Event { name: "50 Free".into(), is_relay: false },
        Event { name: "100 Butterfly".into(), is_relay: false },
        Event { name: "100 Free".into(), is_relay: false },
        Event { name: "500 Free".into(), is_relay: false },
        Event { name: "200 Free Relay".into(), is_relay: true },
        Event { name: "100 Backstroke".into(), is_relay: false },
        Event { name: "100 Breaststroke".into(), is_relay: false },
        Event { name: "400 Free Relay".into(), is_relay: true },
    ];

    let meet = Meet {
        id: Uuid::new_v4(),
        title: req.title,
        date,
        teams: teams.clone(),
        lanes,
        lane_team: lane_team.clone(),
        exhibition_lanes: exhibition_lanes.clone(),
        points_individual: default_ind.clone(),
        points_relay: default_relay.clone(),
        events: default_events.clone(),
        results: vec![],
    };

    let meet_id = meet.id.to_string();
    let title = meet.title.clone();
    let date_str = meet.date.to_string();
    let lanes = meet.lanes;
    let points_individual_json = serde_json::to_string(&default_ind).unwrap();
    let points_relay_json = serde_json::to_string(&default_relay).unwrap();

    // Insert meet
    let result: Result<(), rusqlite::Error> = db.call(move |conn| {
        conn.execute(
            "INSERT INTO meets (id, title, date, lanes, points_individual, points_relay) VALUES (?, ?, ?, ?, ?, ?)",
            params![meet_id, title, date_str, lanes as i32, points_individual_json, points_relay_json],
        )?;

        // Insert teams
        for team in &teams {
            conn.execute(
                "INSERT INTO teams (id, meet_id, name, short_name) VALUES (?, ?, ?, ?)",
                params![team.id.to_string(), meet_id, team.name, team.short_name],
            )?;
        }

        // Insert events
        for event in &default_events {
            conn.execute(
                "INSERT INTO events (meet_id, name, is_relay) VALUES (?, ?, ?)",
                params![meet_id, event.name, event.is_relay],
            )?;
        }

        // Insert lane_team
        for (lane, team_id_opt) in lane_team.iter().enumerate() {
            let team_id_str: Option<String> = team_id_opt.map(|id| id.to_string());
            conn.execute(
                "INSERT INTO lane_team (meet_id, lane, team_id) VALUES (?, ?, ?)",
                params![meet_id, lane as i32, team_id_str],
            )?;
        }

        // Insert exhibition_lanes
        for (lane, is_exhibition) in exhibition_lanes.iter().enumerate() {
            conn.execute(
                "INSERT INTO exhibition_lanes (meet_id, lane, is_exhibition) VALUES (?, ?, ?)",
                params![meet_id, lane as i32, *is_exhibition],
            )?;
        }

        Ok(())
    }).await;

    match result {
        Ok(_) => HttpResponse::Ok().json(meet),
        Err(_) => HttpResponse::InternalServerError().body("Failed to create meet"),
    }
}

#[get("/api/meets/{id}")]
async fn get_meet(db: web::Data<Db>, path: web::Path<(String,)>) -> impl Responder {
    let id_str = &path.0;
    match load_meet(&db, id_str).await {
        Ok(Some(meet)) => HttpResponse::Ok().json(meet),
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(_) => HttpResponse::InternalServerError().body("Database error"),
    }
}

#[derive(Debug, Deserialize)]
struct UpdateConfig {
    lane_team: Vec<Option<String>>, // UUIDs as strings
    exhibition_lanes: Vec<bool>,
    points_individual: Option<Vec<i32>>,
    points_relay: Option<Vec<i32>>,
}

#[derive(Debug, Deserialize)]
struct SubmitResult {
    event_index: usize,
    placements: Vec<usize>,
    disqualified: Vec<usize>,
}

#[post("/api/meets/{id}/config")]
async fn update_config(db: web::Data<Db>, path: web::Path<(String,)>, body: web::Json<UpdateConfig>) -> impl Responder {
    let meet_id = path.0.clone();
    let req = body.into_inner();
    
    // First check if meet exists and get current data
    let meet_opt = load_meet(&db, &meet_id).await;
    let mut meet = match meet_opt {
        Ok(Some(m)) => m,
        Ok(None) => return HttpResponse::NotFound().finish(),
        Err(_) => return HttpResponse::InternalServerError().body("Database error"),
    };
    
    if req.lane_team.len() != meet.lanes {
        return HttpResponse::BadRequest().body("lane_team length mismatch");
    }
    
    // Update in-memory meet
    let lane_team = req.lane_team.clone();
    let exhibition_lanes = req.exhibition_lanes.clone();
    let points_individual = req.points_individual.clone();
    let points_relay = req.points_relay.clone();
    
    meet.lane_team = req.lane_team.into_iter().map(|s| s.and_then(|s| Uuid::parse_str(&s).ok())).collect();
    meet.exhibition_lanes = req.exhibition_lanes.clone();
    if let Some(pi) = req.points_individual { meet.points_individual = pi.clone(); }
    if let Some(pr) = req.points_relay { meet.points_relay = pr.clone(); }
    
    // Update database
    let result = db.call(move |conn| {
        // Update points if provided
        if let Some(pi) = points_individual {
            let pi_json = serde_json::to_string(&pi).map_err(|_| rusqlite::Error::InvalidQuery)?;
            conn.execute(
                "UPDATE meets SET points_individual = ? WHERE id = ?",
                params![pi_json, meet_id],
            )?;
        }
        if let Some(pr) = points_relay {
            let pr_json = serde_json::to_string(&pr).map_err(|_| rusqlite::Error::InvalidQuery)?;
            conn.execute(
                "UPDATE meets SET points_relay = ? WHERE id = ?",
                params![pr_json, meet_id],
            )?;
        }
        
        // Update lane_team
        for (lane, team_id_opt) in lane_team.iter().enumerate() {
            let team_id_str = team_id_opt.as_ref().map(|s| s.as_str());
            conn.execute(
                "UPDATE lane_team SET team_id = ? WHERE meet_id = ? AND lane = ?",
                params![team_id_str, meet_id, lane as i32],
            )?;
        }
        
        // Update exhibition_lanes
        for (lane, is_exhibition) in exhibition_lanes.iter().enumerate() {
            conn.execute(
                "UPDATE exhibition_lanes SET is_exhibition = ? WHERE meet_id = ? AND lane = ?",
                params![*is_exhibition, meet_id, lane as i32],
            )?;
        }
        
        Ok::<(), rusqlite::Error>(())
    }).await;
    
    match result {
        Ok(_) => HttpResponse::Ok().json(meet),
        Err(_) => HttpResponse::InternalServerError().body("Failed to update config"),
    }
}

#[post("/api/meets/{id}/results")]
async fn submit_result(db: web::Data<Db>, path: web::Path<(String,)>, body: web::Json<SubmitResult>) -> impl Responder {
    let meet_id = path.0.clone();
    let req = body.into_inner();
    
    // Check if meet exists
    let meet_opt = load_meet(&db, &meet_id).await;
    let mut meet = match meet_opt {
        Ok(Some(m)) => m,
        Ok(None) => return HttpResponse::NotFound().finish(),
        Err(_) => return HttpResponse::InternalServerError().body("Database error"),
    };
    
    if req.event_index >= meet.events.len() {
        return HttpResponse::BadRequest().body("invalid event index");
    }
    
    let r = ResultsForEvent { placements: req.placements.clone(), disqualified: req.disqualified.clone() };
    
    // Update in-memory meet
    if meet.results.len() < meet.events.len() {
        meet.results.resize(meet.events.len(), None);
    }
    meet.results[req.event_index] = Some(r.clone());
    
    // Update database
    let placements_json = serde_json::to_string(&req.placements).unwrap();
    let disqualified_json = serde_json::to_string(&req.disqualified).unwrap();
    
    let result = db.call(move |conn| {
        conn.execute(
            "INSERT OR REPLACE INTO results (meet_id, event_index, placements, disqualified) VALUES (?, ?, ?, ?)",
            params![meet_id, req.event_index as i32, placements_json, disqualified_json],
        )?;
        Ok::<(), rusqlite::Error>(())
    }).await;
    
    match result {
        Ok(_) => HttpResponse::Ok().json(r),
        Err(_) => HttpResponse::InternalServerError().body("Failed to submit result"),
    }
}

#[get("/api/meets/{id}/scores")]
async fn get_scores(db: web::Data<Db>, path: web::Path<(String,)>) -> impl Responder {
    let meet_id = &path.0;
    let meet = match load_meet(&db, meet_id).await {
        Ok(Some(m)) => m,
        Ok(None) => return HttpResponse::NotFound().finish(),
        Err(_) => return HttpResponse::InternalServerError().body("Database error"),
    };

    let mut team_scores: HashMap<Uuid, i32> = HashMap::new();
    for t in &meet.teams { team_scores.insert(t.id, 0); }

    let mut per_event_details: Vec<EventDetails> = vec![];

    for (idx, event) in meet.events.iter().enumerate() {
        let mut event_points: HashMap<Uuid, i32> = HashMap::new();
        let mut placements_details: Vec<PlacementDetail> = vec![];
        if let Some(Some(results)) = meet.results.get(idx) {
            let placements = &results.placements;
            let dqs: Vec<usize> = results.disqualified.clone();
            let points = if event.is_relay { &meet.points_relay } else { &meet.points_individual };
            for (place, &lane) in placements.iter().enumerate() {
                if dqs.contains(&lane) { continue; }
                if lane == 0 || lane > meet.lanes { continue; }
                if *meet.exhibition_lanes.get(lane - 1).unwrap_or(&false) { continue; } // skip exhibition
                if let Some(Some(team_id)) = meet.lane_team.get(lane - 1) {
                    let pts = points.get(place).cloned().unwrap_or(0);
                    *event_points.entry(*team_id).or_insert(0) += pts;
                    *team_scores.entry(*team_id).or_insert(0) += pts;
                    placements_details.push(PlacementDetail {
                        place: place + 1,
                        lane,
                        team_id: *team_id,
                        points: pts,
                    });
                }
            }
        }
        per_event_details.push(EventDetails {
            event_name: event.name.clone(),
            is_relay: event.is_relay,
            placements: placements_details,
            points_awarded: event_points,
        });
    }

    #[derive(Serialize)]
    struct ScoresResp {
        team_scores: HashMap<Uuid, i32>,
        per_event: Vec<EventDetails>,
    }

    #[derive(Serialize)]
    struct EventDetails {
        event_name: String,
        is_relay: bool,
        placements: Vec<PlacementDetail>,
        points_awarded: HashMap<Uuid, i32>,
    }

    #[derive(Serialize)]
    struct PlacementDetail {
        place: usize,
        lane: usize,
        team_id: Uuid,
        points: i32,
    }

    let resp = ScoresResp { team_scores, per_event: per_event_details };
    HttpResponse::Ok().json(resp)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    
    // Create data directory if it doesn't exist
    std::fs::create_dir_all("./data")?;
    
    let db = init_db().await.expect("Failed to initialize database");
    let dbdata = web::Data::new(db);

    println!("Starting server on http://127.0.0.1:8080");
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(dbdata.clone())
            .service(list_meets)
            .service(create_meet)
            .service(get_meet)
            .service(update_config)
            .service(submit_result)
            .service(get_scores)
            .service(Files::new("/", "static/").index_file("index.html"))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
