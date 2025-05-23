// dashboard/js/main.js

// Path to your data files (CSVs)
// Assumes 'data' folder is one level up from 'dashboard' folder
const csvDataPath = '../data/';

// Path to assets like TopoJSON (if assets is directly under dashboard)
const assetsPath = 'assets/';

// Global store for loaded data
let allData = {};
let dataLoaded = false; // Flag to check if data has been loaded

window.currentPeriod = '1990';   // default
const allPeriods   = ['1990','1995','2000','2005'];

async function loadDataAndInit() {
    if (dataLoaded) {
        console.log("Data already loaded and initialized.");
        return;
    }
    try {
        console.log("Loading data...");
        const [regionsData, countriesData, regionFlowsData, countryFlowsData, worldAtlasTopoData] = await Promise.all([
            d3.csv(csvDataPath + 'regions.csv'),
            d3.csv(csvDataPath + 'countries.csv'),
            d3.csv(csvDataPath + 'region_flows.csv'),
            d3.csv(csvDataPath + 'country_flows.csv'),
            d3.json(assetsPath + 'world-110m.json') // Load the TopoJSON file
        ]);

        // --- Convert TopoJSON to GeoJSON ---
        // The world-110m.json file contains multiple "objects" (like countries, land).
        // We need to extract the 'countries' object and convert it.
        // Note: The features in the converted GeoJSON will have an 'id' property (numeric ISO code as a string)
        // and a 'properties.name' property for the country name.
        const geoFeatures = topojson.feature(worldAtlasTopoData, worldAtlasTopoData.objects.countries);
        // geoFeatures is now a GeoJSON FeatureCollection object.

        console.log("TopoJSON converted to GeoJSON. First feature:", geoFeatures.features[0]);


        // --- Parse numbers from CSV strings ---
        regionsData.forEach(d => {
            d.region_id = +d.region_id;
        });

        countriesData.forEach(d => {
            d.country_id = +d.country_id;
            d.region_id = +d.region_id; // Assuming region_id is already in countries.csv
            // If your countries.csv has an ISO numeric code column, make sure it's parsed as number if needed for matching
            // e.g., if you have 'iso_numeric': d.iso_numeric = +d.iso_numeric;
        });

        regionFlowsData.forEach(d => {
            d.from_region_id = +d.from_region_id;
            d.to_region_id = +d.to_region_id;
            d.flow_1990 = +d.flow_1990 || 0; // Default to 0 if parsing fails or empty
            d.flow_1995 = +d.flow_1995 || 0;
            d.flow_2000 = +d.flow_2000 || 0;
            d.flow_2005 = +d.flow_2005 || 0;
        });

        countryFlowsData.forEach(d => {
            d.from_country_id = +d.from_country_id;
            d.to_country_id = +d.to_country_id;
            d.flow_1990 = +d.flow_1990 || 0;
            d.flow_1995 = +d.flow_1995 || 0;
            d.flow_2000 = +d.flow_2000 || 0;
            d.flow_2005 = +d.flow_2005 || 0;
        });

        allData = {
            regions: regionsData,
            countries: countriesData,
            regionFlows: regionFlowsData,
            countryFlows: countryFlowsData,
            geoData: geoFeatures // Store the converted GeoJSON FeatureCollection
        };
        dataLoaded = true;
        console.log("Data loaded, TopoJSON converted, and CSVs parsed successfully.");
        // console.log("Sample allData:", {
        //     regions: allData.regions.slice(0,2),
        //     countries: allData.countries.slice(0,2),
        //     regionFlows: allData.regionFlows.slice(0,2),
        //     countryFlows: allData.countryFlows.slice(0,2),
        //     geoDataFeatures: allData.geoData.features.slice(0,2)
        // });


        // Initialize your visualizations
        // Check if the functions exist before calling (good practice if scripts load async or have errors)
        if (typeof initLineChart === "function") initLineChart(allData.countryFlows, allData.countries);
        if (typeof initChordDiagram === "function") initChordDiagram(allData.regionFlows, allData.regions);
        if (typeof initMap === "function") initMap(allData.countryFlows, allData.countries, allData.geoData);

    } catch (error) {
        console.error("Error during data loading or initialization:", error);
        const bodyElement = document.querySelector('body');
        if (bodyElement) {
            bodyElement.innerHTML = `<div style="padding: 20px; text-align: center; color: red; font-family: sans-serif;">
                                        <h1>Dashboard Initialization Error</h1>
                                        <p>Could not load or process the required data files. Please check the browser's developer console (F12) for specific error messages.</p>
                                        <p>Common issues:</p>
                                        <ul>
                                            <li>Data files not found at expected paths ('${csvDataPath}', '${assetsPath}').</li>
                                            <li>TopoJSON file ('world-110m.json') missing or corrupted.</li>
                                            <li>CSV files have unexpected formatting.</li>
                                        </ul>
                                        <p><strong>Error details:</strong> ${error.message}</p>
                                       </div>`;
        }
    }
}

