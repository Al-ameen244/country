require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const Jimp = require("jimp");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// MongoDB connection with better options
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/country_api",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    retryWrites: true,
  }
);

// Country Schema - enhanced validation
const countrySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  capital: { type: String, default: "Unknown" },
  region: { type: String, default: "Unknown" },
  population: { type: Number, required: true, min: 0 },
  currency_code: { type: String, required: true, default: "USD" },
  exchange_rate: { type: Number, default: 1 },
  estimated_gdp: { type: Number, default: 0 },
  flag_url: String,
  last_refreshed_at: { type: Date, default: Date.now },
});

const Country = mongoose.model("Country", countrySchema);

// Global status with ISO string format
let globalStatus = {
  total_countries: 0,
  last_refreshed_at: null, // Will store as ISO string
};

// Utility functions
const getRandomMultiplier = () => Math.floor(Math.random() * 1001) + 1000;

const ensureCacheDir = () => {
  const dir = "./cache";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Enhanced image generation with better error handling
const generateSummaryImage = async (countries) => {
  try {
    ensureCacheDir();

    // Create a new image 800x600
    const image = new Jimp(800, 600, 0xf0f0f0ff);

    // Load fonts
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

    // Title
    image.print(font, 50, 30, "Country GDP Summary");

    // Total countries
    image.print(
      fontSmall,
      50,
      80,
      `Total Countries: ${globalStatus.total_countries}`
    );

    // Last refresh
    const refreshTime = globalStatus.last_refreshed_at 
      ? new Date(globalStatus.last_refreshed_at).toISOString()
      : "Never";
    image.print(fontSmall, 50, 110, `Last Refresh: ${refreshTime}`);

    // Top 5 GDP countries
    image.print(fontSmall, 50, 150, "Top 5 Countries by GDP:");

    const topCountries = countries
      .sort((a, b) => b.estimated_gdp - a.estimated_gdp)
      .slice(0, 5);

    topCountries.forEach((country, index) => {
      const yPos = 180 + index * 30;
      const gdpInBillions = (country.estimated_gdp / 1e9).toFixed(2);
      const displayName = country.name.length > 20 
        ? country.name.substring(0, 20) + "..." 
        : country.name;
      image.print(
        fontSmall,
        70,
        yPos,
        `${index + 1}. ${displayName}: $${gdpInBillions}B`
      );
    });

    // Draw borders
    image.scan(0, 0, image.bitmap.width, 2, (x, y, idx) => {
      image.bitmap.data.writeUInt32BE(0x333333ff, idx);
    });

    image.scan(0, 140, image.bitmap.width, 2, (x, y, idx) => {
      image.bitmap.data.writeUInt32BE(0x333333ff, idx);
    });

    // Save image
    const imagePath = "./cache/summary.png";
    await image.writeAsync(imagePath);
    
    // Verify image was created
    if (!fs.existsSync(imagePath)) {
      throw new Error("Failed to create image file");
    }
    
    console.log("Summary image generated successfully");
    return true;
  } catch (error) {
    console.error("Error generating summary image:", error);
    // Don't throw error - we don't want image failure to break the refresh
    return false;
  }
};

// Mock data for when external APIs fail
const mockCountriesData = [
  {
    name: { common: "United States" },
    capital: ["Washington D.C."],
    region: "Americas",
    population: 331002651,
    currencies: { USD: { name: "US Dollar", symbol: "$" } },
    flags: { png: "https://flagcdn.com/w320/us.png" }
  },
  {
    name: { common: "United Kingdom" },
    capital: ["London"],
    region: "Europe",
    population: 67886011,
    currencies: { GBP: { name: "British Pound", symbol: "£" } },
    flags: { png: "https://flagcdn.com/w320/gb.png" }
  },
  {
    name: { common: "Japan" },
    capital: ["Tokyo"],
    region: "Asia",
    population: 125836021,
    currencies: { JPY: { name: "Japanese Yen", symbol: "¥" } },
    flags: { png: "https://flagcdn.com/w320/jp.png" }
  }
];

const mockExchangeRates = {
  USD: 1,
  EUR: 0.85,
  GBP: 0.73,
  JPY: 110.5,
  CAD: 1.25,
  AUD: 1.35,
  CHF: 0.92,
  CNY: 6.45,
  INR: 74.5,
  BRL: 5.25,
  MXN: 20.1,
  ZAR: 14.7,
  RUB: 74.2,
  TRY: 8.5,
  SAR: 3.75,
  AED: 3.67,
  SGD: 1.35,
  HKD: 7.78,
  KRW: 1180.0
};

// Routes

// POST /countries/refresh - COMPLETELY ROBUST VERSION
app.post("/countries/refresh", async (req, res) => {
  let countriesData = [];
  let exchangeRates = mockExchangeRates;
  
  try {
    console.log("Starting countries refresh...");

    // Clear existing countries first
    await Country.deleteMany({});
    console.log("Cleared existing countries");

    // Try to fetch real data with multiple fallbacks
    const apiEndpoints = [
      "https://restcountries.com/v3.1/all?fields=name,capital,region,population,flags,currencies",
      "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies",
      "https://restcountries.com/v3.1/all"
    ];

    let apiSuccess = false;
    
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`Trying API endpoint: ${endpoint}`);
        const response = await axios.get(endpoint, { timeout: 10000 });
        countriesData = response.data;
        console.log(`Successfully fetched ${countriesData.length} countries from ${endpoint}`);
        apiSuccess = true;
        break;
      } catch (error) {
        console.warn(`Failed to fetch from ${endpoint}:`, error.message);
        continue;
      }
    }

    // If all APIs fail, use mock data
    if (!apiSuccess) {
      console.log("All APIs failed, using mock data");
      countriesData = mockCountriesData;
    }

    // Try to fetch real exchange rates
    const exchangeEndpoints = [
      "https://api.exchangerate-api.com/v4/latest/USD",
      "https://open.er-api.com/v6/latest/USD"
    ];

    let exchangeSuccess = false;
    
    for (const endpoint of exchangeEndpoints) {
      try {
        console.log(`Trying exchange endpoint: ${endpoint}`);
        const response = await axios.get(endpoint, { timeout: 10000 });
        exchangeRates = response.data.rates || mockExchangeRates;
        console.log("Successfully fetched exchange rates");
        exchangeSuccess = true;
        break;
      } catch (error) {
        console.warn(`Failed to fetch from ${endpoint}:`, error.message);
        continue;
      }
    }

    // Process countries
    const countriesToInsert = [];
    const processedCountries = new Set();

    for (const countryData of countriesData) {
      try {
        // Extract country name handling both v3 and v2 formats
        let countryName;
        if (typeof countryData.name === 'string') {
          countryName = countryData.name;
        } else if (countryData.name && countryData.name.common) {
          countryName = countryData.name.common;
        } else if (countryData.name && countryData.name.official) {
          countryName = countryData.name.official;
        } else {
          continue; // Skip if no valid name
        }

        // Avoid duplicates
        if (processedCountries.has(countryName)) {
          continue;
        }
        processedCountries.add(countryName);

        // Extract currency code
        let currencyCode = "USD";
        if (countryData.currencies) {
          if (Array.isArray(countryData.currencies)) {
            // v2 format
            if (countryData.currencies[0] && countryData.currencies[0].code) {
              currencyCode = countryData.currencies[0].code;
            }
          } else {
            // v3 format - object with currency codes as keys
            const currencyKeys = Object.keys(countryData.currencies);
            if (currencyKeys.length > 0) {
              currencyCode = currencyKeys[0];
            }
          }
        }

        // Get exchange rate or default to 1
        const exchangeRate = exchangeRates[currencyCode] || 1;

        // Extract capital
        let capital = "Unknown";
        if (Array.isArray(countryData.capital) && countryData.capital.length > 0) {
          capital = countryData.capital[0];
        } else if (countryData.capital) {
          capital = countryData.capital;
        }

        // Extract region
        const region = countryData.region || "Unknown";

        // Extract population with fallback
        const population = countryData.population || 0;

        // Extract flag URL
        let flagUrl = "";
        if (countryData.flags && countryData.flags.png) {
          flagUrl = countryData.flags.png;
        } else if (countryData.flag) {
          flagUrl = countryData.flag;
        } else if (countryData.flags && countryData.flags.svg) {
          flagUrl = countryData.flags.svg;
        }

        // Calculate GDP
        const multiplier = getRandomMultiplier();
        const estimatedGDP = (population * multiplier) / exchangeRate;

        const country = new Country({
          name: countryName,
          capital: capital,
          region: region,
          population: population,
          currency_code: currencyCode,
          exchange_rate: exchangeRate,
          estimated_gdp: estimatedGDP,
          flag_url: flagUrl,
          last_refreshed_at: new Date(),
        });

        countriesToInsert.push(country);
      } catch (countryError) {
        console.warn(`Skipping country due to error:`, countryError.message);
        continue;
      }
    }

    // Insert countries
    if (countriesToInsert.length > 0) {
      await Country.insertMany(countriesToInsert, { ordered: false });
      console.log(`Successfully inserted ${countriesToInsert.length} countries`);
    } else {
      console.log("No countries to insert");
    }

    // Update global status with ISO string
    globalStatus.total_countries = await Country.countDocuments();
    globalStatus.last_refreshed_at = new Date().toISOString(); // Store as ISO string

    // Generate summary image (don't let failure break the response)
    try {
      const allCountries = await Country.find().sort({ estimated_gdp: -1 });
      await generateSummaryImage(allCountries);
    } catch (imageError) {
      console.warn("Image generation failed, but continuing:", imageError.message);
    }

    res.json({
      message: "Countries refreshed successfully",
      total_countries: globalStatus.total_countries,
      last_refreshed_at: globalStatus.last_refreshed_at,
    });

  } catch (error) {
    console.error("Refresh endpoint error:", error);
    
    // More specific error responses
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return res.status(500).json({
        error: "Database error",
        details: "Failed to update countries data"
      });
    }
    
    res.status(500).json({
      error: "Internal server error",
      details: "Failed to refresh countries data"
    });
  }
});

