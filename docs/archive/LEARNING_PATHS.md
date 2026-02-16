# Learning Paths System

## Overview

A comprehensive learning path system has been implemented to guide users through structured learning journeys in the Survival App. The system provides 8 distinct learning tracks organized by topic and difficulty level.

## Files Created/Modified

### 1. Data Files

#### `/data/learning-paths.json` (NEW)
Defines all available learning paths with:
- Path metadata (id, name, description, icon, difficulty)
- Ordered guide sequences
- Estimated reading times

Structure:
```json
{
  "id": "path-id",
  "name": "Path Name",
  "description": "Comprehensive description",
  "icon": "🎯",
  "difficulty": "beginner|intermediate|advanced",
  "guides": ["GD-001", "GD-002", ...],
  "estimatedHours": 120
}
```

### 2. JavaScript Module

#### `/js/learning-paths.js` (NEW)
ES6 module providing:

**Core Functions:**
- `init()` - Initialize the learning paths system
- `getAllPathsWithProgress()` - Get all paths with user progress
- `getPathProgress(pathId)` - Get progress for specific path
- `getRecommendedPath()` - Get starter recommendation
- `getPathGuides(pathId)` - Get guides in a path with progress
- `showPathDetails(pathId)` - Display path details
- `hidePathDetails()` - Return to paths list
- `renderLearningPathsSection()` - Render UI on page

**Internal Functions:**
- `fetchLearningPaths()` - Load learning paths data
- `fetchGuides()` - Load guides data
- `getGuideInfo(guideId)` - Look up guide by ID
- `createPathCardHTML(path)` - Generate path card HTML
- `createPathDetailsHTML(pathId)` - Generate details view HTML
- `attachEventListeners()` - Bind UI interactions

### 3. Styling

#### `/css/main.css` (MODIFIED)
Added 450+ lines of CSS including:

**Sections:**
- `.learning-paths-section` - Main container
- `.learning-paths-grid` - Responsive card grid
- `.learning-path-card` - Individual path cards
- `.start-here-recommendation` - Beginner recommendation
- `.path-details` - Expanded path view
- `.guides-list` - Sequential guide list
- `.path-guide-item` - Individual guide in path

**Features:**
- Responsive design (mobile-first)
- Dark/light theme support
- Smooth transitions and hover effects
- Progress visualization with animated bars
- Difficulty badges (beginner/intermediate/advanced)
- Color-coded guide completion status

### 4. Application Integration

#### `/js/app.js` (MODIFIED)
Updated to:
1. Import learning-paths module: `import * as learningPaths from './learning-paths.js'`
2. Initialize early in app startup: `await learningPaths.init()`

## Learning Paths

### 1. Survival Basics (🏕️)
**Difficulty:** Beginner  
**Guides:** 6 | **Time:** ~60 hours

Essential first-week survival skills covering water, fire, shelter, food, first-aid, and sanitation.

**Guides:**
- SUR-01: Water Purification
- SUR-02: Fire Starting
- CON-01: Shelter Building
- SUR-05: Sanitation & Hygiene
- FOD-05: Food Foraging
- GD-232: First Aid and Emergency Response

### 2. Food Production (🌾)
**Difficulty:** Intermediate  
**Guides:** 12 | **Time:** ~155 hours

Learn to grow, raise, hunt, harvest, and preserve food for long-term self-sufficiency.

**Guides:**
- FOD-03: Agriculture Basics
- GD-064: Agriculture & Gardening
- GD-065: Food Preservation
- FOD-04: Animal Husbandry
- GD-067: Animal Husbandry & Veterinary
- FOD-05: Food Foraging
- GD-025: Foraging, Hunting & Fishing
- FOD-02: Trapping & Hunting
- GD-070: Beekeeping & Apiculture
- GD-068: Aquaculture & Fish Farming
- GD-075: Butchering & Meat Processing
- GD-089: Food Rationing & Nutrition

