// dashboard/js/map_viz.js

let mapSvg, mapProjection, mapPathGenerator, mapTooltip;
let mapGeoDataCache, mapCountryDataCache, mapFlowDataCache, mapRegionFlowDataCache;
let selectedRegion = null; // Track currently selected region
let selectedCountry = null; // Track currently selected country

// Add color scale to match chord diagram
const regionColorScale = d3.scaleOrdinal(d3.schemeCategory10);

// Country name mapping for variations
const countryNameMapping = {
  'W. Sahara': 'Western Sahara',               // ESH
  'United States of America': 'United States', // USA
  'Dem. Rep. Congo': 'DR Congo',                // COD
  'Dominican Rep.': 'Dominican Republic',       // DOM
  'Falkland Is.': 'Falkland Islands',           // Not in CSV, may need special handling or skip
  'Greenland': 'Greenland',                      // Not in CSV, may need special handling or skip
  'Fr. S. Antarctic Lands': 'French Southern Antarctic Lands', // Not in CSV, skip or special
  "Côte d'Ivoire": 'Ivory Coast',                // CIV
  'Central African Rep.': 'Central African Republic', // CAF
  'Eq. Guinea': 'Equatorial Guinea',             // GNQ
  'eSwatini': 'Swaziland',                        // SWZ (Swaziland renamed eSwatini)
  'Solomon Is.': 'Solomon Islands',              // SLB
  'Taiwan': 'Taiwan',                             // Not in CSV, skip or add custom
  'Czechia': 'Czech Republic',                    // CZE
  'Antarctica': 'Antarctica',                     // Not in CSV, skip or add custom
  'N. Cyprus': 'Cyprus',                          // CYP (Northern Cyprus not recognized separately)
  'Somaliland': 'Somaliland',                     // Not in CSV, skip or add custom
  'Bosnia and Herz.': 'Bosnia & Herzegovina',    // BIH
  'Kosovo': 'Kosovo',                             // Not in CSV, skip or add custom
  'Trinidad and Tobago': 'Trinidad & Tobago',    // TTO
  'S. Sudan': 'South Sudan'                       // SSD
};



function getCountryData(geoFeature) {
    if (!geoFeature || !geoFeature.properties || !geoFeature.properties.name) return null;
    
    // Try direct match first
    let country = mapCountryDataCache.find(c => c.country_name === geoFeature.properties.name);
    
    // If no match, try mapped name
    if (!country && countryNameMapping[geoFeature.properties.name]) {
        country = mapCountryDataCache.find(c => c.country_name === countryNameMapping[geoFeature.properties.name]);
    }
    return country;
}

