// dashboard/js/chord_diagram.js

// Global variables to store chord diagram elements for highlighting
let chordSvg, chordGroups, chordRibbons, chordRegionIdToIndex, chordUniqueRegionIds, chordNames, chordContainer;

// Create region abbreviations for cleaner labeling
function getRegionAbbreviation(regionName) {
    const abbreviations = {
        'Africa': 'AFR',
        'East Asia': 'EA',
        'Europe': 'EUR',
        'Fmr Soviet Union': 'FSU',
        'Latin America': 'LAM',
        'North America': 'NAM',
        'Oceania': 'OCE',
        'South Asia': 'SA',
        'South-East Asia': 'SEA',
        'West Asia': 'WA'
    };
    return abbreviations[regionName] || regionName.substring(0, 3).toUpperCase();
}

function initChordDiagram(regionFlowData, regionData) {
    console.log("Initializing Chord Diagram with data:", regionFlowData.length, "flows");
    chordContainer = d3.select("#chord-diagram");
    if (chordContainer.empty()) {
        console.error("#chord-diagram container not found");
        return;
    }
    chordContainer.selectAll("*").remove(); // Clear previous chart

    // Get actual available space
    const containerRect = chordContainer.node().getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Reserve space for legend (100px on the right, smaller than before)
    const legendWidth = 100;
    const padding = 5; // minimal padding
    const labelSpace = 20; // reduced label space for tighter fit

    // Calculate available space for the diagram
    const availableWidth = containerWidth - legendWidth - (padding * 2);
    const availableHeight = containerHeight - (padding * 2);

    // Calculate maximum possible radius to use all available space
    const maxRadius = Math.min(
        (availableWidth - labelSpace * 2) / 2,
        (availableHeight - labelSpace * 2) / 2
    );

    // Use the maximum radius possible (with small minimum for safety)
    const radius = Math.max(maxRadius, 40);
    const innerRadius = radius - 12; // thinner ring for larger diagram area

    // Center the diagram in available space
    const diagramX = padding + labelSpace + radius;
    const diagramY = padding + labelSpace + radius;

    // Create main SVG
    const svg = chordContainer.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    // Create diagram group
    chordSvg = svg.append("g")
        .attr("class", "chord-diagram-main")
        .attr("transform", `translate(${diagramX}, ${diagramY})`);

    // --- Prepare data for chord diagram ---
    const aggregatedFlows = {};
    regionFlowData.forEach(flow => {
        if (flow.from_region_id && flow.to_region_id && flow.from_region_id !== flow.to_region_id) {
            const key = `${flow.from_region_id}-${flow.to_region_id}`;
            const totalFlow = flow[`flow_${window.currentPeriod}`] || 0;
            aggregatedFlows[key] = (aggregatedFlows[key] || 0) + totalFlow;
        }
    });

    // Filter out very small flows to reduce clutter
    const allFlowValues = Object.values(aggregatedFlows);
    const maxFlow = Math.max(...allFlowValues);
    const minThreshold = maxFlow * 0.01;

    const significantFlows = {};
    for (const [key, value] of Object.entries(aggregatedFlows)) {
        if (value >= minThreshold) {
            significantFlows[key] = value;
        }
    }

    chordUniqueRegionIds = [...new Set(
        Object.keys(significantFlows).flatMap(key => key.split('-').map(id => +id))
    )].sort((a, b) => a - b);

    if (chordUniqueRegionIds.length < 2) {
        chordSvg.append("text")
            .attr("text-anchor", "middle")
            .style("font-size", "14px")
            .style("fill", "#666")
            .text("Not enough significant region flows for chord diagram.");
        return;
    }

    chordRegionIdToIndex = new Map(chordUniqueRegionIds.map((id, i) => [id, i]));
    const numRegions = chordUniqueRegionIds.length;

    const matrix = Array(numRegions).fill(null).map(() => Array(numRegions).fill(0));
    for (const key in significantFlows) {
        const [from, to] = key.split('-').map(id => +id);
        const fromIndex = chordRegionIdToIndex.get(from);
        const toIndex = chordRegionIdToIndex.get(to);
        if (fromIndex !== undefined && toIndex !== undefined) {
            matrix[fromIndex][toIndex] = significantFlows[key];
        }
    }

    const regionIdToName = new Map(regionData.map(r => [r.region_id, r.region_name]));
    chordNames = chordUniqueRegionIds.map(id => regionIdToName.get(id) || `Region ${id}`);

    // Create chord layout
    const chordLayout = d3.chord()
        .padAngle(0.08)
        .sortSubgroups(d3.descending)
        .sortChords(d3.descending);

    const chords = chordLayout(matrix);

    // Color scale
    const color = d3.scaleOrdinal()
        .domain(d3.range(numRegions))
        .range(['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']);

    // --- Draw Arcs (Groups) ---
    chordGroups = chordSvg.append("g")
        .attr("class", "chord-groups")
        .selectAll("g")
        .data(chords.groups)
        .join("g")
        .attr("class", "chord-group");

    chordGroups.append("path")
        .attr("class", "chord-arc")
        .style("fill", d => color(d.index))
        .style("stroke", d => d3.rgb(color(d.index)).darker())
        .style("stroke-width", 1)
        .attr("d", d3.arc().innerRadius(innerRadius).outerRadius(radius))
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            highlightRegionInChord(chordUniqueRegionIds[d.index], true);
        })
        .on("mouseout", function (event, d) {
            clearChordHighlight();
        })
        .append("title")
        .text(d => {
            const regionName = chordNames[d.index];
            const totalOutflow = d3.sum(matrix[d.index]);
            const totalInflow = d3.sum(matrix.map(row => row[d.index]));
            return `${regionName}\nOutflow: ${totalOutflow.toLocaleString()}\nInflow: ${totalInflow.toLocaleString()}`;
        });

    // --- Add abbreviated upright labels around the circle ---
    chordGroups.append("text")
        .attr("class", "chord-label")
        .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
        .attr("dy", ".35em")
        .attr("transform", d => {
            const angle = d.angle * 180 / Math.PI - 90;
            const labelRadius = radius + 8; // closer to circle for larger diagram
            const x = Math.cos((d.angle - Math.PI / 2)) * labelRadius;
            const y = Math.sin((d.angle - Math.PI / 2)) * labelRadius;
            return `translate(${x}, ${y})`;
        })
        .attr("text-anchor", "middle")
        .text(d => getRegionAbbreviation(chordNames[d.index]))
        .style("font-size", "10px") // slightly smaller for tighter fit
        .style("font-weight", "600")
        .style("fill", "#333")
        .style("pointer-events", "none");

    // --- Draw Ribbons (Chords) ---
    chordRibbons = chordSvg.append("g")
        .attr("class", "chord-ribbons")
        .selectAll("path")
        .data(chords)
        .join("path")
        .attr("class", "chord-ribbon")
        .attr("d", d3.ribbon().radius(innerRadius))
        .style("fill", d => color(d.source.index))
        .style("fill-opacity", 0.6)
        .style("stroke", d => d3.rgb(color(d.source.index)).darker())
        .style("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            d3.select(this).style("fill-opacity", 0.9);
            highlightRegionInChord(chordUniqueRegionIds[d.source.index], false);
            highlightRegionInChord(chordUniqueRegionIds[d.target.index], false);
        })
        .on("mouseout", function (event, d) {
            d3.select(this).style("fill-opacity", 0.6);
            clearChordHighlight();
        })
        .append("title")
        .text(d => {
            const sourceRegion = chordNames[d.source.index];
            const targetRegion = chordNames[d.target.index];
            const flowValue = d.source.value;
            return `${sourceRegion} → ${targetRegion}\nFlow: ${flowValue.toLocaleString()}`;
        });

    // --- Create Compact Legend ---
    const legend = svg.append("g")
        .attr("class", "chord-legend")
        .attr("transform", `translate(${containerWidth - legendWidth + 5}, ${padding + 5})`);

    legend.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .style("font-size", "11px")
        .style("font-weight", "600")
        .style("fill", "#333")
        .text("Regions");

    const legendItems = legend.selectAll(".legend-item")
        .data(chords.groups)
        .join("g")
        .attr("class", "legend-item")
        .attr("transform", (d, i) => `translate(0, ${i * 16 + 16})`) // tighter spacing
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            highlightRegionInChord(chordUniqueRegionIds[d.index], true);
        })
        .on("mouseout", function (event, d) {
            clearChordHighlight();
        });

    legendItems.append("rect")
        .attr("x", 0)
        .attr("y", -6)
        .attr("width", 10)  // smaller legend squares
        .attr("height", 10)
        .style("fill", d => color(d.index))
        .style("stroke", d => d3.rgb(color(d.index)).darker());

    legendItems.append("text")
        .attr("x", 14)      // closer to squares
        .attr("y", 0)
        .attr("dy", ".35em")
        .style("font-size", "9px")  // smaller text
        .style("fill", "#333")
        .text(d => chordNames[d.index]);


}

