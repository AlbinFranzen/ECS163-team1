// dashboard/js/map_viz.js

let mapSvg, mapProjection, mapPathGenerator, mapTooltip;
let mapGeoDataCache, mapCountryDataCache, mapFlowDataCache; // To store loaded data locally in this module if needed

function initMap(countryFlows, countries, geoData) { // geoData is the GeoJSON FeatureCollection
    mapFlowDataCache = countryFlows; // Store for use in drawFlowsForSelectedCountry
    mapCountryDataCache = countries;
    mapGeoDataCache = geoData; // Store for finding features later

    console.log("Initializing Map. GeoJSON features:", geoData.features.length);

    const container = d3.select("#map-visualization");
    if (container.empty()) {
        console.error("#map-visualization container not found");
        return;
    }
    container.selectAll("*").remove(); // Clear previous map

    mapTooltip = d3.select("#map-tooltip"); // Get existing tooltip div from index.html

    const BBox = container.node().getBoundingClientRect();
    const width = BBox.width;
    const height = BBox.height;

    mapSvg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("background-color", "#e0f7fa"); // Light cyan background

    mapProjection = d3.geoMercator() // or d3.geoNaturalEarth1()
        .fitSize([width, height], geoData); // Fit the GeoJSON features

    mapPathGenerator = d3.geoPath().projection(mapProjection);

    // --- Draw Countries ---
    const countriesGroup = mapSvg.append("g")
        .attr("class", "countries");

    countriesGroup.selectAll("path.country-shape")
        .data(geoData.features, d => d.id) // Use feature.id as key if stable (ISO numeric string)
        .join("path")
        .attr("d", mapPathGenerator)
        .attr("fill", "#cccccc")
        .attr("stroke", "#333333")
        .attr("stroke-width", 0.5)
        .attr("class", "country-shape") // For styling and selection
        .on("mouseover", function(event, d_feature) {
            if (!d3.select(this).classed("selected-country")) { // Don't change fill if selected
                d3.select(this).attr("fill", "orange");
            }
            mapTooltip.transition().duration(200).style("opacity", .9);
            mapTooltip.html(d_feature.properties.name || "N/A") // From TopoJSON: properties.name
                   .style("left", (event.pageX + 15) + "px")
                   .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d_feature) {
            if (!d3.select(this).classed("selected-country")) {
                d3.select(this).attr("fill", "#cccccc"); // Revert to default if not selected
            }
            mapTooltip.transition().duration(500).style("opacity", 0);
        })
        .on("click", function(event, d_feature) { // d_feature is the GeoJSON feature datum
            // Clear previously selected country's visual state
            mapSvg.selectAll("path.country-shape")
                .classed("selected-country", false)
                .attr("fill", "#cccccc");
            mapSvg.select("g#flow-lines").selectAll("*").remove(); // Clear old flow lines

            // Highlight newly clicked country
            d3.select(this).classed("selected-country", true).attr("fill", "gold");

            console.log("Map clicked feature:", d_feature); // Log the feature to inspect its structure (id, properties.name)

            // Call the handler in main.js to update other charts
            // Pass the clicked feature object 'd_feature' itself
            if (typeof handleCountrySelection === "function") {
                handleCountrySelection(d_feature);
            }
            // Also, draw flows related to this country on the map directly
            drawFlowsForSelectedCountry(d_feature);
        });

    // Group for flow lines, add it after countries so lines are on top
    mapSvg.append("g").attr("id", "flow-lines");

    // Define arrowheads for flow lines (only once)
    const defs = mapSvg.append("defs");
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
        .attr("fill", "rgba(200,0,0,0.7)"); // Reddish for outflow

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
        .attr("fill", "rgba(0,100,0,0.7)"); // Greenish for inflow

    console.log("Map initialized and drawn.");
}


