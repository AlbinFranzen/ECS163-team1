// dashboard/js/line_chart.js

let lineChartSvg, lineChartXScale, lineChartYScale, lineChartLine, lineChartWidth, lineChartHeight, lineChartMargin, lineChartInnerWidth, lineChartInnerHeight;

function initLineChart(countryFlowData, countryData) {
    console.log("Initializing Line Chart with global data:", countryFlowData.length, "flows");
    const container = d3.select("#line-chart");
    if (container.empty()) {
        console.error("#line-chart container not found");
        return;
    }
    container.selectAll("*").remove(); // Clear previous chart

    // Get actual container dimensions and ensure responsive sizing
    const containerRect = container.node().getBoundingClientRect();
    lineChartWidth = containerRect.width;
    lineChartHeight = containerRect.height;

    console.log("Line chart container dimensions:", lineChartWidth, "x", lineChartHeight);

    // Conservative margins that ensure chart fits within container
    lineChartMargin = {
        top: 20,     // space for title
        right: 25,   // space for legend/labels
        bottom: 40,  // space for x-axis labels
        left: 50     // space for y-axis labels
    };

    lineChartInnerWidth = Math.max(lineChartWidth - lineChartMargin.left - lineChartMargin.right, 100);
    lineChartInnerHeight = Math.max(lineChartHeight - lineChartMargin.top - lineChartMargin.bottom, 60);

    const svg = container.append("svg")
        .attr("width", lineChartWidth)
        .attr("height", lineChartHeight);

    lineChartSvg = svg.append("g")
        .attr("transform", `translate(${lineChartMargin.left},${lineChartMargin.top})`);

    // Aggregate total global flow for each year as a default view
    const years = ["1990", "1995", "2000", "2005"]; // Or dynamically get from keys
    let yearlyGlobalFlows = years.map(yearSuffix => {
        const year = parseInt(yearSuffix);
        let totalOutflow = 0;
        countryFlowData.forEach(d => {
            totalOutflow += d[`flow_${yearSuffix}`] || 0; // Summing all 'from' flows
        });
        return { year: new Date(year, 0, 1), total_flow: totalOutflow, type: "Global Outflow" };
    });

    drawLineChartPlot(yearlyGlobalFlows, "Global Outflow");
}

function updateLineChartForCountry(relatedCountryFlows, countryName, allCountries) {
    console.log(`Updating Line Chart for ${countryName} with`, relatedCountryFlows.length, "flows");
    if (!lineChartSvg) {
        console.error("Line chart not initialized.");
        return;
    }
    lineChartSvg.selectAll("*").remove(); // Clear previous plot elements (axes, lines, labels)

    const years = ["1990", "1995", "2000", "2005"];
    // Find the selected country's ID to distinguish inflow/outflow
    const selectedCountryDetails = allCountries.find(c => c.country_name === countryName);
    if (!selectedCountryDetails) {
        console.warn("Could not find details for country:", countryName);
        drawLineChartPlot([], `No data for ${countryName}`); // Draw empty state
        return;
    }
    const selectedCountryId = selectedCountryDetails.country_id;

    let yearlyCountryFlows = years.map(yearSuffix => {
        const year = parseInt(yearSuffix);
        let inflow = 0;
        let outflow = 0;
        relatedCountryFlows.forEach(d => {
            if (d.to_country_id === selectedCountryId) {
                inflow += d[`flow_${yearSuffix}`] || 0;
            }
            if (d.from_country_id === selectedCountryId) {
                outflow += d[`flow_${yearSuffix}`] || 0;
            }
        });
        return { year: new Date(year, 0, 1), inflow: inflow, outflow: outflow };
    });

    // Plot both inflow and outflow lines
    drawLineChartPlot(yearlyCountryFlows.map(d => ({ year: d.year, total_flow: d.inflow, type: "Inflow" })), `${countryName} - Inflow`, "green");
    drawLineChartPlot(yearlyCountryFlows.map(d => ({ year: d.year, total_flow: d.outflow, type: "Outflow" })), `${countryName} - Outflow`, "red", true); // true to append to existing axes
}


