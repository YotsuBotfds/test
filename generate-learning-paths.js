const fs = require('fs');
const path = require('path');

// Read the guides.json file
const guidesPath = path.join(__dirname, 'data', 'guides.json');
const guides = JSON.parse(fs.readFileSync(guidesPath, 'utf8'));

// Create a map of guides by ID for quick lookup
const guideMap = {};
const guidesByCategory = {};

guides.forEach(guide => {
  guideMap[guide.id] = guide;
  
  // Organize by category
  if (!guidesByCategory[guide.category]) {
    guidesByCategory[guide.category] = [];
  }
  guidesByCategory[guide.category].push(guide);
});

// Define learning paths with their specifications
const learningPathDefinitions = [
  {
    id: 'survival-basics',
    name: 'Survival Basics',
    icon: '🔥',
    description: 'Master essential survival skills including water sourcing, fire starting, shelter building, navigation, and first aid.',
    difficulty: 'beginner',
    categories: ['survival'],
    specificGuides: ['GD-023', 'SUR-01', 'SUR-02', 'GD-035', 'SUR-03', 'GD-232'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'homestead-agriculture',
    name: 'Homestead & Agriculture',
    icon: '🌾',
    description: 'Learn to grow food, preserve harvests, and establish sustainable agricultural practices for long-term food security.',
    difficulty: 'beginner',
    categories: ['agriculture', 'food'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'medical-fundamentals',
    name: 'Medical Fundamentals',
    icon: '🏥',
    description: 'Build comprehensive medical knowledge from basic first aid through advanced field surgery and pharmaceutical production.',
    difficulty: 'intermediate',
    categories: ['medical'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'crafts-and-making',
    name: 'Crafts & Making',
    icon: '🔨',
    description: 'Develop practical crafting skills including woodworking, metalworking, and specialized tool manufacturing.',
    difficulty: 'intermediate',
    categories: ['crafts', 'metalworking', 'tools'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'building-and-construction',
    name: 'Building & Construction',
    icon: '🏗️',
    description: 'Master structural engineering and construction techniques from basic shelter to advanced building projects.',
    difficulty: 'intermediate',
    categories: ['construction', 'building'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'power-and-communications',
    name: 'Power & Communications',
    icon: '⚡',
    description: 'Generate and distribute electrical power, communicate across distances, and build critical infrastructure systems.',
    difficulty: 'advanced',
    categories: ['power-generation', 'communications', 'sciences'],
    specificGuides: ['GD-160', 'GD-230', 'GD-222', 'GD-139'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'community-building',
    name: 'Community Building',
    icon: '👥',
    description: 'Build resilient communities through resource management, social systems, and collaborative problem-solving.',
    difficulty: 'intermediate',
    categories: ['society', 'resource-management', 'community'],
    minGuides: 8,
    maxGuides: 15
  },
  {
    id: 'advanced-sciences',
    name: 'Advanced Sciences',
    icon: '🔬',
    description: 'Explore advanced scientific knowledge including chemistry, physics, and specialized technical skills for complex problems.',
    difficulty: 'advanced',
    categories: ['sciences', 'chemistry'],
    minGuides: 8,
    maxGuides: 15
  }
];

// Generate learning paths
const learningPaths = learningPathDefinitions.map(pathDef => {
  let selectedGuides = [];
  
  // First, add specific guides if they exist
  if (pathDef.specificGuides) {
    selectedGuides = pathDef.specificGuides.filter(id => guideMap[id]);
  }
  
  // Then find additional guides from specified categories
  const candidateGuides = pathDef.categories
    .flatMap(cat => guidesByCategory[cat] || [])
    .filter(guide => !selectedGuides.includes(guide.id));
  
  // Sort by difficulty and reading time to get a balanced mix
  candidateGuides.sort((a, b) => {
    const difficultyOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    const diffA = difficultyOrder[a.difficulty] || 0;
    const diffB = difficultyOrder[b.difficulty] || 0;
    
    if (diffA !== diffB) return diffA - diffB;
    return (a.readingTime || 0) - (b.readingTime || 0);
  });
  
  // Add guides to reach the target range
  const neededCount = Math.min(
    pathDef.maxGuides,
    Math.max(pathDef.minGuides, selectedGuides.length + (pathDef.maxGuides - selectedGuides.length))
  );
  
  while (selectedGuides.length < neededCount && candidateGuides.length > 0) {
    selectedGuides.push(candidateGuides.shift().id);
  }
  
  // Calculate total reading time in hours
  let totalMinutes = 0;
  selectedGuides.forEach(guideId => {
    const guide = guideMap[guideId];
    if (guide && guide.readingTime) {
      totalMinutes += guide.readingTime;
    }
  });
  
  const estimatedHours = Math.round((totalMinutes / 60) * 10) / 10; // Round to 1 decimal place
  
  return {
    id: pathDef.id,
    name: pathDef.name,
    icon: pathDef.icon,
    description: pathDef.description,
    difficulty: pathDef.difficulty,
    guides: selectedGuides.slice(0, pathDef.maxGuides),
    estimatedHours: estimatedHours
  };
});

// Write the output file
const outputPath = path.join(__dirname, 'data', 'learning-paths.json');
fs.writeFileSync(outputPath, JSON.stringify(learningPaths, null, 2));

// Print summary
console.log('Learning paths generated successfully!');
console.log(`\nGenerated ${learningPaths.length} learning paths:`);
learningPaths.forEach(path => {
  console.log(`  - ${path.id} (${path.difficulty}): ${path.guides.length} guides, ${path.estimatedHours} hours`);
});

// Validate the output
console.log('\n✓ Output written to:', outputPath);
console.log('✓ JSON is valid:', JSON.stringify(learningPaths).length, 'bytes');
