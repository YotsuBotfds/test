const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat,
        HeadingLevel, BorderStyle, WidthType, ShadingType,
        PageNumber, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const lightBorder = { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" };
const lightBorders = { top: lightBorder, bottom: lightBorder, left: lightBorder, right: lightBorder };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "2D3748", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })]
  });
}

function cell(text, width, opts = {}) {
  const runs = [];
  if (opts.bold) {
    runs.push(new TextRun({ text, bold: true, font: "Arial", size: 20, color: opts.color || "333333" }));
  } else {
    runs.push(new TextRun({ text, font: "Arial", size: 20, color: opts.color || "333333" }));
  }
  return new TableCell({
    borders: lightBorders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ children: runs })]
  });
}

function multiLineCell(lines, width, opts = {}) {
  const children = lines.map(line => {
    if (typeof line === 'string') {
      return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, font: "Arial", size: 18, color: "444444" })] });
    }
    return new Paragraph({ spacing: { after: 40 }, children: [
      new TextRun({ text: line.label, bold: true, font: "Arial", size: 18, color: "333333" }),
      new TextRun({ text: line.value, font: "Arial", size: 18, color: "444444" })
    ]});
  });
  return new TableCell({
    borders: lightBorders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children
  });
}

// --- Guide definitions ---
const guides = [
  // Priority 1
  {
    id: "GD-256", title: "Urban Scavenging: Location-by-Location Guide",
    file: "urban-scavenging-guide.html", difficulty: "intermediate", priority: "1 - Critical",
    readTime: "25 min", wordCount: "~5,000",
    description: "Systematic urban salvage covering automotive, hospitals, hardware stores, offices, restaurants, industrial, fire stations, construction sites, and residential targets.",
    sections: "Automotive & Dealerships, Hospitals & Pharmacies, Hardware & Home Improvement, Office Buildings & Schools, Restaurants & Commercial Kitchens, Manufacturing & Industrial, Fire Stations, Construction Sites, Residential, Sweep Methodology, Structural Safety, Hazmat Avoidance, Marking & Cataloging, Transport Logistics",
    prereqs: "GD-181 (Scrap Metal ID)",
    tags: "new, essential, rebuild"
  },
  {
    id: "GD-257", title: "Rural Scavenging: Location-by-Location Guide",
    file: "rural-scavenging-guide.html", difficulty: "intermediate", priority: "1 - Critical",
    readTime: "25 min", wordCount: "~5,000",
    description: "Rural salvage strategy covering farms, feed stores, sawmills, hunting/sporting goods, community buildings, grain elevators, rural power infrastructure, waterways, and abandoned mines.",
    sections: "Farms & Ranches, Rural Hardware & Feed Stores, Sawmills & Lumber Yards, Hunting & Sporting Goods, Churches & Community Buildings, Grain Elevators & Silos, Rural Power Infrastructure, Waterways & Ponds, Abandoned Mines & Quarries, Property Assessment, Transport Challenges, Seasonal Access, Animal Hazards, Chemical Hazards",
    prereqs: "GD-181 (Scrap Metal ID)",
    tags: "new, essential, rebuild"
  },
  {
    id: "GD-258", title: "Salvage-to-Skill Progression Shortcuts",
    file: "salvage-progression-shortcuts.html", difficulty: "beginner", priority: "1 - Critical",
    readTime: "15 min", wordCount: "~3,000",
    description: "Maps found items to skill-tree shortcuts. If you find X, you can skip Y weeks of primitive manufacturing. Priority tiers, environment-specific versions, and degradation timelines.",
    sections: "The Shortcut Concept, Salvage-to-Skill Mapping Table, Priority Tiers (by time saved), Urban Shortcuts, Rural Shortcuts, Degradation Timeline (month 1 vs month 12 viability), Integration with Learning Paths",
    prereqs: "None",
    tags: "new, essential, critical"
  },
  // Priority 2
  {
    id: "GD-259", title: "Building Materials Salvage & Recovery",
    file: "building-materials-salvage.html", difficulty: "intermediate", priority: "2 - Important",
    readTime: "18 min", wordCount: "~3,600",
    description: "Lumber recovery, brick reclamation, roofing materials, window glass, insulation, doors, and fixtures. Bridges the gap between shelter/construction guides and salvage.",
    sections: "Lumber Recovery (denailing, grading, storage), Brick & Masonry Reclamation, Roofing Materials, Window Glass Salvage, Insulation Types & Reuse, Doors, Fixtures & Hardware, Quality Assessment, Structural Demolition Safety",
    prereqs: "GD-256 or GD-257 (Urban/Rural Scavenging)",
    tags: "new, rebuild"
  },
  {
    id: "GD-260", title: "Food Salvage & Shelf Life Assessment",
    file: "food-salvage-shelf-life.html", difficulty: "beginner", priority: "2 - Important",
    readTime: "14 min", wordCount: "~2,800",
    description: "Evaluating salvaged food safety: canned goods shelf life, dry goods viability, frozen food timelines, MRE identification, pet food as emergency calories, supplements and vitamins.",
    sections: "Canned Goods Assessment, Dry Goods Viability (flour, rice, pasta), Frozen Food Timeline, Condiment & Spice Value, Pet Food as Emergency Calories, Supplement & Vitamin Recovery, MRE & Emergency Ration ID, Storage Conditions & Contamination Signs",
    prereqs: "None",
    tags: "new, essential, critical"
  },
  {
    id: "GD-261", title: "Time-Decay Priority Framework",
    file: "salvage-time-decay-priorities.html", difficulty: "beginner", priority: "2 - Important",
    readTime: "12 min", wordCount: "~2,400",
    description: "What degrades and when. Expands the existing salvage_variants_master.json priority system into a full guide with degradation timelines from days to decades.",
    sections: "Degradation Timeline Overview, Immediate (days): Food, Medicines, Batteries, Weeks: Fuel, Open Chemicals, Months: Seeds, Rubber, Exposed Metal, Years: Canned Food, Sealed Electronics, Tools, Decades: Stone, Quality Steel, Precious Metals, Seasonal Scavenging Calendar, Decision Matrix (when to scavenge what)",
    prereqs: "None",
    tags: "new, essential"
  },
  {
    id: "GD-262", title: "Chemical & Fuel Salvage Safety",
    file: "chemical-fuel-salvage.html", difficulty: "advanced", priority: "2 - Important",
    readTime: "16 min", wordCount: "~3,200",
    description: "Safe siphoning, storage, and identification of salvaged fuels and chemicals. Cleaning products, paints, solvents, lubricants, fertilizers.",
    sections: "Fuel Siphoning Safety, Fuel Degradation & Stabilization, Chemical Identification (labels, MSDS), Cleaning Product Chemistry, Paint & Solvent Recovery, Lubricant Types & Substitutability, Fertilizer & Soil Amendments, Storage & Compatibility, Hazard Recognition & First Aid",
    prereqs: "None",
    tags: "new, rebuild"
  },
  // Priority 3
  {
    id: "GD-263", title: "Textile & Fabric Salvage",
    file: "textile-fabric-salvage.html", difficulty: "beginner", priority: "3 - Valuable",
    readTime: "12 min", wordCount: "~2,400",
    description: "Clothing recovery, upholstery, cordage from fabric, natural fiber ID, leather salvage from shoes/belts/furniture.",
    sections: "Clothing Recovery & Repurposing, Upholstery & Curtain Fabric, Cordage from Fabric Strips, Natural vs Synthetic Fiber ID, Leather Salvage, Bedding & Insulation Materials, Fabric Condition Assessment",
    prereqs: "None",
    tags: "new"
  },
  {
    id: "GD-264", title: "Tool Restoration from Salvage",
    file: "tool-restoration-salvage.html", difficulty: "intermediate", priority: "3 - Valuable",
    readTime: "15 min", wordCount: "~3,000",
    description: "Evaluating and restoring salvaged hand tools. Rust removal, handle replacement, sharpening, power tool motor assessment, improvised tools from scrap.",
    sections: "Evaluating Salvaged Hand Tools, Rust Removal & Prevention, Handle Replacement (wood, composite), Sharpening (axes, saws, chisels, knives), Power Tool Motor Assessment, Improvised Tool Creation from Salvage, Tool Steel Identification",
    prereqs: "GD-181 (Scrap Metal ID)",
    tags: "new, rebuild"
  },
  {
    id: "GD-265", title: "Plastics, Rubber & Glass Identification",
    file: "plastics-rubber-glass-salvage.html", difficulty: "beginner", priority: "3 - Valuable",
    readTime: "13 min", wordCount: "~2,600",
    description: "Plastic type identification by recycling number, heat-formable vs toxic plastics, rubber salvage, glass cutting and reuse, optical glass recovery.",
    sections: "Plastic Type ID (recycling numbers 1-7), Heat-Formable vs Dangerous Plastics, Rubber Salvage (tires, hoses, gaskets), Container Food-Safety Assessment, Flat Glass Cutting & Reuse, Bottle Glass Reuse vs Melting Stock, Optical Glass (cameras, binoculars, projectors), Laboratory Glassware",
    prereqs: "None",
    tags: "new"
  },
  {
    id: "GD-266", title: "Scavenging Logistics & Team Operations",
    file: "scavenging-logistics-team-ops.html", difficulty: "intermediate", priority: "3 - Valuable",
    readTime: "14 min", wordCount: "~2,800",
    description: "Cart/sled construction, staging areas, site mapping and cataloging, team coordination, weight estimation, communication protocols.",
    sections: "Cart & Sled Construction for Hauling, Staging Area Setup, Mapping & Cataloging Salvage Sites, Team Roles & Communication, Weight Estimation for Trip Planning, Load Prioritization, Route Planning & Security, Record Keeping & Inventory",
    prereqs: "GD-256 or GD-257 (Urban/Rural Scavenging)",
    tags: "new"
  },
  {
    id: "GD-267", title: "Structural Safety for Building Entry",
    file: "structural-safety-building-entry.html", difficulty: "intermediate", priority: "3 - Valuable",
    readTime: "12 min", wordCount: "~2,400",
    description: "Load-bearing wall identification, collapse risk assessment, hazmat avoidance (asbestos, lead, gas leaks), safe entry and exit protocols.",
    sections: "Load-Bearing Wall Identification, Structural Damage Assessment, Floor & Roof Integrity Testing, Hazmat Recognition (asbestos, lead paint, gas, sewage), Entry & Exit Protocols, Emergency Procedures, Tools for Safe Entry, Building Type Risk Profiles",
    prereqs: "None",
    tags: "new, critical"
  }
];

