# Orphaned Files Report - Survival App

**Generated:** 2026-02-15  
**Analysis Scope:** Root-level, data/, guides/, docs/, and spreadsheets/ directories

## Executive Summary

This report identifies potentially orphaned files that are NOT referenced in any executable code (.js, .html, or .json files), excluding files within the guides/ and docs/ directories from the searchable codebase.

### Summary Statistics

- **Total Orphaned Files:** 69
- **Total Orphaned Size:** 2M
- **Searchable Code Files:** 91 (JavaScript, HTML, JSON)

### File Count by Category

| Category | Count | Total Size |
|----------|-------|------------|
| Root-level .md files | 43 | 333K |
| Root-level .txt files | 8 | 88K |
| Data files (JSON) | 2 | 271K |
| Utility scripts | 2 | 7K |
| Guide files | 1 | 1M |
| Docs folder | 13 | 768K |


---

## Category 1: Root-level .md Files (Documentation)

These are markdown documentation files at the project root level (excluding README.md which is essential).

| File | Size | Status |
|------|------|--------|
| ACHIEVEMENTS_EXPANSION.md | 7K | Orphaned |
| ACHIEVEMENTS_QUICK_START.md | 6K | Orphaned |
| ACHIEVEMENTS_README.md | 7K | Orphaned |
| ANALYTICS_IMPLEMENTATION.md | 6K | Orphaned |
| ANALYTICS_QUICK_START.md | 5K | Orphaned |
| APP_REVIEW_AND_ROADMAP.md | 20K | Orphaned |
| BEFORE_AFTER_EXAMPLES.md | 12K | Orphaned |
| CHANGELOG.md | 597B | Orphaned |
| CI_CD_QUICK_REFERENCE.md | 3K | Orphaned |
| CI_CD_SETUP.md | 4K | Orphaned |
| CONFIG_QUICK_START.md | 4K | Orphaned |
| CONSOLIDATION_SUMMARY.md | 2K | Orphaned |
| DARK_MODE_SETUP.md | 7K | Orphaned |
| DEPLOYMENT_CHECKLIST.md | 9K | Orphaned |
| ENVIRONMENT_CONFIG_IMPLEMENTATION.md | 6K | Orphaned |
| EXECUTION_SUMMARY.md | 6K | Orphaned |
| EXECUTION_SUMMARY_PRACTICE_MODE.md | 11K | Orphaned |
| EXPORT_COMPLETION_SUMMARY.md | 12K | Orphaned |
| EXPORT_FEATURES.md | 7K | Orphaned |
| EXPORT_FEATURES_README.md | 10K | Orphaned |
| GUIDE_INTEGRATION.md | 9K | Orphaned |
| IMPLEMENTATION_DETAILS.md | 8K | Orphaned |
| IMPLEMENTATION_SUMMARY.md | 10K | Orphaned |
| LEARNING_PATHS.md | 10K | Orphaned |
| OFFLINE_MANAGER_CHANGES.md | 10K | Orphaned |
| OFFLINE_MANAGER_DEV_GUIDE.md | 9K | Orphaned |
| OFFLINE_MANAGER_README.md | 9K | Orphaned |
| OPTIMIZATION_QUICK_START.md | 5K | Orphaned |
| OPTIMIZATION_REPORT.md | 7K | Orphaned |
| ORPHANED_FILES_REPORT.md | 2K | Orphaned |
| PRACTICE_MODE_CHECKLIST.md | 9K | Orphaned |
| PRACTICE_MODE_IMPLEMENTATION.md | 6K | Orphaned |
| PRACTICE_MODE_INDEX.md | 9K | Orphaned |
| PRACTICE_MODE_README.md | 5K | Orphaned |
| PRACTICE_MODE_USER_GUIDE.md | 4K | Orphaned |
| PWA_DOCS_INDEX.md | 6K | Orphaned |
| PWA_ENHANCEMENT_SUMMARY.md | 6K | Orphaned |
| PWA_FEATURES_QUICK_START.md | 5K | Orphaned |
| PWA_IMPLEMENTATION_REPORT.md | 10K | Orphaned |
| QUICK_REFERENCE.md | 8K | Orphaned |
| QUICK_START_EXPORT.md | 4K | Orphaned |
| REFACTORING_SUMMARY.md | 6K | Orphaned |
| SEARCH_INDEX_README.md | 7K | Orphaned |
| TEST_EXPORT_FEATURES.md | 6K | Orphaned |

### Risk Assessment

**Risk Level:** MEDIUM-HIGH

**Notes:**
- 43 orphaned markdown documentation files identified
- These appear to be implementation notes, feature documentation, and configuration guides
- Likely generated during development and feature implementation cycles
- Examples: ACHIEVEMENTS_EXPANSION.md, PRACTICE_MODE_IMPLEMENTATION.md, PWA_IMPLEMENTATION_REPORT.md
- These could be safely archived if their content has been integrated into README.md or main documentation
- Check if any contain critical information that should be preserved in main docs

**Recommendations:**
1. Review files for any critical content not in README.md
2. Archive these files to a `/archived_docs/` folder
3. Keep README.md as the single source of truth for project documentation