/**
 * Highlight a specific region in the chord diagram
 */
function highlightRegionInChord(regionId, dimOthers = true) {
    if (!chordSvg || !chordRegionIdToIndex) return;

    const regionIndex = chordRegionIdToIndex.get(regionId);
    if (regionIndex === undefined) return;

    if (dimOthers) {
        // Dim all elements
        chordGroups.selectAll(".chord-arc")
            .style("fill-opacity", 0.3)
            .style("stroke-opacity", 0.3);

        chordRibbons
            .style("fill-opacity", 0.1)
            .style("stroke-opacity", 0.1);

        chordGroups.selectAll(".chord-label")
            .style("fill-opacity", 0.4);

        d3.selectAll(".legend-item")
            .style("opacity", 0.4);
    }

    // Highlight selected region
    chordGroups.filter((d, i) => i === regionIndex)
        .select(".chord-arc")
        .style("fill-opacity", 1)
        .style("stroke-opacity", 1)
        .style("stroke-width", 2);

    chordGroups.filter((d, i) => i === regionIndex)
        .select(".chord-label")
        .style("fill-opacity", 1)
        .style("font-weight", "bold");

    // Highlight connected ribbons
    chordRibbons
        .filter(d => d.source.index === regionIndex || d.target.index === regionIndex)
        .style("fill-opacity", 0.8)
        .style("stroke-opacity", 1)
        .style("stroke-width", 1);

    // Highlight legend item
    d3.selectAll(".legend-item")
        .filter((d, i) => i === regionIndex)
        .style("opacity", 1);
}

/**
 * Clear all highlighting in the chord diagram
 */
function clearChordHighlight() {
    if (!chordSvg) return;

    // Reset all elements
    chordGroups.selectAll(".chord-arc")
        .style("fill-opacity", 1)
        .style("stroke-opacity", 1)
        .style("stroke-width", 1);

    chordRibbons
        .style("fill-opacity", 0.6)
        .style("stroke-opacity", 1)
        .style("stroke-width", 0.5);

    chordGroups.selectAll(".chord-label")
        .style("fill-opacity", 1)
        .style("font-weight", "600");

    d3.selectAll(".legend-item")
        .style("opacity", 1);
}

/**
 * Get the region ID from a region index in the chord diagram
 */
function getRegionIdFromChordIndex(regionIndex) {
    if (!chordUniqueRegionIds || regionIndex >= chordUniqueRegionIds.length) return null;
    return chordUniqueRegionIds[regionIndex];
}
