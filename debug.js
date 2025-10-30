require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");

async function debugIssues() {
  console.log("\n🔍 Starting Debug Process...\n");

  // Test 1: Environment Variables
  console.log("1️⃣ Checking Environment Variables:");
  console.log("   PORT:", process.env.PORT || "3000 (default)");
  console.log(
    "   MONGODB_URI:",
    process.env.MONGODB_URI ? "✅ Set" : "❌ Not set"
  );

  if (!process.env.MONGODB_URI) {
    console.log("\n❌ MONGODB_URI is not set in .env file!");
    console.log("   Create a .env file with:");
    console.log("   MONGODB_URI=mongodb://localhost:27017/countries_db");
    return;
  }

  // Test 2: MongoDB Connection
  console.log("\n2️⃣ Testing MongoDB Connection:");
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("   ✅ MongoDB connected successfully");
  } catch (error) {
    console.log("   ❌ MongoDB connection failed:", error.message);
    return;
  }

  // Test 3: Check Dependencies
  console.log("\n3️⃣ Checking Dependencies:");
  try {
    require("express");
    console.log("   ✅ express installed");
  } catch (e) {
    console.log("   ❌ express not installed - run: npm install express");
  }

  try {
    require("mongoose");
    console.log("   ✅ mongoose installed");
  } catch (e) {
    console.log("   ❌ mongoose not installed - run: npm install mongoose");
  }

  try {
    require("axios");
    console.log("   ✅ axios installed");
  } catch (e) {
    console.log("   ❌ axios not installed - run: npm install axios");
  }

  try {
    require("jimp");
    console.log("   ✅ jimp installed");
  } catch (e) {
    console.log("   ❌ jimp not installed - run: npm install jimp");
  }

  // Test 4: External APIs
  console.log("\n4️⃣ Testing External APIs:");

  try {
    console.log("   Testing REST Countries API...");
    const countriesResponse = await axios.get(
      "https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies",
      { timeout: 10000 }
    );
    console.log(
      `   ✅ REST Countries API - ${countriesResponse.data.length} countries fetched`
    );
  } catch (error) {
    console.log("   ❌ REST Countries API failed:", error.message);
  }

  try {
    console.log("   Testing Exchange Rates API...");
    const ratesResponse = await axios.get(
      "https://open.er-api.com/v6/latest/USD",
      { timeout: 10000 }
    );
    console.log(
      `   ✅ Exchange Rates API - ${
        Object.keys(ratesResponse.data.rates).length
      } currencies fetched`
    );
  } catch (error) {
    console.log("   ❌ Exchange Rates API failed:", error.message);
  }

  // Test 5: Database Operations
  console.log("\n5️⃣ Testing Database Operations:");

  try {
    // Create a test document
    const TestSchema = new mongoose.Schema({ name: String, test: Boolean });
    const TestModel = mongoose.model("Test", TestSchema);

    await TestModel.create({ name: "test", test: true });
    console.log("   ✅ Can write to database");

    const result = await TestModel.findOne({ name: "test" });
    console.log("   ✅ Can read from database");

    await TestModel.deleteOne({ name: "test" });
    console.log("   ✅ Can delete from database");
  } catch (error) {
    console.log("   ❌ Database operations failed:", error.message);
  }

  console.log("\n✅ Debug complete!\n");

  await mongoose.connection.close();
}

debugIssues().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
