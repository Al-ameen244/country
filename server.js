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

// MongoDB connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/country_api",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

// Country Schema
const countrySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  capital: String,
  region: String,
  population: { type: Number, required: true },
  currency_code: { type: String, required: true },
  exchange_rate: Number,
  estimated_gdp: Number,
  flag_url: String,
  last_refreshed_at: { type: Date, default: Date.now },
});

const Country = mongoose.model("Country", countrySchema);

// Global status
let globalStatus = {
  total_countries: 0,
  last_refreshed_at: null,
};

// Utility functions
const getRandomMultiplier = () => Math.floor(Math.random() * 1001) + 1000;

const ensureCacheDir = () => {
  const dir = "./cache";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const generateSummaryImage = async (countries) => {
  try {
    ensureCacheDir();

    // Create a new image 800x600
    const image = new Jimp(800, 600, 0xf0f0f0ff);

    // Load font (Jimp comes with basic fonts)
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

    // Title
    image.print(fontBold, 50, 30, "Country GDP Summary");

    // Total countries
    image.print(
      fontSmall,
      50,
      80,
      `Total Countries: ${globalStatus.total_countries}`
    );

    // Last refresh - format timestamp properly
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
      image.print(
        fontSmall,
        70,
        yPos,
        `${index + 1}. ${country.name}: $${gdpInBillions}B`
      );
    });

    // Draw some borders
    image.scan(0, 0, image.bitmap.width, 2, function (x, y, idx) {
      this.bitmap.data.writeUInt32BE(0x333333ff, idx);
    });

    image.scan(0, 140, image.bitmap.width, 2, function (x, y, idx) {
      this.bitmap.data.writeUInt32BE(0x333333ff, idx);
    });

    // Save image
    await image.writeAsync("./cache/summary.png");
    console.log("Summary image generated successfully");
    return true;
  } catch (error) {
    console.error("Error generating summary image:", error);
    throw error;
  }
};

// Routes