function initMap(countryFlows, countries, geoData) {
    mapFlowDataCache = countryFlows;
    mapCountryDataCache = countries;
    mapGeoDataCache = geoData;
    // Get region flows from allData (global variable)
    mapRegionFlowDataCache = allData.regionFlows;

    // Debug logging to identify unmapped countries
    const unmappedCountries = geoData.features
        .filter(f => !getCountryData(f))
        .map(f => f.properties.name);
    console.log("Unmapped countries:", unmappedCountries);

    const container = d3.select("#map-visualization");
    if (container.empty()) {
        console.error("#map-visualization container not found");
        return;
    }
    container.selectAll("*").remove();

    if (mapTooltip && typeof mapTooltip.remove === 'function') {
        mapTooltip.remove(); // Remove any existing tooltip managed by this script
    }
    mapTooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0); // Start hidden

    const BBox = container.node().getBoundingClientRect();
    const width = BBox.width;
    const height = BBox.height;

    mapSvg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .style("background-color", "#aed9e0");

    // Add click handler for ocean (background)
    mapSvg.on("click", function(event) {
        // Check if click was on the background (ocean)
        if (event.target === this) {
            handleOceanClick();
        }
    });

    mapProjection = d3.geoNaturalEarth1()
        .scale(1)
        .translate([0, 0]);

    const tempPath = d3.geoPath().projection(mapProjection);
    const bounds = tempPath.bounds(geoData);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = 0.9 * Math.min(width / dx, height / dy);
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    mapProjection.scale(scale).translate(translate);
    mapPathGenerator = d3.geoPath().projection(mapProjection);

    // Add graticule
    const graticule = d3.geoGraticule10();
    mapSvg.append("path")
        .datum(graticule)
        .attr("class", "graticule")
        .attr("d", mapPathGenerator)
        .style("fill", "none")
        .style("stroke", "#c0d9e0")
        .style("stroke-width", 0.5);

    // Get unique region IDs and sort them
    const uniqueRegionIds = [...new Set(mapCountryDataCache.map(c => c.region_id))].sort((a, b) => a - b);
    
    // Set up color scale domain
    regionColorScale.domain(uniqueRegionIds);

    // Group for regions
    const regionsGroup = mapSvg.append("g")
        .attr("class", "regions");

    // Group for countries
    const countriesGroup = mapSvg.append("g")
        .attr("class", "countries");

    // Draw countries with initial neutral state
    countriesGroup.selectAll("path.country-shape")
        .data(geoData.features, d => d.id)
        .join("path")
        .attr("d", mapPathGenerator)
        .attr("fill", "#f0e6d2")
        .attr("stroke", "#786a59")
        .attr("stroke-width", 0.5)
        .attr("class", "country-shape")
        .style("pointer-events", "none")
        .on("mouseover", handleCountryHover)
        .on("mouseout", handleCountryMouseOut)
        .on("click", handleCountryClick);

    // Create regions by grouping countries
    const regionGroups = {};
    mapCountryDataCache.forEach(country => {
        if (!regionGroups[country.region_id]) {
            regionGroups[country.region_id] = [];
        }
        // Find matching GeoJSON feature using the mapping function
        const geoFeature = geoData.features.find(f => {
            const mappedCountry = getCountryData(f);
            return mappedCountry && mappedCountry.country_id === country.country_id;
        });
        if (geoFeature) {
            regionGroups[country.region_id].push(geoFeature);
        }
    });

    // Draw region overlays
    Object.entries(regionGroups).forEach(([regionId, features]) => {
        const regionFeature = {
            type: "FeatureCollection",
            features: features
        };

        const regionColor = regionColorScale(+regionId);

        regionsGroup.append("path")
            .datum(regionFeature)
            .attr("class", "region-shape")
            .attr("data-region-id", regionId)
            .attr("d", mapPathGenerator)
            .attr("fill", "transparent")
            .attr("stroke", regionColor)
            .attr("stroke-width", 3)
            .style("pointer-events", "all")
            .on("mouseover", function() {
                if (selectedRegion !== regionId) {
                    d3.select(this)
                        .attr("fill", `${regionColor}33`)
                        .attr("stroke-width", 4);
                }
            })
            .on("mouseout", function() {
                if (selectedRegion !== regionId) {
                    d3.select(this)
                        .attr("fill", "transparent")
                        .attr("stroke-width", 3);
                }
            })
            .on("click", function() {
                handleRegionClick(regionId, this, regionColor);
            });
    });

    mapSvg.append("g").attr("id", "flow-lines");
    setupArrowMarkers(mapSvg);
}