---

## Category 2: Root-level .txt Files (Reports)

Plain text report and summary files at the project root level.

| File | Size | Status |
|------|------|--------|
| ANALYTICS_SUMMARY.txt | 13K | Orphaned |
| AUDIT_REPORT_2026-02-15.txt | 12K | Orphaned |
| CONSOLIDATION_REPORT.txt | 9K | Orphaned |
| EXECUTION_SUMMARY.txt | 14K | Orphaned |
| IMPLEMENTATION_SUMMARY.txt | 11K | Orphaned |
| IMPLEMENTATION_VERIFICATION.txt | 12K | Orphaned |
| METADATA_ENRICHMENT_REPORT.txt | 5K | Orphaned |
| OPTIMIZATION_SUMMARY.txt | 7K | Orphaned |

### Risk Assessment

**Risk Level:** LOW-MEDIUM

**Notes:**
- 8 text report files identified as orphaned
- Includes audit reports, execution summaries, and implementation records
- Examples: AUDIT_REPORT_2026-02-15.txt, METADATA_ENRICHMENT_REPORT.txt
- These appear to be generated reports from various development processes
- Safe candidates for archival if information is no longer needed

**Recommendations:**
1. Archive to `/archived_reports/` folder dated by content
2. Retain if they document important development decisions or changes
3. Consider consolidating similar reports

---

## Category 3: Data Files

JSON and data files in the `/data/` directory that are not referenced in application code.

| File | Size | Status |
|------|------|--------|
| data/skills_data.json | 227K | Orphaned |
| data/master-skills-db.json | 44K | Orphaned |

**Referenced Data Files (for comparison):**

| File | Size | Status |
|------|------|--------|
| data/search-index.json | 1M | Active |
| data/salvage_data.json | 4K | Active |
| data/glossary.json | 112K | Active |

### Risk Assessment

**Risk Level:** MEDIUM

**Notes:**
- 2 orphaned data files: skills_data.json and master-skills-db.json
- These are relatively large files (232KB and 45KB respectively)
- May be legacy versions or duplicates of active data
- Other data files (search-index.json, salvage_data.json, glossary.json) are actively referenced
- Suggest checking if content is duplicated in active files

**Recommendations:**
1. Verify if content duplicates active data files
2. If these are version backups, move to `/data/archive/`
3. If genuinely orphaned and unused for 3+ months, safe to remove
4. Document the purpose and timeline before removal

---

## Category 4: Utility Scripts

Standalone utility/helper scripts not referenced in active code.

| File | Size | Status |
|------|------|--------|
| verify-metadata.js | 2K | Orphaned |
| refactor_html.py | 5K | Orphaned |

### Risk Assessment

**Risk Level:** LOW

**Notes:**
- These appear to be one-off utility scripts
- verify-metadata.js: Likely a validation/maintenance script
- refactor_html.py: Python refactoring tool
- Not integrated into the main application flow
- Could be build tools or maintenance utilities

**Recommendations:**
1. Move to `/scripts/archive/` or `/tools/legacy/`
2. Document their purpose in a README within that folder
3. Keep if they serve maintenance or validation purposes
4. Remove only if their functionality is completely superseded

---

## Category 5: Guide Files

HTML guide files that are not referenced in application code.

| File | Size | Status |
|------|------|--------|
| guides/search-old.html | 1M | Orphaned |

### Risk Assessment

**Risk Level:** LOW

**Notes:**
- 1 orphaned guide file: search-old.html (1.2MB)
- Naming suggests this is a legacy/old version of search functionality
- The size (1.2MB) suggests it contains significant content
- Modern implementation likely in guides/search.html or tools/

**Recommendations:**
1. Confirm guides/search.html or modern search is active
2. If legacy, archive to `/guides/archive/old-versions/`
3. Safe to remove only after confirming newer version works correctly
4. Consider if this contains useful historical content

---

## Category 6: Documentation Files (docs/ folder)

Markdown and text files in the `/docs/` directory.

| File | Size | Status | Type |
|------|------|--------|------|
| BUILD_SCRIPT_README.md | 5K | Orphaned | md |
| GUIDE_A11Y_AUDIT.md | 540K | Orphaned | md |
| GUIDE_STRUCTURE_AUDIT.md | 15K | Orphaned | md |
| GUIDE_TEMPLATE.md | 17K | Orphaned | md |
| IMPROVEMENT_PLAN.txt | 22K | Orphaned | txt |
| IMPROVEMENT_PLAN_EXECUTION_ORDER.txt | 30K | Orphaned | txt |
| QUICK_REFERENCE.md | 4K | Orphaned | md |
| README_TAXONOMY.md | 6K | Orphaned | md |
| REFACTOR_COMPLETE.md | 7K | Orphaned | md |
| SECURITY_A11Y_EXECUTION_SUMMARY.md | 11K | Orphaned | md |
| SPREADSHEET_AUDIT.md | 76K | Orphaned | md |
| TAXONOMY_ANALYSIS_SUMMARY.txt | 8K | Orphaned | txt |
| TAXONOMY_REPORT.md | 21K | Orphaned | md |