// POST /countries/refresh - FIXED
app.post("/countries/refresh", async (req, res) => {
  try {
    console.log("Starting countries refresh...");

    // Clear existing countries first to ensure fresh data
    await Country.deleteMany({});
    console.log("Cleared existing countries");

    // Fetch countries data with better error handling
    let countriesData;
    try {
      const countriesResponse = await axios.get(
        "https://restcountries.com/v3.1/all?fields=name,capital,region,population,flags,currencies",
        {
          timeout: 30000,
        }
      );
      countriesData = countriesResponse.data;
      console.log(`Fetched ${countriesData.length} countries from API`);
    } catch (apiError) {
      console.error("Failed to fetch countries data:", apiError.message);
      // Try fallback API endpoint
      try {
        const fallbackResponse = await axios.get(
          "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies",
          {
            timeout: 30000,
          }
        );
        countriesData = fallbackResponse.data;
        console.log(`Fetched ${countriesData.length} countries from fallback API`);
      } catch (fallbackError) {
        return res.status(503).json({
          error: "External data source unavailable",
          details: "Could not fetch data from external APIs",
        });
      }
    }

    // Fetch exchange rates with better error handling
    let exchangeRates = { USD: 1 }; // Default fallback
    try {
      const exchangeResponse = await axios.get(
        "https://api.exchangerate-api.com/v4/latest/USD",
        {
          timeout: 15000,
        }
      );
      exchangeRates = exchangeResponse.data.rates;
      console.log("Fetched exchange rates successfully");
    } catch (exchangeError) {
      console.warn("Using default exchange rates due to API failure:", exchangeError.message);
      // Continue with default rates
    }

    const countriesToInsert = [];

    for (const countryData of countriesData) {
      try {
        let currencyCode = "USD"; // Default fallback
        let exchangeRate = 1; // Default fallback
        let estimatedGDP = 0;

        // Extract currency code - handle both v3 and v2 API formats
        if (countryData.currencies) {
          const currencyKeys = Object.keys(countryData.currencies);
          if (currencyKeys.length > 0) {
            currencyCode = currencyKeys[0];
            if (exchangeRates[currencyCode]) {
              exchangeRate = exchangeRates[currencyCode];
            }
          }
        }

        // Calculate estimated GDP
        const multiplier = getRandomMultiplier();
        estimatedGDP = (countryData.population * multiplier) / exchangeRate;

        // Handle different API response formats
        const countryName = countryData.name?.common || countryData.name;
        const capital = Array.isArray(countryData.capital) 
          ? countryData.capital[0] 
          : countryData.capital;
        const flagUrl = countryData.flags?.png || countryData.flag;

        const country = new Country({
          name: countryName,
          capital: capital || "Unknown",
          region: countryData.region || "Unknown",
          population: countryData.population || 0,
          currency_code: currencyCode,
          exchange_rate: exchangeRate,
          estimated_gdp: estimatedGDP,
          flag_url: flagUrl || "",
          last_refreshed_at: new Date(),
        });

        countriesToInsert.push(country);
      } catch (countryError) {
        console.warn(`Skipping country due to error:`, countryError.message);
        continue;
      }
    }

    // Insert all countries
    if (countriesToInsert.length > 0) {
      await Country.insertMany(countriesToInsert);
      console.log(`Inserted ${countriesToInsert.length} countries into database`);
    }

    // Update global status
    globalStatus.total_countries = await Country.countDocuments();
    globalStatus.last_refreshed_at = new Date();

    // Generate summary image
    try {
      const allCountries = await Country.find().sort({ estimated_gdp: -1 });
      await generateSummaryImage(allCountries);
    } catch (imageError) {
      console.warn("Failed to generate summary image:", imageError.message);
      // Continue without image generation failure
    }

    res.json({
      message: "Countries refreshed successfully",
      total_countries: globalStatus.total_countries,
      last_refreshed_at: globalStatus.last_refreshed_at,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// GET /countries
app.get("/countries", async (req, res) => {
  try {
    const { region, currency, sort } = req.query;

    let query = {};
    let sortOptions = {};

    // Apply filters
    if (region) {
      query.region = new RegExp(region, "i");
    }

    if (currency) {
      query.currency_code = currency.toUpperCase();
    }

    // Apply sorting
    if (sort === "gdp_desc") {
      sortOptions.estimated_gdp = -1;
    } else if (sort === "gdp_asc") {
      sortOptions.estimated_gdp = 1;
    } else if (sort === "name_asc") {
      sortOptions.name = 1;
    } else if (sort === "name_desc") {
      sortOptions.name = -1;
    } else {
      sortOptions.name = 1; // Default sort
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

    // Update global status
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

// GET /status - FIXED timestamp format
app.get("/status", async (req, res) => {
  try {
    // Ensure counts are up to date
    globalStatus.total_countries = await Country.countDocuments();

    // Ensure last_refreshed_at is in ISO format
    const responseStatus = {
      total_countries: globalStatus.total_countries,
      last_refreshed_at: globalStatus.last_refreshed_at 
        ? new Date(globalStatus.last_refreshed_at).toISOString()
        : null
    };

    res.json(responseStatus);
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// GET /countries/image - FIXED
app.get("/countries/image", async (req, res) => {
  try {
    const imagePath = path.resolve("./cache/summary.png");

    if (!fs.existsSync(imagePath)) {
      // Try to generate the image if it doesn't exist
      try {
        const countries = await Country.find().sort({ estimated_gdp: -1 });
        if (countries.length === 0) {
          return res.status(404).json({
            error: "No countries data available to generate image",
          });
        }
        await generateSummaryImage(countries);
      } catch (generateError) {
        return res.status(404).json({
          error: "Summary image not found and could not be generated",
        });
      }
    }

    // Verify the image exists now
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        error: "Summary image not found",
      });
    }

    // Set appropriate headers and send file
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(imagePath);
  } catch (error) {
    console.error("Image error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// Initialize global status on startup
const initializeStatus = async () => {
  try {
    globalStatus.total_countries = await Country.countDocuments();

    const lastCountry = await Country.findOne().sort({ last_refreshed_at: -1 });
    if (lastCountry && lastCountry.last_refreshed_at) {
      globalStatus.last_refreshed_at = new Date(lastCountry.last_refreshed_at);
    }
  } catch (error) {
    console.error("Status initialization error:", error);
  }
};

// MongoDB connection events
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB successfully");
});

// Handle graceful shutdown
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