function drawLineChartPlot(data, title, lineColor = "steelblue", append = false) {
    if (!lineChartSvg) return;

    if (data.length === 0) {
        lineChartSvg.append("text")
            .attr("x", lineChartInnerWidth / 2)
            .attr("y", lineChartInnerHeight / 2)
            .attr("text-anchor", "middle")
            .text(title.includes("No data") ? title : "No flow data for selection.");
        // Add axes even if no data, for context, if not appending
        if (!append) {
            const xScale = d3.scaleTime().domain([new Date(1990, 0, 1), new Date(2005, 0, 1)]).range([0, lineChartInnerWidth]);
            const yScale = d3.scaleLinear().domain([0, 1000]).range([lineChartInnerHeight, 0]); // Dummy domain
            lineChartSvg.append("g").attr("transform", `translate(0,${lineChartInnerHeight})`).call(d3.axisBottom(xScale).ticks(d3.timeYear.every(5)).tickFormat(d3.timeFormat("%Y")));
            lineChartSvg.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".2s")));
            addAxisLabelsAndTitle(title);
        }
        return;
    }

    // Update scales only if not appending or if it's the first plot
    if (!append || !lineChartXScale) {
        lineChartXScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.year))
            .range([0, lineChartInnerWidth]);

        lineChartYScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.total_flow) * 1.1 || 10]) // Ensure domain > 0
            .range([lineChartInnerHeight, 0]);

        lineChartSvg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${lineChartInnerHeight})`)
            .call(d3.axisBottom(lineChartXScale).ticks(d3.timeYear.every(5)).tickFormat(d3.timeFormat("%Y")));

        lineChartSvg.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(lineChartYScale).ticks(5).tickFormat(d3.format(".2s")));

        addAxisLabelsAndTitle(title);

    } else {
        // If appending, potentially update Y-axis domain if new data exceeds current
        const currentYMax = lineChartYScale.domain()[1];
        const newYMax = d3.max(data, d => d.total_flow) * 1.1 || 10;
        if (newYMax > currentYMax) {
            lineChartYScale.domain([0, newYMax]);
            lineChartSvg.select(".y-axis").transition().duration(300).call(d3.axisLeft(lineChartYScale).ticks(5).tickFormat(d3.format(".2s")));
        }
        // Update title if appending a new line type
        const baseTitle = title.split(" - ")[0];
        lineChartSvg
            .select(".chart-title")
            .text(`${baseTitle} - In/Outflow`);
    }


    lineChartLine = d3.line()
        .x(d => lineChartXScale(d.year))
        .y(d => lineChartYScale(d.total_flow))
        .defined(d => d.total_flow != null && !isNaN(d.total_flow)); // Handle missing data points

    lineChartSvg.append("path")
        .datum(data)
        .attr("class", "flow-line")
        .attr("fill", "none")
        .attr("stroke", lineColor)
        .attr("stroke-width", 2)
        .attr("d", lineChartLine);

    // Add legend entry if multiple lines
    if (append || title.includes("Inflow") || title.includes("Outflow")) {
        // Get current number of legend items to position new one correctly
        const existingLegendCount = lineChartSvg.selectAll(".legend").size();

        const legend = lineChartSvg.selectAll(".legend").data([data[0].type], d => d); // Use type for key

        legend.enter().append("g")
            .attr("class", "legend")
            .attr("transform", `translate(0, ${existingLegendCount * 20})`) // Position based on existing legend count
            .each(function (d_type) {
                const g = d3.select(this);
                g.append("rect")
                    .attr("x", lineChartInnerWidth - 100) // Adjust position
                    .attr("width", 14) // slightly smaller
                    .attr("height", 14)
                    .style("fill", lineColor);
                g.append("text")
                    .attr("x", lineChartInnerWidth - 82) // Adjust position
                    .attr("y", 7)
                    .attr("dy", ".35em")
                    .style("text-anchor", "start")
                    .style("font-size", "11px") // smaller font for compact legend
                    .text(d_type);
            });
    }
}

function addAxisLabelsAndTitle(titleText) {
    // X Axis Label
    lineChartSvg.append("text")
        .attr("class", "x-axis-label")
        .attr("text-anchor", "middle")
        .attr("x", lineChartInnerWidth / 2)
        .attr("y", lineChartInnerHeight + lineChartMargin.bottom - 20)
        .text("Year");

    // Y Axis Label
    lineChartSvg.append("text")
        .attr("class", "y-axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("y", -lineChartMargin.left + 20)
        .attr("x", -lineChartInnerHeight / 2)
        .text("Migration Flow Volume");

    // Chart Title
    lineChartSvg.append("text")
        .attr("class", "chart-title")
        .attr("x", lineChartInnerWidth / 2)
        .attr("y", -lineChartMargin.top / 2 + 10)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        // .style("text-decoration", "underline")
        .text(titleText);
}
