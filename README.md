# swim_meet_score_app

This is an experiment in AI coding. 

the plan is to write a set of requirements and see how well the AI agent does in generating code that meets those requirements.


## System Requirements

This is a swim meet scoring application. It will be used to keep track of the scores of a high school swim meet. It needs to be optimized to make data entry after a race easy. It should also
provide a summary page (webpage) that could be used as a score board showing the current score.

1. This application shall be written in rust and served as a webpage for remote viewing. 
2. There should be a page that allows the operator to select the available meets. 
3. There needs to be an option to create a new meet. A
   a. The new meet should include the title and date and a list of the teams at the meet. 
4. Each meet needs some configuration. 
    a. The number of lanes needs to be configurable, and the default should be 8.
    b. The teams for the meet need to be configured also. 
    c. when there are multiple teams, the meet should be scored as a dual meet between each 
      pair of teams
    d. Each lane needs to be assigned to a team. 
    e. The points for first, second, third, etc needs to be configurable for each type of event. 
        The default points for an individual event are 8, 6, 5, 4, 3, 2, 1. For a relay event, the
        default points are 6, 4, 3, 2, 1
    f. There are 2 types of events in the meet: individual and relay.
    g. The list of events also needs to be customizable. The default should be:
        1. 200 Medley Relay
        2. 200 Free
        3. 200 IM 
        4. 50 Free
        5. 100 Butterfly
        6. 100 Free
        7. 500 Free
        8. 200 Free Relay
        9. 100 Backstroke
        10. 100 Breaststroke
        11. 400 Free Relay
5. After the configuration page, there should be a race results entry page. This page should provide
   a grid where each event is a row and the operator enters the lane number in oder of finish. For example, if lane 4 finished first and lane 7 finished second, the results would be entered as: [4, 7, ....].
    a. The race results page rows should match the configured events in order. 
    b. There needs to be an option to disqualify a lane during each event. When disqualified, that lane is taken out of the results and doesn't score points. 
6. There should also be a "Details" screen that shows the details about how many points each team 
    got in each race. 
    a. As the race result are entered, the deatils page should update the scoring. 
7. There should also be a "Summary" page which shows the current scores for the teams and a 
    summary of the points earned for the last race. It should also say which event is up next. 


## Running with Docker

To run the application using Docker:

```bash
docker run -p 8080:8080 your-docker-username/swim-meet-score-app:latest
```

The application will be available at http://localhost:8080.

## Development

To run locally:

```bash
cargo run
```

## CI/CD

The project uses GitHub Actions for CI/CD. On every push to the `main` branch, the code is built into a Docker image and pushed to Docker Hub.

To set up CI/CD:
1. Set up secrets in your GitHub repository:
   - `DOCKER_USERNAME`: Your Docker Hub username
   - `DOCKER_PASSWORD`: Your Docker Hub password or access token
2. Update the image tag in `.github/workflows/build.yml` to match your Docker Hub username


## Refernce:
The following document provides some detail on the events and the way meets are scored. 
