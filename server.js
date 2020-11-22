'use strict';

// Load Environment Variables from the .env file
require('dotenv').config();

// Dependencies
const express = require('express');
const superagent = require('superagent');
const pg = require('pg');
const cors = require('cors');

// Postgres client setup
const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Application setup
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());

// API routes
app.get('/', getIndex);
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.use('*', catchAll);

// Handler function for the GET /location route
// Returns an object containing city information from the database
function getLocation(request, response) {
    const city = request.query.city;
    const sql = `SELECT * FROM locations WHERE search_query=$1`;

    client
        .query(sql, [city])
        .then(result => result.rowCount ? response.status(200).json(result.rows[0]) : searchLocation(request, response))
        .catch(error => handleInternalError(error));
}

// Search for a city not in the database
// Returns an object containing city information from LocationIQ API
function searchLocation(request, response) {
    const city = request.query.city;
    const url = 'https://us1.locationiq.com/v1/search.php';
    const parameters = {
        key: process.env.GEOCODE_API_KEY,
        q: city,
        format: 'json',
        limit: 1
    };

    superagent
        .get(url)
        .query(parameters)
        .then(data => {
            const geoData = data.body[0];
            const location = new Location(city, geoData);
            saveLocation(location);
            response.status(200).send(location);
        })
        .catch(error => handleInternalError(error));
}

// Saves the new city infromation to the database
function saveLocation(location) {
    const sql = 'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4);';
    const value = [location.search_query, location.formatted_query, location.latitude, location.longitude];
    
    client
        .query(sql, value)
        .catch(error => handleInternalError(error));
}

// A constructor function that converts the search query to a latitude and longitude
function Location(city, geoData) {
    this.search_query = city;
    this.formatted_query = geoData.display_name;
    this.lat = geoData.lat;
    this.lon = geoData.lon;
}

// Handler function for the GET /weather route
// Return an array of objects for each day of the response which contains the necessary information for correct client rendering
function getWeather(request, response) {
    const city = request.query;
    const url = 'https://api.weatherbit.io/v2.0/forecast/daily';
    const parameters = {
        key: process.env.WEATHER_API_KEY,
        lat: city.lat,
        lon: city.lon
    };

    superagent
        .get(url)
        .query(parameters)
        .then(data => {
            const weatherData = data.body.data;
            const forecast = weatherData.map(weather => new Weather(weather)); 
            response.status(200).send(forecast);
        })
        .catch(error => handleInternalError(error));
}

// A constructor function that converts an object to a weather object
function Weather(obj) {
    this.forecast = obj.weather.description;
    this.time = this.formattedDate(obj.valid_date);
}

// A prototype that converts time into a date
Weather.prototype.formattedDate = function(valid_date) {
    let date = new Date(valid_date);
    return date.toDateString();
}

// Handler function for the GET / route
function getIndex(request, response) {
    response.status(200).send('Pair this backend with: https://codefellows.github.io/code-301-guide/curriculum/city-explorer-app/front-end');
}

// Handler function for internal errors
function handleInternalError(error) {
    console.log('ERROR', error);
    response.status(500).send('Sorry, something went wrong');
}

// Handler function for all other errors
function catchAll(request, response) {
    response.status(404).send('404 Not Found D:');
}

// Connect to Postgres then start the server
client
    .connect()
    .then(() => app.listen(PORT, () => console.log(`Endpoint: http://localhost:${PORT}`)))
    .catch(error => handleInternalError(error));