### 3. Medical & Health (⚕️)
**Difficulty:** Intermediate  
**Guides:** 13 | **Time:** ~125 hours

Develop medical knowledge for diagnosis, treatment, and prevention without modern healthcare systems.

**Guides:**
- GD-232: First Aid and Emergency Response
- SUR-03: Herbal Medicine
- GD-034: Herbalism & Medicinal Plants
- GD-040: Herbal Antibiotics & Natural Medicine
- GD-032: Medical & Survival Medicine
- GD-039: Field Surgery & Emergency Procedures
- GD-033: Dentistry & Midwifery
- GD-041: Midwifery & Childbirth
- GD-049: Orthopedics & Fracture Management
- GD-047: Emergency Dental Procedures
- GD-050: Anesthesia & Pain Management
- GD-235: Infection Control
- GD-243: Nutrition Science & Deficiency Diseases

### 4. Crafts & Manufacturing (🔨)
**Difficulty:** Intermediate  
**Guides:** 14 | **Time:** ~108 hours

Master practical crafts and manufacturing techniques for everyday items.

**Guides:**
- CRA-06: Knot Tying & Rigging
- CRA-01: Forging & Metalwork
- GD-120: Metalworking & Blacksmithing
- CRA-02: Pottery & Ceramics
- GD-103: Pottery & Ceramics
- CRA-03: Cordage & Textiles
- CRA-05: Weaving & Textiles
- GD-121: Textiles & Fiber Arts
- CRA-04: Soap Making
- GD-129: Soap & Candle Making
- CRA-07: Primitive Weapons
- GD-126: Leather Tanning & Leatherworking
- GD-128: Basketry, Cordage & Fiber Crafts
- GD-124: Knots, Rope & Rigging

### 5. Technology Rebuild (⚡)
**Difficulty:** Advanced  
**Guides:** 14 | **Time:** ~140 hours

Understand electricity, motors, steam engines, radio communications, and basic computing.

**Guides:**
- GD-157: Physics & Simple Machines
- GD-160: Electricity & Magnetism
- CON-04: Energy Systems
- GD-229: Power Generation
- GD-230: Electric Motors
- GD-231: Electrical Wiring
- GD-102: Steam Engines & Power Generation
- GD-113: Water Mills & Windmills
- GD-108: Solar Technology
- GD-116: Hydroelectric Power
- GD-139: Ham Radio & Communications
- GD-146: Telegraph & Telephone
- GD-163: Computing & Logic
- GD-164: Clockmaking & Precision Mechanics

### 6. Community Building (👥)
**Difficulty:** Intermediate  
**Guides:** 11 | **Time:** ~85 hours

Establish functional communities with governance, economics, education, and communication.

**Guides:**
- COM-01: Community Governance
- GD-189: Governance & Community
- GD-201: Community Organizing & Leadership
- GD-190: Education & Knowledge Transfer
- GD-194: Economics & Trade
- GD-197: Justice & Legal Systems
- GD-205: Postal Service & Communication Networks
- GD-206: Double-Entry Bookkeeping
- GD-228: Cultural Practices & Community Cohesion
- GD-192: Psychology & Group Dynamics
- GD-203: Psychological Resilience

### 7. Advanced Sciences (🔬)
**Difficulty:** Advanced  
**Guides:** 16 | **Time:** ~180 hours

Deep dive into chemistry, physics, mathematics, and advanced engineering.

**Guides:**
- GD-159: Mathematics & Measurement
- GD-157: Physics & Simple Machines
- GD-158: Chemistry from Scratch
- GD-160: Electricity & Magnetism
- GD-240: Metallurgy Fundamentals
- GD-162: Advanced Materials & Industrial Chemistry
- GD-167: Sulfuric Acid Production
- GD-168: Nitrogen Fixation & Fertilizer
- GD-169: Petroleum Refining
- GD-170: Plastic Production
- GD-179: Solvents & Distillation
- GD-180: Chlorine & Bleach Production
- GD-185: Acetylene & Carbide Production
- GD-186: Electrolysis & Chloralkali Process
- GD-187: Ammonia Synthesis (Simplified)
- GD-188: Wood Distillation & Pyrolysis