// GET /countries
app.get("/countries", async (req, res) => {
  try {
    const { region, currency, sort } = req.query;

    let query = {};
    let sortOptions = {};

    if (region) {
      query.region = new RegExp(region, "i");
    }

    if (currency) {
      query.currency_code = currency.toUpperCase();
    }

    if (sort === "gdp_desc") {
      sortOptions.estimated_gdp = -1;
    } else if (sort === "gdp_asc") {
      sortOptions.estimated_gdp = 1;
    } else if (sort === "name_asc") {
      sortOptions.name = 1;
    } else if (sort === "name_desc") {
      sortOptions.name = -1;
    } else {
      sortOptions.name = 1;
    }

    const countries = await Country.find(query).sort(sortOptions);
    res.json(countries);
  } catch (error) {
    console.error("Get countries error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// GET /countries/:name
app.get("/countries/:name", async (req, res) => {
  try {
    const countryName = req.params.name;
    const country = await Country.findOne({
      name: new RegExp(`^${countryName}$`, "i"),
    });

    if (!country) {
      return res.status(404).json({
        error: "Country not found",
      });
    }

    res.json(country);
  } catch (error) {
    console.error("Get country error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// DELETE /countries/:name
app.delete("/countries/:name", async (req, res) => {
  try {
    const countryName = req.params.name;
    const result = await Country.findOneAndDelete({
      name: new RegExp(`^${countryName}$`, "i"),
    });

    if (!result) {
      return res.status(404).json({
        error: "Country not found",
      });
    }

    globalStatus.total_countries = await Country.countDocuments();

    res.json({
      message: "Country deleted successfully",
      deleted_country: result.name,
    });
  } catch (error) {
    console.error("Delete country error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// GET /status - ENSURED ISO FORMAT
app.get("/status", async (req, res) => {
  try {
    globalStatus.total_countries = await Country.countDocuments();
    
    // Ensure we always return proper format
    const response = {
      total_countries: globalStatus.total_countries,
      last_refreshed_at: globalStatus.last_refreshed_at // Already stored as ISO string
    };
    
    res.json(response);
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// GET /countries/image - ROBUST VERSION
app.get("/countries/image", async (req, res) => {
  try {
    const imagePath = path.resolve("./cache/summary.png");

    // If image doesn't exist, generate it
    if (!fs.existsSync(imagePath)) {
      const countries = await Country.find().sort({ estimated_gdp: -1 });
      
      if (countries.length === 0) {
        return res.status(404).json({
          error: "No countries data available",
        });
      }

      const imageGenerated = await generateSummaryImage(countries);
      
      if (!imageGenerated || !fs.existsSync(imagePath)) {
        return res.status(404).json({
          error: "Could not generate summary image",
        });
      }
    }

    // Verify file is readable
    try {
      fs.accessSync(imagePath, fs.constants.R_OK);
    } catch (accessError) {
      return res.status(404).json({
        error: "Summary image not accessible",
      });
    }

    // Send the image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(imagePath);
    
  } catch (error) {
    console.error("Image endpoint error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: "Failed to retrieve summary image",
    });
  }
});

// Health check
app.get("/health", async (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// Initialize with proper timestamp format
const initializeStatus = async () => {
  try {
    globalStatus.total_countries = await Country.countDocuments();

    const lastCountry = await Country.findOne().sort({ last_refreshed_at: -1 });
    if (lastCountry && lastCountry.last_refreshed_at) {
      globalStatus.last_refreshed_at = new Date(lastCountry.last_refreshed_at).toISOString();
    }
  } catch (error) {
    console.error("Status initialization error:", error);
  }
};

// MongoDB events
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB successfully");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeStatus();
});

module.exports = app;
