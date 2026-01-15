use actix_files::Files;
use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder, middleware::Logger};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::NaiveDate;

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

type Db = Mutex<HashMap<Uuid, Meet>>;

#[get("/api/meets")]
async fn list_meets(db: web::Data<Db>) -> impl Responder {
    let map = db.lock().unwrap();
    let meets: Vec<_> = map.values().cloned().collect();
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
    let lane_team = (0..lanes).map(|i| Some(teams[i % teams.len()].id)).collect();
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
        teams,
        lanes,
        lane_team,
        exhibition_lanes,
        points_individual: default_ind,
        points_relay: default_relay,
        events: default_events,
        results: vec![],
    };

    let mut map = db.lock().unwrap();
    map.insert(meet.id, meet.clone());
    HttpResponse::Ok().json(meet)
}

#[get("/api/meets/{id}")]
async fn get_meet(db: web::Data<Db>, path: web::Path<(String,)>) -> impl Responder {
    let id = Uuid::parse_str(&path.0).ok();
    if id.is_none() { return HttpResponse::BadRequest().body("invalid id"); }
    let map = db.lock().unwrap();
    if let Some(meet) = map.get(&id.unwrap()) {
        HttpResponse::Ok().json(meet)
    } else {
        HttpResponse::NotFound().finish()
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
    let id = match Uuid::parse_str(&path.0) { Ok(u) => u, Err(_) => return HttpResponse::BadRequest().body("invalid id") };
    let mut map = db.lock().unwrap();
    let meet = match map.get_mut(&id) { Some(m) => m, None => return HttpResponse::NotFound().finish() };
    let req = body.into_inner();
    if req.lane_team.len() != meet.lanes {
        return HttpResponse::BadRequest().body("lane_team length mismatch");
    }
    meet.lane_team = req.lane_team.into_iter().map(|s| s.and_then(|s| Uuid::parse_str(&s).ok())).collect();
    meet.exhibition_lanes = req.exhibition_lanes;
    if let Some(pi) = req.points_individual { meet.points_individual = pi; }
    if let Some(pr) = req.points_relay { meet.points_relay = pr; }
    HttpResponse::Ok().json(meet)
}

#[post("/api/meets/{id}/results")]
async fn submit_result(db: web::Data<Db>, path: web::Path<(String,)>, body: web::Json<SubmitResult>) -> impl Responder {
    let id = match Uuid::parse_str(&path.0) { Ok(u) => u, Err(_) => return HttpResponse::BadRequest().body("invalid id") };
    let mut map = db.lock().unwrap();
    let meet = match map.get_mut(&id) { Some(m) => m, None => return HttpResponse::NotFound().finish() };
    let req = body.into_inner();
    if req.event_index >= meet.events.len() {
        return HttpResponse::BadRequest().body("invalid event index");
    }
    let r = ResultsForEvent { placements: req.placements, disqualified: req.disqualified };
    // ensure results vector length
    if meet.results.len() < meet.events.len() {
        meet.results.resize(meet.events.len(), None);
    }
    meet.results[req.event_index] = Some(r.clone());
    HttpResponse::Ok().json(r)
}

#[get("/api/meets/{id}/scores")]
async fn get_scores(db: web::Data<Db>, path: web::Path<(String,)>) -> impl Responder {
    let id = match Uuid::parse_str(&path.0) { Ok(u) => u, Err(_) => return HttpResponse::BadRequest().body("invalid id") };
    let map = db.lock().unwrap();
    let meet = match map.get(&id) { Some(m) => m, None => return HttpResponse::NotFound().finish() };

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
    let db: Db = Mutex::new(HashMap::new());
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