function drawFlowsForSelectedRegion(regionId) {
    const flowLinesGroup = mapSvg.select("g#flow-lines");
    flowLinesGroup.selectAll("*").remove();

    // Get region flows for the selected region from region flows data
    const relatedFlows = mapRegionFlowDataCache.filter(
        f => f.from_region_id === +regionId || f.to_region_id === +regionId
    );

    // Get region centroids by aggregating country centroids
    const regionCentroids = {};
    mapCountryDataCache.forEach(country => {
        const countryFeature = mapGeoDataCache.features.find(f => {
            return f.properties.name === country.country_name;
        });
        
        if (countryFeature) {
            const centroid = mapPathGenerator.centroid(countryFeature);
            if (!isNaN(centroid[0]) && !isNaN(centroid[1])) {
                if (!regionCentroids[country.region_id]) {
                    regionCentroids[country.region_id] = {
                        sumX: 0,
                        sumY: 0,
                        count: 0
                    };
                }
                regionCentroids[country.region_id].sumX += centroid[0];
                regionCentroids[country.region_id].sumY += centroid[1];
                regionCentroids[country.region_id].count++;
            }
        }
    });

    // Calculate average centroids for each region
    Object.keys(regionCentroids).forEach(rid => {
        const region = regionCentroids[rid];
        region.x = region.sumX / region.count;
        region.y = region.sumY / region.count;
    });

    // Get region names for tooltips
    const regionNames = {};
    allData.regions.forEach(r => {
        regionNames[r.region_id] = r.region_name;
    });

    // Draw flows
    relatedFlows.forEach(flow => {
        const flowValue = flow[`flow_${window.currentPeriod}`] || 0;
        if (flowValue <= 0 || flow.from_region_id === flow.to_region_id) return; // Skip if no flow or self-loop

        const sourceRegion = regionCentroids[flow.from_region_id];
        const targetRegion = regionCentroids[flow.to_region_id];

        if (sourceRegion && targetRegion) {
            const isOutflow = flow.from_region_id === +regionId;
            const fromRegionName = regionNames[flow.from_region_id] || `Region ${flow.from_region_id}`;
            const toRegionName = regionNames[flow.to_region_id] || `Region ${flow.to_region_id}`;
            
            flowLinesGroup.append("line")
                .attr("x1", sourceRegion.x)
                .attr("y1", sourceRegion.y)
                .attr("x2", targetRegion.x)
                .attr("y2", targetRegion.y)
                .attr("stroke", isOutflow ? "rgba(200,0,0,0.6)" : "rgba(0,100,0,0.6)")
                .attr("stroke-width", Math.max(1.5, Math.log10(flowValue + 1) / 1.5))
                .attr("marker-end", isOutflow ? "url(#arrowhead-out)" : "url(#arrowhead-in)")
                .append("title")
                .text(`${fromRegionName} → ${toRegionName}\nTotal Flow: ${flowValue.toLocaleString()}`);
        }
    });
}

function handleRegionClick(regionId, element, regionColor) {
    if (selectedRegion === regionId) {
        // Deselect region
        selectedRegion = null;
        d3.select(element)
            .attr("fill", "transparent")
            .attr("stroke-width", 3);
        
        // Reset all country interactions and appearance
        mapSvg.selectAll("path.country-shape")
            .style("pointer-events", "none")
            .attr("fill", "#f0e6d2")
            .attr("stroke-width", 0.5);
        
        // Clear selected country if any
        if (selectedCountry) {
            selectedCountry = null;
            mapSvg.selectAll("path.country-shape")
                .classed("selected-country", false);
        }
        
        // Clear flow lines
        mapSvg.select("g#flow-lines").selectAll("*").remove();

        // Show global line chart on deselection
        showGlobalLineChart();
    } else {
        // Deselect previous region if any
        if (selectedRegion) {
            mapSvg.select(`path.region-shape[data-region-id="${selectedRegion}"]`)
                .attr("fill", "transparent")
                .attr("stroke-width", 3);
            
            // Reset all countries first
            mapSvg.selectAll("path.country-shape")
                .attr("fill", "#f0e6d2")
                .attr("stroke-width", 0.5);
        }
        
        // Select new region
        selectedRegion = regionId;
        d3.select(element)
            .attr("fill", `${regionColor}33`)
            .attr("stroke-width", 4);
        
        // Update country interactions and appearance
        mapSvg.selectAll("path.country-shape")
            .style("pointer-events", function(d) {
                const country = getCountryData(d);
                return country && country.region_id === +regionId ? "all" : "none";
            })
            .attr("fill", function(d) {
                const country = getCountryData(d);
                if (country && country.region_id === +regionId) {
                    return `${regionColor}22`;
                }
                return "#f0e6d2";
            })
            .attr("stroke-width", function(d) {
                const country = getCountryData(d);
                return country && country.region_id === +regionId ? 1 : 0.5;
            });
            
        // Clear selected country if any when changing regions
        if (selectedCountry) {
            selectedCountry = null;
            mapSvg.selectAll("path.country-shape")
                .classed("selected-country", false);
        }
        
        // Draw flows for the selected region
        drawFlowsForSelectedRegion(regionId);
    }
}