// --- Build the document ---
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1A365D" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2D3748" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "4A5568" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } }
      ]},
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "implementSteps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
    ]
  },
  sections: [
    // --- COVER / TITLE SECTION ---
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
          new TextRun({ text: "Zero to Hero Survival Compendium", font: "Arial", size: 16, color: "999999", italics: true })
        ]})] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "Page ", font: "Arial", size: 16, color: "999999" }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" })
        ]})] })
      },
      children: [
        new Paragraph({ spacing: { before: 2400 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "CONTENT UPGRADE PLAN", font: "Arial", size: 44, bold: true, color: "1A365D" })
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
          new TextRun({ text: "Scavenging & Salvage Category Expansion", font: "Arial", size: 28, color: "4A5568" })
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
          new TextRun({ text: "\u267B\uFE0F", size: 72 })
        ]}),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [
          new TextRun({ text: "Zero to Hero Survival Compendium", font: "Arial", size: 22, color: "718096" })
        ]}),

        // Summary box
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: { style: BorderStyle.SINGLE, size: 3, color: "2D3748" }, bottom: { style: BorderStyle.SINGLE, size: 3, color: "2D3748" }, left: { style: BorderStyle.SINGLE, size: 3, color: "2D3748" }, right: { style: BorderStyle.SINGLE, size: 3, color: "2D3748" } },
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "EDF2F7", type: ShadingType.CLEAR },
              margins: { top: 200, bottom: 200, left: 300, right: 300 },
              children: [
                new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Plan Summary", font: "Arial", size: 24, bold: true, color: "1A365D" })] }),
                new Paragraph({ spacing: { after: 80 }, children: [
                  new TextRun({ text: "Current state: ", bold: true, font: "Arial", size: 20, color: "333333" }),
                  new TextRun({ text: "4 guides (GD-181, GD-182, GD-183, GD-234) focused on technical processing", font: "Arial", size: 20, color: "555555" })
                ]}),
                new Paragraph({ spacing: { after: 80 }, children: [
                  new TextRun({ text: "Proposed additions: ", bold: true, font: "Arial", size: 20, color: "333333" }),
                  new TextRun({ text: "12 new guides (GD-256 through GD-267)", font: "Arial", size: 20, color: "555555" })
                ]}),
                new Paragraph({ spacing: { after: 80 }, children: [
                  new TextRun({ text: "Total word count: ", bold: true, font: "Arial", size: 20, color: "333333" }),
                  new TextRun({ text: "~38,200 words (~191 min reading time)", font: "Arial", size: 20, color: "555555" })
                ]}),
                new Paragraph({ spacing: { after: 80 }, children: [
                  new TextRun({ text: "Core gap addressed: ", bold: true, font: "Arial", size: 20, color: "333333" }),
                  new TextRun({ text: "Sourcing strategy (where to go, what to prioritize) vs. only technical processing (what to do once you have it)", font: "Arial", size: 20, color: "555555" })
                ]}),
                new Paragraph({ children: [
                  new TextRun({ text: "Category: ", bold: true, font: "Arial", size: 20, color: "333333" }),
                  new TextRun({ text: "salvage (already exists \u2014 no new category setup needed)", font: "Arial", size: 20, color: "555555" })
                ]}),
              ]
            })
          ]})]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // --- SECTION 1: GAP ANALYSIS SUMMARY ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Gap Analysis Summary")] }),
        new Paragraph({ spacing: { after: 200 }, children: [
          new TextRun({ text: "The existing salvage category has strong coverage of technical processing (what to do with salvage once obtained) but almost no coverage of sourcing strategy (where to go, what to look for, and how environment type changes priorities). The content gap analysis identified five major gaps:", font: "Arial", size: 22, color: "333333" })
        ]}),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1200, 3000, 2800, 2360],
          rows: [
            new TableRow({ children: [
              headerCell("Gap", 1200), headerCell("Topic", 3000), headerCell("Key Issue", 2800), headerCell("Priority", 2360)
            ]}),
            new TableRow({ children: [
              cell("1", 1200), cell("Urban Scavenging", 3000), cell("No location-by-location urban strategy exists", 2800), cell("Critical", 2360, { color: "C53030", bold: true })
            ]}),
            new TableRow({ children: [
              cell("2", 1200, { fill: "F7FAFC" }), cell("Rural Scavenging", 3000, { fill: "F7FAFC" }), cell("No rural-specific salvage content at all", 2800, { fill: "F7FAFC" }), cell("Critical", 2360, { fill: "F7FAFC", color: "C53030", bold: true })
            ]}),
            new TableRow({ children: [
              cell("3", 1200), cell("Cross-Environment Topics", 3000), cell("Building materials, textiles, food, tools, plastics, glass, logistics all missing", 2800), cell("Important", 2360, { color: "C05621", bold: true })
            ]}),
            new TableRow({ children: [
              cell("4", 1200, { fill: "F7FAFC" }), cell("Progression Shortcuts", 3000, { fill: "F7FAFC" }), cell("No link between found items and skill-tree acceleration", 2800, { fill: "F7FAFC" }), cell("Critical", 2360, { fill: "F7FAFC", color: "C53030", bold: true })
            ]}),
            new TableRow({ children: [
              cell("5", 1200), cell("Time-Decay Prioritization", 3000), cell("Partial data in JSON but no user-facing guide", 2800), cell("Important", 2360, { color: "C05621", bold: true })
            ]}),
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // --- SECTION 2: PROPOSED GUIDES ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. Proposed New Guides")] }),
        new Paragraph({ spacing: { after: 200 }, children: [
          new TextRun({ text: "Twelve new guides organized across three priority tiers. All use the existing salvage category (ID: salvage). Guide IDs continue from the current maximum of GD-255.", font: "Arial", size: 22, color: "333333" })
        ]}),

        // Priority 1
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Priority 1 \u2014 Critical (3 guides)")] }),
        new Paragraph({ spacing: { after: 160 }, children: [
          new TextRun({ text: "These fill the biggest gaps and have the highest impact on the app\u2019s usefulness. They should be created first.", font: "Arial", size: 22, color: "555555" })
        ]}),

        // Guide detail tables for P1
        ...guides.filter(g => g.priority.startsWith("1")).flatMap(g => [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2400, 6960],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: "FED7D7", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, columnSpan: 2,
                  children: [new Paragraph({ children: [
                    new TextRun({ text: `${g.id}: ${g.title}`, bold: true, font: "Arial", size: 22, color: "1A365D" })
                  ]})]
                }),
              ]}),
              new TableRow({ children: [
                cell("File", 2400, { bold: true }), cell(`guides/${g.file}`, 6960)
              ]}),
              new TableRow({ children: [
                cell("Difficulty", 2400, { bold: true, fill: "F7FAFC" }), cell(g.difficulty, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Read Time / Words", 2400, { bold: true }), cell(`${g.readTime} / ${g.wordCount}`, 6960)
              ]}),
              new TableRow({ children: [
                cell("Prerequisites", 2400, { bold: true, fill: "F7FAFC" }), cell(g.prereqs, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Tags", 2400, { bold: true }), cell(g.tags, 6960)
              ]}),
              new TableRow({ children: [
                cell("Description", 2400, { bold: true, fill: "F7FAFC" }), cell(g.description, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Sections", 2400, { bold: true }), cell(g.sections, 6960)
              ]}),
            ]
          }),
          new Paragraph({ spacing: { after: 240 } }),
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // Priority 2
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Priority 2 \u2014 Important (4 guides)")] }),
        new Paragraph({ spacing: { after: 160 }, children: [
          new TextRun({ text: "Supporting content that rounds out the category. Should follow Priority 1 guides.", font: "Arial", size: 22, color: "555555" })
        ]}),

        ...guides.filter(g => g.priority.startsWith("2")).flatMap(g => [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2400, 6960],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: "FEEBC8", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, columnSpan: 2,
                  children: [new Paragraph({ children: [
                    new TextRun({ text: `${g.id}: ${g.title}`, bold: true, font: "Arial", size: 22, color: "1A365D" })
                  ]})]
                }),
              ]}),
              new TableRow({ children: [
                cell("File", 2400, { bold: true }), cell(`guides/${g.file}`, 6960)
              ]}),
              new TableRow({ children: [
                cell("Difficulty", 2400, { bold: true, fill: "F7FAFC" }), cell(g.difficulty, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Read Time / Words", 2400, { bold: true }), cell(`${g.readTime} / ${g.wordCount}`, 6960)
              ]}),
              new TableRow({ children: [
                cell("Prerequisites", 2400, { bold: true, fill: "F7FAFC" }), cell(g.prereqs, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Tags", 2400, { bold: true }), cell(g.tags, 6960)
              ]}),
              new TableRow({ children: [
                cell("Description", 2400, { bold: true, fill: "F7FAFC" }), cell(g.description, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Sections", 2400, { bold: true }), cell(g.sections, 6960)
              ]}),
            ]
          }),
          new Paragraph({ spacing: { after: 240 } }),
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // Priority 3
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Priority 3 \u2014 Valuable (5 guides)")] }),
        new Paragraph({ spacing: { after: 160 }, children: [
          new TextRun({ text: "Targeted additions that complete the category\u2019s coverage of specific material types and operational logistics.", font: "Arial", size: 22, color: "555555" })
        ]}),

        ...guides.filter(g => g.priority.startsWith("3")).flatMap(g => [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2400, 6960],
            rows: [
              new TableRow({ children: [
                new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: "C6F6D5", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, columnSpan: 2,
                  children: [new Paragraph({ children: [
                    new TextRun({ text: `${g.id}: ${g.title}`, bold: true, font: "Arial", size: 22, color: "1A365D" })
                  ]})]
                }),
              ]}),
              new TableRow({ children: [
                cell("File", 2400, { bold: true }), cell(`guides/${g.file}`, 6960)
              ]}),
              new TableRow({ children: [
                cell("Difficulty", 2400, { bold: true, fill: "F7FAFC" }), cell(g.difficulty, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Read Time / Words", 2400, { bold: true }), cell(`${g.readTime} / ${g.wordCount}`, 6960)
              ]}),
              new TableRow({ children: [
                cell("Prerequisites", 2400, { bold: true, fill: "F7FAFC" }), cell(g.prereqs, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Tags", 2400, { bold: true }), cell(g.tags, 6960)
              ]}),
              new TableRow({ children: [
                cell("Description", 2400, { bold: true, fill: "F7FAFC" }), cell(g.description, 6960, { fill: "F7FAFC" })
              ]}),
              new TableRow({ children: [
                cell("Sections", 2400, { bold: true }), cell(g.sections, 6960)
              ]}),
            ]
          }),
          new Paragraph({ spacing: { after: 240 } }),
        ]),

        new Paragraph({ children: [new PageBreak()] }),

        // --- SECTION 3: guides.json ENTRIES ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Data Layer: guides.json Entries")] }),
        new Paragraph({ spacing: { after: 200 }, children: [
          new TextRun({ text: "Each new guide requires an entry in data/guides.json. Below is the complete set of entries ready to be appended. All use category \"salvage\", icon \"\u267B\uFE0F\", and the \"new\" tag for the What\u2019s New section.", font: "Arial", size: 22, color: "333333" })
        ]}),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [900, 3200, 1400, 1100, 1000, 1760],
          rows: [
            new TableRow({ children: [
              headerCell("ID", 900), headerCell("Title", 3200), headerCell("Difficulty", 1400),
              headerCell("Read", 1100), headerCell("Words", 1000), headerCell("File", 1760)
            ]}),
            ...guides.map((g, i) => new TableRow({ children: [
              cell(g.id, 900, { bold: true, fill: i % 2 ? "F7FAFC" : undefined }),
              cell(g.title, 3200, { fill: i % 2 ? "F7FAFC" : undefined }),
              cell(g.difficulty, 1400, { fill: i % 2 ? "F7FAFC" : undefined }),
              cell(g.readTime, 1100, { fill: i % 2 ? "F7FAFC" : undefined }),
              cell(g.wordCount, 1000, { fill: i % 2 ? "F7FAFC" : undefined }),
              cell(g.file.replace('.html',''), 1760, { fill: i % 2 ? "F7FAFC" : undefined }),
            ]}))
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // --- SECTION 4: IMPLEMENTATION STEPS ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Implementation Checklist")] }),
        new Paragraph({ spacing: { after: 200 }, children: [
          new TextRun({ text: "Based on the new-topic skill workflow. Since the salvage category already exists in cards.js, progress-viz.js, index.html, and new-guide.js, those setup steps are already complete. The remaining steps for each guide are:", font: "Arial", size: 22, color: "333333" })
        ]}),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Per-Guide Steps")] }),

        ...[
          "Add guide entry to data/guides.json with correct ID, title, category (\"salvage\"), tags, description, icon, file path, difficulty, readingTime, wordCount, lastUpdated, and version.",
          "Create the HTML guide file in guides/ using the scaffolding script: node scripts/new-guide.js \"Title\" --category=salvage --difficulty=<level> --icon=\u267B\uFE0F",
          "Write the full guide content following existing conventions: info-box callouts, step-by-step procedures, semantic HTML, practical and actionable information.",
          "Estimate and update readingTime (~200 words/min) and wordCount in the guides.json entry."
        ].map(text => new Paragraph({
          numbering: { reference: "steps", level: 0 },
          spacing: { after: 100 },
          children: [new TextRun({ text, font: "Arial", size: 22, color: "333333" })]
        })),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("After All Guides Are Created")] }),

        ...[
          "Bump CACHE_VERSION in sw.js from v15 to v16 (forces browsers to re-cache).",
          "Rebuild search index: node scripts/build-search-index.js",
          "Run validation: node scripts/validate.js",
          "Full build: npm run build",
          "Add a category achievement in js/achievements.js (optional but recommended \u2014 the salvage category may already have one; verify before adding a duplicate).",
          "Verify: TOC links work, cards render under correct section, search finds new guides, theme toggle and Mark as Read function on each new guide page, progress visualization shows correct count."
        ].map(text => new Paragraph({
          numbering: { reference: "implementSteps", level: 0 },
          spacing: { after: 100 },
          children: [new TextRun({ text, font: "Arial", size: 22, color: "333333" })]
        })),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun("Already Complete (No Action Needed)")] }),
        new Paragraph({ spacing: { after: 120 }, children: [
          new TextRun({ text: "These steps from the new-topic skill are already done for the salvage category:", font: "Arial", size: 22, color: "555555" })
        ]}),

        ...[
          "cards.js \u2014 getCategoryDisplay() map and categoryOrder[] already include \"salvage\"",
          "progress-viz.js \u2014 categoryColors (#9ca3af), getCategoryName() (\"Scavenging & Salvage\"), getCategoryIcon() (\u267B\uFE0F), and categoryOrder[] all set",
          "index.html \u2014 TOC grid already has the salvage entry",
          "scripts/new-guide.js \u2014 categoryIcons already has salvage mapped",
        ].map(text => new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
          children: [new TextRun({ text, font: "Arial", size: 20, color: "555555" })]
        })),

        new Paragraph({ children: [new PageBreak()] }),

        // --- SECTION 5: CROSS-REFERENCES ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Cross-References & Dependencies")] }),
        new Paragraph({ spacing: { after: 200 }, children: [
          new TextRun({ text: "New guides should link to relevant existing content and to each other. Key relationships:", font: "Arial", size: 22, color: "333333" })
        ]}),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3100, 3100, 3160],
          rows: [
            new TableRow({ children: [
              headerCell("New Guide", 3100), headerCell("Links To (Existing)", 3100), headerCell("Links To (New)", 3160)
            ]}),
            ...[
              ["GD-256 Urban Scavenging", "GD-181 Scrap Metal ID\nGD-234 PCB Salvage", "GD-258 Progression Shortcuts\nGD-261 Time-Decay\nGD-267 Structural Safety"],
              ["GD-257 Rural Scavenging", "GD-181 Scrap Metal ID\nGD-183 Alternator Repurposing", "GD-258 Progression Shortcuts\nGD-261 Time-Decay\nGD-262 Chemical/Fuel"],
              ["GD-258 Progression Shortcuts", "Learning paths, skill tree, all existing salvage guides", "GD-256 Urban, GD-257 Rural\nGD-261 Time-Decay"],
              ["GD-259 Building Materials", "Construction guides (building category)", "GD-256 Urban, GD-257 Rural\nGD-267 Structural Safety"],
              ["GD-260 Food Salvage", "Agriculture, food preservation guides", "GD-261 Time-Decay"],
              ["GD-262 Chemical/Fuel", "Chemistry guides, alkali production", "GD-256 Urban, GD-257 Rural"],
              ["GD-264 Tool Restoration", "GD-181 Scrap Metal ID, blacksmithing", "GD-256 Urban, GD-257 Rural"],
            ].map((row, i) => new TableRow({ children: [
              cell(row[0], 3100, { fill: i % 2 ? "F7FAFC" : undefined }),
              cell(row[1], 3100, { fill: i % 2 ? "F7FAFC" : undefined }),
              cell(row[2], 3160, { fill: i % 2 ? "F7FAFC" : undefined }),
            ]}))
          ]
        }),

        new Paragraph({ spacing: { before: 400 } }),

        // --- SECTION 6: DATA FILE UPDATES ---
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. Data File Considerations")] }),
        new Paragraph({ spacing: { after: 160 }, children: [
          new TextRun({ text: "Two existing data files relate to salvage content and should be updated alongside the new guides:", font: "Arial", size: 22, color: "333333" })
        ]}),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("salvage_data.json")] }),
        new Paragraph({ spacing: { after: 120 }, children: [
          new TextRun({ text: "Currently tracks 10 skills with salvage impact scores. New guides (especially GD-258 Progression Shortcuts) should reference and potentially extend this data with new skill-to-salvage mappings.", font: "Arial", size: 22, color: "555555" })
        ]}),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("salvage_variants_master.json")] }),
        new Paragraph({ spacing: { after: 120 }, children: [
          new TextRun({ text: "Contains the priority framework (first 24hr/week/month), climate adaptations (plains only), and transition paths. GD-261 (Time-Decay Priority Framework) expands this into a user-facing guide. Consider adding climate variants beyond plains and linking the guide back to this data source.", font: "Arial", size: 22, color: "555555" })
        ]}),

      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/amazing-loving-turing/mnt/mulligan/Scavenging_Content_Upgrade_Plan.docx", buffer);
  console.log("Document created successfully");
});