### Risk Assessment

**Risk Level:** MEDIUM-HIGH

**Notes:**
- 13 orphaned documentation files in docs/ folder
- Includes audit reports, templates, and analysis documents
- GUIDE_A11Y_AUDIT.md is largest (553KB) - significant content
- SPREADSHEET_AUDIT.md, TAXONOMY_REPORT.md contain important analysis
- Files suggest structured analysis of app components (A11y, taxonomy, spreadsheets)

**Recommendations:**
1. Archive to `/docs/archive/` with clear date/version info
2. BEFORE archiving, review for any critical findings that should influence current development
3. These could be reference materials for future audits
4. Consider creating a summary document linking to archived audit reports
5. If content is obsolete, safe to remove after archival confirmation

---

## Category 7: Spreadsheet Files

XLSX files in `/spreadsheets/` directory (compared to JSON versions in `/data/spreadsheets/`)

**Note:** All spreadsheet files ARE REFERENCED in application code - listed for completeness and comparison.

| File | Size | Status |
|------|------|--------|
| climate-terrain-guide.xlsx | 44K | Referenced |
| failure-troubleshooting.xlsx | 48K | Referenced |
| materials-checklists.xlsx | 40K | Referenced |
| resource-database.xlsx | 36K | Referenced |
| salvage_variants_master.xlsx | 24K | Referenced |
| scenario-plans.xlsx | 44K | Referenced |
| seasonal-calendar.xlsx | 28K | Referenced |
| threat-risk-matrix.xlsx | 24K | Referenced |
| trade-barter-guide.xlsx | 24K | Referenced |

### Analysis

**Status:** All spreadsheet files are actively referenced.

**Note:** 
- JSON versions in `/data/spreadsheets/` are the processed/imported versions
- XLSX files are the source spreadsheets
- Both are kept for data maintenance and conversion tracking
- Duplicate storage is intentional and necessary

---

## Summary of Recommendations by Priority

### Immediate Actions (Low Risk)

1. **Archive Root .txt Reports** - Move 8 report files to `/archived_reports/` folder
   - Frees up root directory clutter
   - Preserves historical records
   - Total savings: ~85KB

2. **Archive Utility Scripts** - Move verify-metadata.js and refactor_html.py to `/scripts/legacy/`
   - Clarifies which scripts are active
   - Preserves tools for future use
   - Total savings: ~7.9KB

### Medium Priority (Review Required)

3. **Review & Archive Root .md Files** - 43 documentation files
   - Review each file for critical content NOT in README.md
   - Move to `/archived_docs/IMPLEMENTATIONS/` with category subdirectories
   - Keep essential quick-starts and guides
   - Total potential savings: ~415KB

4. **Review Docs/ Audit Files** - 13 analysis and audit documents
   - Evaluate findings for ongoing relevance
   - Create archive structure with version dates
   - Consider consolidating audit summaries
   - Total potential savings: ~773KB

### Lower Priority (Verification Needed)

5. **Investigate Data Files** - 2 orphaned JSON files (277KB)
   - Verify if duplicates of active data
   - Check commit history for purpose
   - Archive if confirmed redundant
   - Total potential savings: 277KB

6. **Verify Guide Files** - 1 legacy search file (1.2MB)
   - Confirm search.html or modern search implementation is active
   - Archive if truly legacy
   - Total potential savings: 1.2MB

---

## Total Potential Cleanup

| Category | Files | Size | Recommendation |
|----------|-------|------|-----------------|
| Root .md files | 43 | 415KB | Archive |
| Root .txt files | 8 | 85KB | Archive |
| Data files | 2 | 277KB | Investigate then archive |
| Utility scripts | 2 | 7.9KB | Archive |
| Guide files | 1 | 1.2MB | Investigate then archive |
| Docs/ files | 13 | 773KB | Review then archive |
| **TOTAL** | **69 files** | **~2.8MB** | |

---

## Technical Notes

### Analysis Methodology

1. **File Identification:** Scanned root directory, data/, guides/, and docs/ folders
2. **Reference Checking:** Searched all .js, .html, and .json files (91 files total) for filename references
3. **Exclusions:** 
   - Guides/ and docs/ folders not included in reference search (these are documentation)
   - README.md excluded from root .md file analysis (core documentation)
   - All spreadsheet files have active references
4. **Size Calculation:** Used wc -c for byte-accurate file sizes, converted to human-readable format

### Verification Method

```bash
# Example: Checking if a file is referenced
grep -r "filename-pattern" . --include="*.js" --include="*.html" --include="*.json"
```

### Safety Considerations

- **No files were deleted** in this analysis - this is a report only
- All recommendations are for archival/organization, not deletion
- Archive structure preserves access to historical information
- Recommend git commit before any cleanup operations

---

## Next Steps

1. **Review this report** with development team
2. **Prioritize** which categories to address
3. **Create archive directories** following recommended structure
4. **Execute cleanup** in small batches with git commits
5. **Update .gitignore** if appropriate for archive folders
6. **Document decisions** in a CLEANUP_LOG.md file

---

*Report generated automatically. Recommendations should be reviewed for accuracy before implementation.*