function handleCountryHover(event, d_feature) {
    const country = getCountryData(d_feature);
    if (!selectedRegion || !country || country.region_id !== +selectedRegion) {
        return;
    }

    const element = d3.select(this);
    if (!element.classed("selected-country")) {
        const regionColor = regionColorScale(country.region_id);
        element.attr("fill", `${regionColor}66`);
    }
    
    mapTooltip.transition().duration(0).style("opacity", .9);
    mapTooltip.html(d_feature.properties.name || "N/A")
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 28) + "px");
}

function handleCountryMouseOut(event, d_feature) {
    const country = getCountryData(d_feature);
    if (!selectedRegion || !country || country.region_id !== +selectedRegion) {
        return;
    }

    const element = d3.select(this);
    if (!element.classed("selected-country")) {
        const regionColor = regionColorScale(country.region_id);
        element.attr("fill", `${regionColor}22`);
    }
    mapTooltip.transition().duration(0).style("opacity", 0);
}

function handleCountryClick(event, d_feature) {
    const country = getCountryData(d_feature);
    if (!selectedRegion || !country || country.region_id !== +selectedRegion) {
        return;
    }

    const element = d3.select(this);
    
    if (element.classed("selected-country")) {
        // Deselect country
        element.classed("selected-country", false);
        const regionColor = regionColorScale(country.region_id);
        element.attr("fill", `${regionColor}22`);
        selectedCountry = null;
        mapSvg.select("g#flow-lines").selectAll("*").remove();
        
        // Show global line chart when deselecting country
        showGlobalLineChart();
    } else {
        // Select country
        const regionColor = regionColorScale(country.region_id);
        mapSvg.selectAll("path.country-shape")
            .classed("selected-country", false)
            .attr("fill", function(d) {
                const c = getCountryData(d);
                return c && c.region_id === +selectedRegion ? `${regionColor}22` : "#f0e6d2";
            });
        
        element.classed("selected-country", true)
            .attr("fill", "#ffb700");
        
        selectedCountry = d_feature;
        
        if (typeof handleCountrySelection === "function") {
            handleCountrySelection(d_feature);
        }
        drawFlowsForSelectedCountry(d_feature);
    }
}

function setupArrowMarkers(svg) {
    const defs = svg.select("defs").node() ? svg.select("defs") : svg.append("defs");
    defs.selectAll("marker").remove();

    defs.append("marker")
        .attr("id", "arrowhead-out")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "rgba(200,0,0,0.7)");

    defs.append("marker")
        .attr("id", "arrowhead-in")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "rgba(0,100,0,0.7)");
}