function drawFlowsForSelectedCountry(selectedMapFeature) {
    const flowLinesGroup = mapSvg.select("g#flow-lines");
    flowLinesGroup.selectAll("*").remove(); // Clear previous flows

    const mapCountryName = selectedMapFeature.properties.name;
    const mapCountryNumericIdStr = selectedMapFeature.id; // e.g., "840" (ISO 3166-1 numeric as string)

    // --- Find the selected country in our countries.csv data ---
    // This matching is CRITICAL. Adjust based on your countries.csv data.
    // Option 1: Match by name (less reliable)
    const selectedCountryCSV = mapCountryDataCache.find(c => c.country_name === mapCountryName);
    // Option 2: If countries.csv has 'iso_numeric' (recommended)
    // const selectedCountryCSV = mapCountryDataCache.find(c => c.iso_numeric === +mapCountryNumericIdStr); // Ensure c.iso_numeric is number

    if (!selectedCountryCSV) {
        console.warn(`drawFlows: Could not find CSV details for map country: Name='${mapCountryName}', MapID='${mapCountryNumericIdStr}'`);
        return;
    }
    const selectedCountryIdForFlows = selectedCountryCSV.country_id; // The ID used in *Flows.csv

    // Get centroid of selected country (source of flows)
    const sourceCentroid = mapPathGenerator.centroid(selectedMapFeature); // [x,y] screen coordinates for the clicked map feature

    const relatedFlows = mapFlowDataCache.filter(
        f => f.from_country_id === selectedCountryIdForFlows || f.to_country_id === selectedCountryIdForFlows
    );

    relatedFlows.forEach(flow => {
        let targetCountryCSVId, flowValue, isOutflow;
        if (flow.from_country_id === selectedCountryIdForFlows) { // Outflow from selected
            targetCountryCSVId = flow.to_country_id;
            isOutflow = true;
        } else { // Inflow to selected
            targetCountryCSVId = flow.from_country_id;
            isOutflow = false;
        }
        // Sum flows over all years for this example, or pick one specific year for line thickness
        flowValue = (flow.flow_1990 || 0) + (flow.flow_1995 || 0) + (flow.flow_2000 || 0) + (flow.flow_2005 || 0);

        if (flowValue <= 0) return; // Don't draw zero/negative flows

        // Find the target/other country's details in countries.csv
        const otherCountryCSV = mapCountryDataCache.find(c => c.country_id === targetCountryCSVId);
        if (otherCountryCSV) {
            // Now find the GeoJSON feature for this other country to get its centroid
            // This requires matching from countries.csv back to the map features.
            // Option 1: Match by name (if otherCountryCSV.country_name matches map feature name)
            const otherMapFeature = mapGeoDataCache.features.find(f => f.properties.name === otherCountryCSV.country_name);
            // Option 2: Match by ISO numeric ID (if otherCountryCSV.iso_numeric matches map feature id)
            // const otherMapFeature = mapGeoDataCache.features.find(f => f.id === String(otherCountryCSV.iso_numeric));

            if (otherMapFeature) {
                const targetCentroid = mapPathGenerator.centroid(otherMapFeature);

                flowLinesGroup.append("line")
                    .attr("x1", sourceCentroid[0])
                    .attr("y1", sourceCentroid[1])
                    .attr("x2", targetCentroid[0])
                    .attr("y2", targetCentroid[1])
                    .attr("stroke", isOutflow ? "rgba(200,0,0,0.5)" : "rgba(0,100,0,0.5)")
                    .attr("stroke-width", Math.max(0.5, Math.log10(flowValue + 1))) // Scale width by flow
                    .attr("marker-end", isOutflow ? "url(#arrowhead-out)" : (isOutflow === false ? "url(#arrowhead-in)" : null)) // Add arrowhead only if directional
                    .append("title") // Simple tooltip for the flow line
                    .text(`${isOutflow ? selectedCountryCSV.country_name + ' → ' + otherCountryCSV.country_name : otherCountryCSV.country_name + ' → ' + selectedCountryCSV.country_name}\nFlow: ${flowValue.toLocaleString()}`);
            } else {
                // console.warn(`Could not find map feature for target country: ${otherCountryCSV.country_name}`);
            }
        }
    });
    console.log(`Drew ${relatedFlows.length} potential flow lines for ${selectedCountryCSV.country_name}.`);
}
