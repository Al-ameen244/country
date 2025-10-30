# Country Currency & Exchange API

A RESTful API that fetches country data from external sources, processes exchange rates, and provides CRUD operations with caching.

## Features

- 🌍 Fetch and cache country data from REST Countries API
- 💱 Real-time exchange rate integration
- 📊 Automatic GDP estimation calculations
- 🖼️ Summary image generation with top countries
- 🔄 Full CRUD operations
- 🎯 Filtering and sorting capabilities
- ⚡ MySQL database for persistent storage

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL
- **External APIs**:
  - [REST Countries](https://restcountries.com)
  - [Open Exchange Rates](https://open.er-api.com)

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

## Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd country-currency-api
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up MySQL database**
```bash
mysql -u root -p
CREATE DATABASE countries_db;
exit;
```

4. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=countries_db
```

5. **Start the server**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### 1. Refresh Countries Data
**POST** `/countries/refresh`

Fetches fresh data from external APIs and updates the database.

**Response:**
```json
{
  "message": "Countries data refreshed successfully",
  "total_countries": 250,
  "last_refreshed_at": "2025-10-22T18:00:00.000Z"
}
```

### 2. Get All Countries
**GET** `/countries`

**Query Parameters:**
- `region` - Filter by region (e.g., `Africa`, `Europe`)
- `currency` - Filter by currency code (e.g., `NGN`, `USD`)
- `sort` - Sort results:
  - `gdp_desc` - Highest GDP first
  - `gdp_asc` - Lowest GDP first
  - `population_desc` - Most populous first
  - `population_asc` - Least populous first

**Examples:**
```bash
GET /countries?region=Africa
GET /countries?currency=NGN
GET /countries?sort=gdp_desc
GET /countries?region=Europe&sort=population_desc
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Nigeria",
    "capital": "Abuja",
    "region": "Africa",
    "population": 206139589,
    "currency_code": "NGN",
    "exchange_rate": 1600.23,
    "estimated_gdp": 25767448125.2,
    "flag_url": "https://flagcdn.com/ng.svg",
    "last_refreshed_at": "2025-10-22T18:00:00Z"
  }
]
```

### 3. Get Country by Name
**GET** `/countries/:name`

**Example:**
```bash
GET /countries/Nigeria
```

### 4. Delete Country
**DELETE** `/countries/:name`

**Response:**
```json
{
  "message": "Country deleted successfully"
}
```

### 5. Get Status
**GET** `/status`

**Response:**
```json
{
  "total_countries": 250,
  "last_refreshed_at": "2025-10-22T18:00:00.000Z"
}
```

### 6. Get Summary Image
**GET** `/countries/image`

Returns a PNG image with:
- Total number of countries
- Top 5 countries by estimated GDP
- Last refresh timestamp

## Database Schema

```sql
CREATE TABLE countries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  capital VARCHAR(255),
  region VARCHAR(255),
  population BIGINT NOT NULL,
  currency_code VARCHAR(10),
  exchange_rate DECIMAL(20, 6),
  estimated_gdp DECIMAL(30, 2),
  flag_url TEXT,
  last_refreshed_at DATETIME,
  INDEX idx_region (region),
  INDEX idx_currency (currency_code)
);

CREATE TABLE refresh_metadata (
  id INT PRIMARY KEY DEFAULT 1,
  last_refreshed_at DATETIME,
  total_countries INT DEFAULT 0,
  CHECK (id = 1)
);
```

## Error Handling

The API returns consistent JSON error responses:

- **404 Not Found**
```json
{
  "error": "Country not found"
}
```

- **400 Bad Request**
```json
{
  "error": "Validation failed",
  "details": {
    "currency_code": "is required"
  }
}
```

- **503 Service Unavailable**
```json
{
  "error": "External data source unavailable",
  "details": "Could not fetch data from restcountries.com"
}
```

- **500 Internal Server Error**
```json
{
  "error": "Internal server error"
}
```

## Data Processing Logic

### Currency Handling
- If a country has multiple currencies, only the first is stored
- If no currencies exist: `currency_code`, `exchange_rate` = null, `estimated_gdp` = 0
- If currency not found in exchange rates: `exchange_rate` and `estimated_gdp` = null

### GDP Calculation
```
estimated_gdp = (population × random(1000-2000)) ÷ exchange_rate
```
A new random multiplier is generated on each refresh.

### Update Logic
- Countries are matched by name (case-insensitive)
- Existing records are updated with fresh data
- New countries are inserted

## Testing the API

```bash
# 1. Refresh the data
curl -X POST http://localhost:3000/countries/refresh

# 2. Get all African countries
curl http://localhost:3000/countries?region=Africa

# 3. Get countries with NGN currency
curl http://localhost:3000/countries?currency=NGN

# 4. Get top countries by GDP
curl http://localhost:3000/countries?sort=gdp_desc

# 5. Get specific country
curl http://localhost:3000/countries/Nigeria

# 6. Get status
curl http://localhost:3000/status

# 7. Download summary image
curl http://localhost:3000/countries/image --output summary.png

# 8. Delete a country
curl -X DELETE http://localhost:3000/countries/TestCountry
```

## Deployment

### Hosting Options
- Railway
- Heroku
- AWS (EC2, Elastic Beanstalk)
- DigitalOcean App Platform
- Fly.io

### Deployment Steps (Railway Example)

1. Push your code to GitHub
2. Connect Railway to your repository
3. Add environment variables in Railway dashboard
4. Deploy automatically

### Important Notes
- Ensure your MySQL database is accessible from your hosting platform
- Set all environment variables in your hosting dashboard
- Test the `/countries/refresh` endpoint first after deployment

## Project Structure

```
country-currency-api/
├── server.js           # Main application file
├── package.json        # Dependencies and scripts
├── .env               # Environment variables (not committed)
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules
├── README.md          # Documentation
└── cache/            # Generated images (created automatically)
    └── summary.png
```

## Dependencies

- **express**: Web framework
- **mysql2**: MySQL client with promise support
- **axios**: HTTP client for external APIs
- **canvas**: Image generation
- **dotenv**: Environment variable management

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.