function drawFlowsForSelectedCountry(selectedMapFeature) {
    const flowLinesGroup = mapSvg.select("g#flow-lines");
    flowLinesGroup.selectAll("*").remove();

    if (!mapCountryDataCache || !mapFlowDataCache) {
        console.warn("drawFlows: Country or flow data not available in cache.");
        return;
    }

    const mapCountryName = selectedMapFeature.properties.name;

    // Use mapping if available, otherwise use original map name
    const mappedName = countryNameMapping[mapCountryName] || mapCountryName;

    const selectedCountryCSV = mapCountryDataCache.find(c => c.country_name === mappedName);
    if (!selectedCountryCSV) {
        console.warn(`drawFlows: Could not find CSV country for '${mappedName}' (original: '${mapCountryName}')`);
        return;
    }

    const selectedCountryIdForFlows = selectedCountryCSV.country_id;

    let sourceCentroid;
    try {
        sourceCentroid = mapPathGenerator.centroid(selectedMapFeature);
        if (isNaN(sourceCentroid[0]) || isNaN(sourceCentroid[1])) throw new Error("Centroid NaN.");
    } catch (e) {
        console.error(`Error calculating centroid for ${mapCountryName}:`, e);
        const freshFeature = mapGeoDataCache.features.find(f => f.id === selectedMapFeature.id);
        if (!freshFeature) return;
        try {
            sourceCentroid = mapPathGenerator.centroid(freshFeature);
            if (isNaN(sourceCentroid[0]) || isNaN(sourceCentroid[1])) throw new Error("Still NaN.");
        } catch (e2) {
            console.error("Centroid recovery failed:", e2);
            return;
        }
    }

    const relatedFlows = mapFlowDataCache.filter(
        f => f.from_country_id === selectedCountryIdForFlows || f.to_country_id === selectedCountryIdForFlows
    );

    relatedFlows.forEach(flow => {
        let targetCountryCSVId, flowValue, isOutflow;
        if (flow.from_country_id === selectedCountryIdForFlows) {
            targetCountryCSVId = flow.to_country_id;
            isOutflow = true;
        } else {
            targetCountryCSVId = flow.from_country_id;
            isOutflow = false;
        }

        flowValue = flow[`flow_${window.currentPeriod}`] || 0;
        if (flowValue <= 0 || targetCountryCSVId === selectedCountryIdForFlows) return;

        const otherCountryCSV = mapCountryDataCache.find(c => c.country_id === targetCountryCSVId);
        if (!otherCountryCSV) return;

        const otherMapFeature = mapGeoDataCache.features.find(f => {
            const geoName = f.properties.name;
            const mappedGeoName = countryNameMapping[geoName] || geoName;
            return mappedGeoName === otherCountryCSV.country_name;
        });
        if (!otherMapFeature) return;

        let targetCentroid;
        try {
            targetCentroid = mapPathGenerator.centroid(otherMapFeature);
            if (isNaN(targetCentroid[0]) || isNaN(targetCentroid[1])) throw new Error("Target centroid NaN.");
        } catch (e) {
            console.error(`Error getting centroid for ${otherCountryCSV.country_name}:`, e);
            return;
        }

        const lineElement = flowLinesGroup.append("line")
            .datum({ // Attach flow data to the line element
                sourceName: isOutflow ? selectedCountryCSV.country_name : otherCountryCSV.country_name,
                targetName: isOutflow ? otherCountryCSV.country_name : selectedCountryCSV.country_name,
                value: flowValue,
                period: window.currentPeriod,
                isOutflow: isOutflow
            })
            .attr("x1", sourceCentroid[0])
            .attr("y1", sourceCentroid[1])
            .attr("x2", targetCentroid[0])
            .attr("y2", targetCentroid[1])
            .attr("stroke", d => d.isOutflow ? "rgb(200,0,0)" : "rgb(0,100,0)") // Use RGB for color
            .attr("stroke-opacity", 0.6) // Default opacity
            .attr("stroke-width", d => Math.max(0.75, Math.log10(d.value + 1) / 1.5))
            .attr("marker-end", d => d.isOutflow ? "url(#arrowhead-out)" : "url(#arrowhead-in)")
            .style("pointer-events", "all")
            .classed("flow-line", true);



        lineElement
            .on("mouseover", (event, d) => {
                const currentLine = d3.select(event.currentTarget);
                // Apply hover style
                currentLine
                    .attr("stroke-width", Math.max(1.5, Math.log10(d.value + 1)))
                    .attr("stroke-opacity", 1);
                
                mapTooltip
                    .transition().duration(200).style("opacity", .9);
                const tooltipText = `${d.isOutflow ? d.sourceName + ' → ' + d.targetName : d.targetName + ' → ' + d.sourceName}<br>Total Flow: ${d.value.toLocaleString()}`;
                mapTooltip
                    .html(tooltipText)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseout", (event, d) => {
                const currentLine = d3.select(event.currentTarget);
                // Reset style
                currentLine
                    .attr("stroke-width", Math.max(0.75, Math.log10(d.value + 1) / 1.5))
                    .attr("stroke-opacity", 0.6);
                
                mapTooltip.transition().duration(200).style("opacity", 0);
            });
            // Removed the .on("click", ...) handler entirely
    });
}

function handleOceanClick() {
    // Deselect any selected region
    if (selectedRegion) {
        const regionElement = mapSvg.select(`path.region-shape[data-region-id="${selectedRegion}"]`);
        handleRegionClick(selectedRegion, regionElement.node(), regionColorScale(selectedRegion));
    }
    
    // Deselect any selected country
    if (selectedCountry) {
        selectedCountry = null;
        mapSvg.selectAll("path.country-shape")
            .classed("selected-country", false)
            .attr("fill", "#f0e6d2");
        mapSvg.select("g#flow-lines").selectAll("*").remove();
    }

    // Show global line chart
    showGlobalLineChart();
}

function showGlobalLineChart() {
    if (typeof initLineChart === "function") {
        initLineChart(mapFlowDataCache, mapCountryDataCache);
    }
}
