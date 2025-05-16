// dashboard/js/map_viz.js

let mapSvg, mapProjection, mapPathGenerator, mapTooltip;
let mapGeoDataCache, mapCountryDataCache, mapFlowDataCache;

function initMap(countryFlows, countries, geoData) {
    mapFlowDataCache = countryFlows;
    mapCountryDataCache = countries;
    mapGeoDataCache = geoData;

    console.log("Initializing Map. GeoJSON features:", geoData.features.length);

    const container = d3.select("#map-visualization");
    if (container.empty()) {
        console.error("#map-visualization container not found");
        return;
    }
    container.selectAll("*").remove();

    mapTooltip = d3.select("#map-tooltip");

    const BBox = container.node().getBoundingClientRect();
    const width = BBox.width;
    const height = BBox.height;

    mapSvg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`) // For responsiveness
        .attr("preserveAspectRatio", "xMidYMid slice")
        .style("background-color", "#aed9e0"); // Slightly different blue for ocean

    // --- Improved Map Projection ---
    mapProjection = d3.geoNaturalEarth1() // A good compromise projection
        .scale(1) // Start with scale 1, fitExtent will adjust it
        .translate([0, 0]); // Start with translate 0,0

    // Calculate scale and translate to fit the features within the SVG,
    // centering the landmasses a bit better.
    const tempPath = d3.geoPath().projection(mapProjection);
    const bounds = tempPath.bounds(geoData); // Get bounds of all features with initial projection
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = 0.9 * Math.min(width / dx, height / dy); // 0.9 to add a little padding
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    mapProjection.scale(scale).translate(translate);

    // If you specifically want to clip Antarctica (though world-110m.json from world-atlas
    // often doesn't include it as a distinct 'country' feature in the same way)
    // mapProjection.clipAngle(90); // Clips the sphere to a hemisphere, effectively removing Antarctica

    mapPathGenerator = d3.geoPath().projection(mapProjection);

    // Optional: Add a graticule (latitude/longitude lines) for context
    const graticule = d3.geoGraticule10(); // Every 10 degrees
    mapSvg.append("path")
        .datum(graticule)
        .attr("class", "graticule")
        .attr("d", mapPathGenerator)
        .style("fill", "none")
        .style("stroke", "#c0d9e0") // Lighter lines
        .style("stroke-width", 0.5);


    // --- Draw Countries ---
    const countriesGroup = mapSvg.append("g")
        .attr("class", "countries");

    countriesGroup.selectAll("path.country-shape")
        .data(geoData.features, d => d.id)
        .join("path")
        .attr("d", mapPathGenerator)
        .attr("fill", "#f0e6d2") // A land-like color (beige/light brown)
        .attr("stroke", "#786a59") // Darker brown for borders
        .attr("stroke-width", 0.5)
        .attr("class", "country-shape")
        .on("mouseover", function(event, d_feature) {
            if (!d3.select(this).classed("selected-country")) {
                d3.select(this).attr("fill", "#ffd700"); // Brighter gold for hover
            }
            mapTooltip.transition().duration(200).style("opacity", .9);
            mapTooltip.html(d_feature.properties.name || "N/A")
                   .style("left", (event.pageX + 15) + "px")
                   .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d_feature) {
            if (!d3.select(this).classed("selected-country")) {
                d3.select(this).attr("fill", "#f0e6d2"); // Revert to default land color
            }
            mapTooltip.transition().duration(500).style("opacity", 0);
        })
        .on("click", function(event, d_feature) {
            mapSvg.selectAll("path.country-shape")
                .classed("selected-country", false)
                .attr("fill", "#f0e6d2"); // Reset all to default land color
            mapSvg.select("g#flow-lines").selectAll("*").remove();

            d3.select(this).classed("selected-country", true).attr("fill", "#ffb700"); // Slightly darker gold for selected

            console.log("Map clicked feature:", d_feature);

            if (typeof handleCountrySelection === "function") {
                handleCountrySelection(d_feature);
            }
            drawFlowsForSelectedCountry(d_feature);
        });

    mapSvg.append("g").attr("id", "flow-lines");

    const defs = mapSvg.select("defs").node() ? mapSvg.select("defs") : mapSvg.append("defs"); // Ensure defs exists
    defs.selectAll("marker").remove(); // Clear old markers before adding new ones

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

    console.log("Map initialized and drawn with NaturalEarth1 projection.");
}


function drawFlowsForSelectedCountry(selectedMapFeature) {
    const flowLinesGroup = mapSvg.select("g#flow-lines");
    flowLinesGroup.selectAll("*").remove();

    // Ensure mapCountryDataCache and mapFlowDataCache are populated
    if (!mapCountryDataCache || !mapFlowDataCache) {
        console.warn("drawFlows: Country or flow data not available in cache.");
        return;
    }

    const mapCountryName = selectedMapFeature.properties.name;
    const mapCountryNumericIdStr = selectedMapFeature.id;

    const selectedCountryCSV = mapCountryDataCache.find(c => {
        // Prioritize matching by a more stable ID if possible
        // This assumes your countries.csv has an 'iso_numeric_str' that matches map's 'id'
        // or adjust to your actual column name and type.
        // if (c.iso_numeric_str === mapCountryNumericIdStr) return true;
        return c.country_name === mapCountryName; // Fallback to name
    });


    if (!selectedCountryCSV) {
        console.warn(`drawFlows: Could not find CSV details for map country: Name='${mapCountryName}', MapID='${mapCountryNumericIdStr}'`);
        return;
    }
    const selectedCountryIdForFlows = selectedCountryCSV.country_id;

    // Check if selectedMapFeature has a valid centroid.
    // For GeoJSON features from TopoJSON, centroid calculation should be reliable.
    let sourceCentroid;
    try {
        sourceCentroid = mapPathGenerator.centroid(selectedMapFeature);
        if (isNaN(sourceCentroid[0]) || isNaN(sourceCentroid[1])) throw new Error("Centroid calculation resulted in NaN.");
    } catch (e) {
        console.error(`Error calculating centroid for ${mapCountryName}:`, e);
        console.error("Problematic feature:", selectedMapFeature);
        // Try to find the feature again in the cached geoData if selectedMapFeature is somehow malformed by D3 event
        const freshFeature = mapGeoDataCache.features.find(f => f.id === selectedMapFeature.id);
        if (freshFeature) {
            try {
                sourceCentroid = mapPathGenerator.centroid(freshFeature);
                 if (isNaN(sourceCentroid[0]) || isNaN(sourceCentroid[1])) throw new Error("Centroid from fresh feature also NaN.");
            } catch (e2) {
                console.error("Still couldn't get centroid for fresh feature:", e2);
                return; // Cannot draw flows without a source centroid
            }
        } else {
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
        flowValue = (flow.flow_1990 || 0) + (flow.flow_1995 || 0) + (flow.flow_2000 || 0) + (flow.flow_2005 || 0);

        if (flowValue <= 0 || targetCountryCSVId === selectedCountryIdForFlows) return; // No flow or self-loop

        const otherCountryCSV = mapCountryDataCache.find(c => c.country_id === targetCountryCSVId);
        if (otherCountryCSV) {
            const otherMapFeature = mapGeoDataCache.features.find(f => {
                // Match otherMapFeature based on how selectedCountryCSV was matched
                // if (otherCountryCSV.iso_numeric_str && f.id === otherCountryCSV.iso_numeric_str) return true;
                return f.properties.name === otherCountryCSV.country_name;
            });

            if (otherMapFeature) {
                let targetCentroid;
                try {
                     targetCentroid = mapPathGenerator.centroid(otherMapFeature);
                     if (isNaN(targetCentroid[0]) || isNaN(targetCentroid[1])) throw new Error("Target centroid NaN.");
                } catch (e) {
                    console.error(`Error calculating target centroid for ${otherCountryCSV.country_name}:`, e);
                    return; // Skip this flow if target centroid can't be found
                }


                flowLinesGroup.append("line")
                    .attr("x1", sourceCentroid[0])
                    .attr("y1", sourceCentroid[1])
                    .attr("x2", targetCentroid[0])
                    .attr("y2", targetCentroid[1])
                    .attr("stroke", isOutflow ? "rgba(200,0,0,0.6)" : "rgba(0,100,0,0.6)")
                    .attr("stroke-width", Math.max(0.75, Math.log10(flowValue + 1) / 1.5))
                    .attr("marker-end", isOutflow ? "url(#arrowhead-out)" : (isOutflow === false ? "url(#arrowhead-in)" : null))
                    .append("title")
                    .text(`${isOutflow ? selectedCountryCSV.country_name + ' → ' + otherCountryCSV.country_name : otherCountryCSV.country_name + ' → ' + selectedCountryCSV.country_name}\nTotal Flow (all periods): ${flowValue.toLocaleString()}`);
            }
        }
    });
    // console.log(`Drew flow lines for ${selectedCountryCSV.country_name}.`);
}
