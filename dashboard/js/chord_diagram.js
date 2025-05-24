// dashboard/js/chord_diagram.js

function initChordDiagram(regionFlowData, regionData) {
    console.log("Initializing Chord Diagram with data:", regionFlowData.length, "flows");
    const container = d3.select("#chord-diagram");
    if (container.empty()) {
        console.error("#chord-diagram container not found");
        return;
    }
    container.selectAll("*").remove(); // Clear previous chart

    const BBox = container.node().getBoundingClientRect();
    const width = BBox.width;
    const height = BBox.height;
    const outerRadius = Math.min(width, height) * 0.5 - 70; // More space for labels
    const innerRadius = outerRadius - 24; // Thicker arcs

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    // --- Prepare data for chord diagram ---
    // 1. Filter out flows with missing region IDs and sum flows over all years
    const aggregatedFlows = {};
    regionFlowData.forEach(flow => {
        if (flow.from_region_id && flow.to_region_id && flow.from_region_id !== flow.to_region_id) { // Exclude self-loops for clarity
            const key = `${flow.from_region_id}-${flow.to_region_id}`;
            const totalFlow = flow[`flow_${window.currentPeriod}`] || 0;
            aggregatedFlows[key] = (aggregatedFlows[key] || 0) + totalFlow;
        }
    });

    const uniqueRegionIds = [...new Set(
        Object.keys(aggregatedFlows).flatMap(key => key.split('-').map(id => +id))
    )].sort((a, b) => a - b);

    if (uniqueRegionIds.length < 2) {
        svg.append("text").attr("text-anchor", "middle").style("font-size", "12px").text("Not enough distinct region flows for chord diagram.");
        console.warn("Not enough distinct region flows for chord diagram.");
        return;
    }
    
    const regionIdToIndex = new Map(uniqueRegionIds.map((id, i) => [id, i]));
    const numRegions = uniqueRegionIds.length;

    const matrix = Array(numRegions).fill(null).map(() => Array(numRegions).fill(0));
    for (const key in aggregatedFlows) {
        const [from, to] = key.split('-').map(id => +id);
        const fromIndex = regionIdToIndex.get(from);
        const toIndex = regionIdToIndex.get(to);
        if (fromIndex !== undefined && toIndex !== undefined) {
            matrix[fromIndex][toIndex] = aggregatedFlows[key];
        }
    }

    const regionIdToName = new Map(regionData.map(r => [r.region_id, r.region_name]));
    const names = uniqueRegionIds.map(id => regionIdToName.get(id) || `Region ${id}`);

    // --- D3 Chord Layout ---
    const chordLayout = d3.chord()
        .padAngle(0.05) // padding between groups
        .sortSubgroups(d3.descending) // sort the chords inside each group
        .sortChords(d3.descending); // sort the groups

    const chords = chordLayout(matrix);

    // Color scale
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(d3.range(numRegions)); // d3.schemePastel1 or d3.schemeSet3 for more colors

    // --- Draw Arcs (Groups) ---
    const group = svg.append("g")
        .attr("class", "groups")
        .selectAll("g")
        .data(chords.groups)
        .join("g");

    group.append("path")
        .style("fill", d => color(d.index))
        .style("stroke", d => d3.rgb(color(d.index)).darker())
        .attr("d", d3.arc().innerRadius(innerRadius).outerRadius(outerRadius))
        .append("title")
        .text((d, i) => `${names[i]}\nTotal Outflow: ${d3.sum(matrix[d.index]).toLocaleString()}`);


    // --- Add Labels to Arcs ---
    group.append("text")
      .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", ".35em")
      .attr("transform", d => `
        rotate(${(d.angle * 180 / Math.PI - 90)})
        translate(${outerRadius + 10}) 
        ${d.angle > Math.PI ? "rotate(180)" : ""}
      `)
      .attr("text-anchor", d => d.angle > Math.PI ? "end" : "start")
      .text((d, i) => names[i])
      .style("font-size", "10px")
      .style("fill", "#333");


    // --- Draw Ribbons (Chords) ---
    svg.append("g")
        .attr("class", "ribbons")
        .attr("fill-opacity", 0.67)
        .selectAll("path")
        .data(chords)
        .join("path")
        .attr("d", d3.ribbon().radius(innerRadius))
        .style("fill", d => color(d.source.index))
        .style("stroke", d => d3.rgb(color(d.source.index)).darker())
        .style("mix-blend-mode", "multiply") // For nicer overlaps
        .append("title")
        .text(d => `${names[d.source.index]} → ${names[d.target.index]}: ${d.source.value.toLocaleString()}`);

    console.log("Chord diagram drawn.");
}

// function updateChordDiagramForRegion(regionId, allRegionFlows, allRegions) { /* ... */ }
