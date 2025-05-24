// Path to your data files (CSVs + SQLite)
// Assumes 'data' folder is one level up from 'dashboard' folder
const csvDataPath = '../data/';

// Path to assets like TopoJSON (if assets folder is directly under dashboard)
const assetsPath = 'assets/';

// Global store for loaded CSV/JSON data
let allData = {};
let dataLoaded = false; // Flag to check if CSV/JSON data has been loaded

// Current period for charts
window.currentPeriod = '1990';   
const allPeriods   = ['1990','1995','2000','2005'];
let lastSelectedFeature = null;
// ============================================================================
// 1) Load the SQLite database via sql.js once at startup
//    (Requires <script src="sql-wasm.js"> in your HTML <head>)
//
//    We’ll use this to pull the “explanation” text for a selected country.
// ============================================================================
const sqlDbPromise = initSqlJs({
  locateFile: file => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/sql-wasm.wasm'
})
.then(SQL =>
  fetch(csvDataPath + 'migration_data.sqlite')
    .then(resp => resp.arrayBuffer())
    .then(buf => new SQL.Database(new Uint8Array(buf)))
);

// ============================================================================
// 2) Load CSV/TopoJSON data & initialize the three visualizations
// ============================================================================
async function loadDataAndInit() {
  if (dataLoaded) {
    console.log("Data already loaded and initialized.");
    return;
  }

  try {
    console.log("Loading CSV + TopoJSON data...");
    const [
      regionsData,
      countriesData,
      regionFlowsData,
      countryFlowsData,
      worldAtlasTopoData
    ] = await Promise.all([
      d3.csv(csvDataPath + 'regions.csv'),
      d3.csv(csvDataPath + 'countries.csv'),
      d3.csv(csvDataPath + 'region_flows.csv'),
      d3.csv(csvDataPath + 'country_flows.csv'),
      d3.json(assetsPath + 'world-110m.json')
    ]);

    // Convert TopoJSON → GeoJSON
    const geoFeatures = topojson.feature(
      worldAtlasTopoData,
      worldAtlasTopoData.objects.countries
    );

    // Parse numeric fields
    regionsData.forEach(d => d.region_id = +d.region_id);
    countriesData.forEach(d => {
      d.country_id = +d.country_id;
      d.region_id  = +d.region_id;
    });
    regionFlowsData.forEach(d => {
      d.from_region_id = +d.from_region_id;
      d.to_region_id   = +d.to_region_id;
      allPeriods.forEach(p => d['flow_' + p] = +d['flow_' + p] || 0);
    });
    countryFlowsData.forEach(d => {
      d.from_country_id = +d.from_country_id;
      d.to_country_id   = +d.to_country_id;
      allPeriods.forEach(p => d['flow_' + p] = +d['flow_' + p] || 0);
    });

    allData = {
      regions:      regionsData,
      countries:    countriesData,
      regionFlows:  regionFlowsData,
      countryFlows: countryFlowsData,
      geoData:      geoFeatures
    };
    dataLoaded = true;
    console.log("Data loaded & parsed.");

    // Initialize D3 visualizations (if those functions exist)
    if (typeof initLineChart      === "function") initLineChart(allData.countryFlows, allData.countries);
    if (typeof initChordDiagram  === "function") initChordDiagram(allData.regionFlows, allData.regions);
    if (typeof initMap           === "function") initMap(allData.countryFlows, allData.countries, allData.geoData);

  } catch (error) {
    console.error("Error loading data:", error);
    document.body.innerHTML = `
      <div style="padding:20px; color:red; font-family:sans-serif;">
        <h1>Initialization Error</h1>
        <p>Check console for details. (${error.message})</p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', loadDataAndInit);

// ============================================================================
// 3) Handle a country click from map_viz.js and update charts + explanation
// ============================================================================
function handleCountrySelection(clickedMapFeature) {
  if (!dataLoaded) {
    console.warn("Data not loaded yet; cannot handle selection.");
    return;
  }
  const mapCountryName       = clickedMapFeature.properties.name;
  const mapCountryIdNumeric  = +clickedMapFeature.id;
  lastSelectedFeature = clickedMapFeature;

  // Match by name (ensure countries.csv has a country_name column)
  const selectedCountry = allData.countries.find(
    c => c.country_name === mapCountryName
  );

  if (!selectedCountry) {
    console.warn(`No match for "${mapCountryName}" in countries.csv.`);
    return;
  }

  console.log("Selected country:", selectedCountry);

  // --- 1) Update Line Chart ---
  if (typeof updateLineChartForCountry === "function") {
    const flows = allData.countryFlows.filter(
      d => d.from_country_id === selectedCountry.country_id
        || d.to_country_id   === selectedCountry.country_id
    );
    updateLineChartForCountry(flows, selectedCountry.country_name, allData.countries);
  }

  // --- 2) (Optional) Update Chord Diagram for this country’s region ---
  // if (typeof updateChordDiagramForRegion === "function") {
  //   updateChordDiagramForRegion(selectedCountry.region_id, allData.regionFlows, allData.regions);
  // }

  // --- 3) Fetch & display the “explanation” from SQLite and show the box ---
  sqlDbPromise
    .then(db => {
      const stmt = db.prepare(
        'SELECT explanation FROM country_explanations WHERE country_name = ?'
      );
      stmt.bind([ selectedCountry.country_name ]);
      let text = 'No explanation available.';
      if (stmt.step()) {
        text = stmt.getAsObject().explanation;
      }
      stmt.free();

      // Show the box
      d3.select('#explanation-box')
        .html(`<strong>${selectedCountry.country_name}</strong><p>${text}</p>`)
        .style('display','block');
    })
    .catch(err => {
      console.error('SQLite error:', err);
    });
}

// --- period buttons wiring ---
    function initPeriodButtons() {
      const container = d3.select('#period-buttons');
      container.selectAll('button')
        .on('click', (event, d) => {
          // set global
          window.currentPeriod = event.currentTarget.dataset.period;
          // highlight active
          container.selectAll('button').classed('active', false);
          d3.select(event.currentTarget).classed('active', true);
          // re-draw chord
          if (typeof initChordDiagram === 'function') {
            initChordDiagram(allData.regionFlows, allData.regions);
          }
          // re-draw map flow for last selected
          if (lastSelectedFeature && typeof drawFlowsForSelectedCountry === 'function') {
            drawFlowsForSelectedCountry(lastSelectedFeature);
          }
        });
      // mark initial
      container.select(`button[data-period="${window.currentPeriod}"]`)
        .classed('active', true);
    }

    // after page loads
    document.addEventListener('DOMContentLoaded', () => {
      initPeriodButtons();
    });
