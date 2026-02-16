# Practice Mode User Guide

## What is Practice Mode?

Practice Mode lets you track which survival skills you've actually **practiced in real life**, separate from guides you've just **read**. This is important because knowing about fire-starting is different from successfully building and lighting a fire yourself.

## Quick Start

### Mark a Skill as Practiced

1. Look for any guide card in the app
2. In the **bottom-left corner**, you'll see a hammer icon (`🔨`)
3. Click it to mark that skill as practiced
4. The icon changes to a hand (`✋`) with a green highlight
5. The date is automatically recorded

### Unmark a Skill

1. Click the hand icon (`✋`) on a practiced guide
2. It reverts to the hammer icon (`🔨`)
3. The practice record is removed

### Filter by Practiced Skills

1. Look at the filter buttons near the top
2. Click **"🔨 Practiced"** to show only skills you've practiced
3. Click **"All Guides"** to see everything again

### View Your Practice Stats

Use your browser's developer console:

```javascript
practiceMode.getPracticeStats()
```

This shows:
- Total guides you've practiced
- Percentage completed
- Recent practice (last 7 days)
- This week's practice

## Visual Indicators

### Unpracticed Skill
```
🔨 Button (hammer icon)
Plain/gray appearance
Tooltip: "I've practiced this skill"
```

### Practiced Skill
```
✋ Button (hand icon)
Green highlight (#53d8a8)
Tooltip: "Practiced on [date]"
Indicates hands-on completion
```

## Why Separate from Reading?

You might:
- **Read** about water purification but not yet practice filtering water
- **Practice** fire-starting multiple times to master it
- **Mark as practiced** only skills you've truly done hands-on

This separation helps you:
1. Track actual hands-on competency
2. Identify skills you need more practice with
3. Build real survival confidence, not just knowledge

## Data Persistence

- Your practice records are saved locally
- They persist when you close and reopen the app
- They're stored separately from your reading progress
- Use browser's "Clear Data" to reset them

## Filtering & Organization

### Available Filters
- **All Guides** - See everything
- **Critical** - Critical guides
- **Essential** - Essential guides
- **Unread** - Guides you haven't read
- **Completed** - Guides you've read
- **🔨 Practiced** - Guides you've practiced
- **Beginner/Intermediate/Advanced** - By difficulty

### Combine Filters
Filters work independently. Click a filter button to show only guides matching that criteria.

## Common Use Cases

### "I want to practice bushcraft skills"
1. Click the **"Practiced"** filter
2. You'll see all skills you've actually practiced
3. Use this as a portfolio of real competencies

### "What new skills should I practice next?"
1. Click the **"Unread"** filter
2. Then manually review which ones you're ready to practice
3. Start with beginner difficulty

### "I've been practicing fire-starting techniques"
1. Search for "fire" in the search bar
2. Review fire-starting guides
3. Mark ones you've practiced
4. Check them all with the "Practiced" filter

### "How much hands-on training have I done?"
1. Open developer console (F12)
2. Run: `practiceMode.getPracticeStats()`
3. Check the "percentagePracticed" value

## Troubleshooting

### Practice marker not saving?
- Check if your browser allows localStorage
- Try clearing browser cache and refreshing
- Make sure JavaScript is enabled

### Icons not showing?
- Refresh the page
- Check if your browser supports emoji
- Try a different browser if needed

### Want to reset everything?
- Use the **"🔄 Reset Progress"** button in the toolbar
- This clears both reading progress and practice data
- Be careful - this cannot be undone!

## Tips for Effective Practice Tracking

1. **Be Honest** - Only mark skills you've truly practiced hands-on
2. **Start Small** - Practice one skill at a time
3. **Document Progress** - Note which techniques work best for you
4. **Review Regularly** - Check your practiced skills periodically
5. **Build Progressively** - Master fundamentals before advanced skills
6. **Practice Repeatedly** - One attempt isn't mastery; track multiple attempts

## Advanced Features

### Add Practice Notes (via console)
```javascript
practiceMode.setPracticeNotes('fire-starting-guide', 'Successfully lit fire with bow drill, took 5 minutes');
```

### Get Specific Practice Data
```javascript
const status = practiceMode.getPracticeStatus('water-purification');
console.log(status); // Shows practice date and notes
```

### View All Practiced Guides
```javascript
const practiced = practiceMode.getAllPracticed();
console.log(Object.keys(practiced)); // Shows all guide IDs
```

## Privacy & Security

- All data stored locally in your browser
- No data sent to any server
- Use browser's "Clear Data" to delete everything
- Practice records are yours to keep

## Support

For issues or suggestions about Practice Mode:
- Check that you're using a modern browser
- Ensure JavaScript is enabled
- Try refreshing the page
- Check browser console for errors (F12)