// Call the main data loading function when the DOM is ready
document.addEventListener('DOMContentLoaded', loadDataAndInit);

// --- Inter-chart Communication ---
// This function will be called by map_viz.js when a country is clicked
// `clickedMapFeature` is the D3 data object危机 for the clicked map path (contains 'id' and 'properties.name')
function handleCountrySelection(clickedMapFeature) {
    if (!dataLoaded) {
        console.warn("Data not loaded yet, cannot handle country selection.");
        return;
    }
    console.log("Country selected on map (feature object):", clickedMapFeature);

    const mapCountryName = clickedMapFeature.properties.name;
    const mapCountryIdNumericStr = clickedMapFeature.id; // This is the ISO 3166-1 numeric code as a string (e.g., "840" for USA)

    // --- Find the corresponding country in your countries.csv data ---
    // This is a CRITICAL step and depends on your countries.csv structure.
    // OPTION 1: If your countries.csv has an 'iso_numeric' column (matching map's 'id')
    // const selectedCountry = allData.countries.find(c => c.iso_numeric === +mapCountryIdNumericStr); // Ensure c.iso_numeric is a number

    // OPTION 2: If matching by name (less reliable due to variations)
    const selectedCountry = allData.countries.find(c => c.country_name === mapCountryName);

    // OPTION 3: If your countries.csv has 'iso_a3' and you can map 'id' to 'iso_a3' (more complex)

    if (selectedCountry) {
        console.log("Matched country from CSV data:", selectedCountry);
        const countryIdForFlows = selectedCountry.country_id; // The ID used in your *Flows.csv files

        // 1. Update Line Chart
        if (typeof updateLineChartForCountry === "function") {
            const relatedCountryFlows = allData.countryFlows.filter(
                d => d.from_country_id === countryIdForFlows || d.to_country_id === countryIdForFlows
            );
            updateLineChartForCountry(relatedCountryFlows, selectedCountry.country_name, allData.countries);
        }

        // 2. Update Chord Diagram (Optional - more complex)
        // Example: filter region flows based on the selected country's region
        // if (typeof updateChordDiagramForRegion === "function" && selectedCountry.region_id) {
        //     updateChordDiagramForRegion(selectedCountry.region_id, allData.regionFlows, allData.regions);
        // }

        // 3. Map might have already highlighted, or you can trigger more specific updates here.
        // (e.g., if map_viz.js only highlights, and main.js tells it to draw flow lines)

    } else {
        console.warn(`Could not find matching country in 'countries.csv' for map selection: Name='${mapCountryName}', MapID='${mapCountryIdNumericStr}'. Check your matching logic and data.`);
        // Optionally, reset other charts to a default state
        if (typeof initLineChart === "function") initLineChart(allData.countryFlows, allData.countries); // Re-init with all data
    }
}