### 8. Self-Sufficiency (🌍)
**Difficulty:** Beginner  
**Guides:** 26 | **Time:** ~250 hours

Curated beginner-to-advanced path for complete independence. A balanced journey through the most important guides.

**Guides:** (26 guides spanning all major categories)

## Features

### Progress Tracking
- Visual progress bars for each path
- Shows X/Y guides completed
- Percentage completion display
- Completion checkmarks on individual guides

### User Interface

#### Learning Paths Section
- **Main Grid**: Cards display for each learning path
- **"Start Here" Recommendation**: Highlighted beginner recommendation
- **Responsive Design**: Grid adapts from 1-3 columns based on screen size

#### Path Details View
- **Back Navigation**: Return to paths list
- **Path Stats**: Guides count, completion, estimated time, progress %
- **Progress Bar**: Visual representation of path completion
- **Sequential Guide List**: Numbered guides in order
  - Guide icons and titles
  - Reading time and difficulty
  - Completion status indicators
  - Direct links to guides

### Interactions
- Click path card to view details
- Click "View Path" button to expand
- Click "Start Path" for beginner recommendation
- Click guide links to navigate and mark as complete
- Click "Back" to return to paths list
- Smooth transitions and animations

### Data Integration
- Reads from `/data/learning-paths.json`
- Reads from `/data/guides.json` for guide details
- Uses `storage.js` for progress tracking
- Syncs with existing guide completion system

## API Reference

### Module Exports

```javascript
import * as learningPaths from './learning-paths.js';

// Initialize
await learningPaths.init();

// Get data
const allPaths = learningPaths.getAllPathsWithProgress();
const pathProgress = learningPaths.getPathProgress('path-id');
const recommendedPath = learningPaths.getRecommendedPath();
const guides = learningPaths.getPathGuides('path-id');

// UI control
learningPaths.showPathDetails('path-id');
learningPaths.hidePathDetails();
learningPaths.renderLearningPathsSection();
```

## Validation

All guide IDs have been validated:
- ✓ 256 total guides in system
- ✓ 84 unique guides used across paths
- ✓ 0 invalid guide IDs
- ✓ Total 1103 estimated learning hours

## Styling Variables

The implementation uses CSS variables for consistency:

```css
/* Colors */
--accent: #d4a574 (primary gold)
--accent2: #b8956a (secondary muted gold)
--border: #4a6d4a (border color)
--surface: #2d2416 (card background)
--text: #f5f0e8 (primary text)
--muted: #999 (secondary text)

/* Spacing */
--spacing-md: 1rem
--spacing-lg: 1.25rem
--spacing-xl: 1.5rem
--spacing-2xl: 2rem
--spacing-3xl: 2.5rem

/* Difficulty Colors */
Beginner: #53d8a8 (green)
Intermediate: #d4a574 (gold)
Advanced: #b19cd9 (purple)
```

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design (320px+)
- Dark/light theme support
- Graceful degradation for older browsers

## Future Enhancements

Potential additions:
- Learning path recommendations based on completed guides
- Custom path creation for users
- Progress notifications and milestones
- Path difficulty progression suggestions
- Guide recommendations within paths
- Bookmark/favorite paths
- Export learning path progress
- Mobile app integration

## Implementation Notes

1. **Initialization**: Learning paths module initializes early in app startup
2. **Data Loading**: Both guides and learning paths fetched asynchronously
3. **Progress Sync**: Uses existing storage system for completed guides
4. **Event Handling**: All interactions use event delegation
5. **Responsive**: Mobile-optimized with breakpoints at 768px
6. **Accessibility**: Semantic HTML, ARIA labels where appropriate
7. **Performance**: CSS grid layout optimized for responsiveness
8. **Theme Support**: Works with both dark and light themes
