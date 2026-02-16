#!/usr/bin/env python3
"""
Accessibility audit script for survival guide HTML files.
Scans all guides/*.html and checks for:
- Heading hierarchy (no skipped levels)
- SVG elements have alt text or aria-label
- Tables have proper headers (th) and scope attributes
- Images have alt text
- Lists all inline <script> tags found
"""

import os
import re
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime

class AccessibilityAuditParser(HTMLParser):
    """Custom HTML parser for accessibility checks"""

    def __init__(self):
        super().__init__()
        self.headings = []
        self.svgs = []
        self.tables = []
        self.images = []
        self.scripts = []
        self.current_table = None
        self.in_table = False
        self.table_headers = []
        self.current_tag = None
        self.attrs_dict = {}

    def handle_starttag(self, tag, attrs):
        self.attrs_dict = dict(attrs)

        if tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            level = int(tag[1])
            self.headings.append({
                'level': level,
                'tag': tag,
                'id': self.attrs_dict.get('id', ''),
                'text': ''
            })
            self.current_tag = 'heading'

        elif tag == 'svg':
            aria_label = self.attrs_dict.get('aria-label', '')
            alt = self.attrs_dict.get('alt', '')
            self.svgs.append({
                'has_aria_label': bool(aria_label),
                'has_alt': bool(alt),
                'aria_label': aria_label,
                'alt': alt
            })

        elif tag == 'img':
            alt = self.attrs_dict.get('alt', '')
            src = self.attrs_dict.get('src', '')
            self.images.append({
                'src': src,
                'has_alt': bool(alt),
                'alt': alt
            })

        elif tag == 'table':
            self.in_table = True
            self.current_table = {
                'has_thead': False,
                'headers': [],
                'header_cells': [],
                'body_cells': [],
                'issues': []
            }

        elif tag == 'thead' and self.in_table:
            self.current_table['has_thead'] = True

        elif tag == 'th' and self.in_table:
            scope = self.attrs_dict.get('scope', '')
            self.current_table['headers'].append({
                'scope': scope,
                'has_scope': bool(scope)
            })
            self.current_tag = 'th'

        elif tag == 'td' and self.in_table:
            self.current_tag = 'td'

        elif tag == 'script':
            script_type = self.attrs_dict.get('type', '')
            script_src = self.attrs_dict.get('src', '')
            if not script_src:  # Inline script
                self.scripts.append({
                    'type': 'inline',
                    'script_type': script_type,
                    'location': f'Line ~{self.getpos()[0]}'
                })
            else:
                self.scripts.append({
                    'type': 'external',
                    'src': script_src,
                    'script_type': script_type
                })

    def handle_endtag(self, tag):
        if tag == 'table':
            self.in_table = False
            self.tables.append(self.current_table)
            self.current_table = None
        self.current_tag = None

    def handle_data(self, data):
        if self.current_tag == 'heading' and self.headings:
            self.headings[-1]['text'] += data.strip()


def audit_guide(filepath):
    """Audit a single guide HTML file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return {
            'file': filepath,
            'error': f"Failed to read file: {e}",
            'valid': False
        }

    parser = AccessibilityAuditParser()
    try:
        parser.feed(content)
    except Exception as e:
        return {
            'file': filepath,
            'error': f"Failed to parse HTML: {e}",
            'valid': False
        }

    # Check heading hierarchy
    heading_issues = []
    if parser.headings:
        prev_level = 0
        for heading in parser.headings:
            level = heading['level']
            if level > prev_level + 1:
                heading_issues.append(
                    f"Heading hierarchy skip: jumped from H{prev_level} to H{level}"
                )
            prev_level = level

    # Check SVGs for alt text
    svg_issues = []
    for i, svg in enumerate(parser.svgs):
        if not svg['has_aria_label'] and not svg['has_alt']:
            svg_issues.append(f"SVG #{i+1}: Missing aria-label and alt text")

    # Check images for alt text
    img_issues = []
    for img in parser.images:
        if not img['has_alt']:
            img_issues.append(f"Image '{img['src']}': Missing alt text")

    # Check tables for headers and scope
    table_issues = []
    for i, table in enumerate(parser.tables):
        if table is None:
            continue
        if not table['has_thead']:
            table_issues.append(f"Table #{i+1}: Missing <thead>")
        for j, header in enumerate(table['headers']):
            if not header['has_scope']:
                table_issues.append(f"Table #{i+1}, Header #{j+1}: Missing scope attribute")

    return {
        'file': filepath,
        'valid': True,
        'heading_issues': heading_issues,
        'svg_issues': svg_issues,
        'image_issues': img_issues,
        'table_issues': table_issues,
        'inline_scripts': [s for s in parser.scripts if s['type'] == 'inline'],
        'external_scripts': [s for s in parser.scripts if s['type'] == 'external'],
        'total_headings': len(parser.headings),
        'total_svgs': len(parser.svgs),
        'total_images': len(parser.images),
        'total_tables': len(parser.tables)
    }


def main():
    """Main audit function"""
    guides_dir = Path('/sessions/sweet-great-darwin/mnt/survival-app/guides')

    if not guides_dir.exists():
        print(f"Error: Guides directory not found: {guides_dir}")
        return

    # Find all HTML files
    html_files = sorted(guides_dir.glob('*.html'))

    if not html_files:
        print(f"No HTML files found in {guides_dir}")
        return

    print(f"Auditing {len(html_files)} guide files...")
    print()

    results = []
    for filepath in html_files:
        result = audit_guide(str(filepath))
        results.append(result)

        if result['valid']:
            issues_count = (
                len(result['heading_issues']) +
                len(result['svg_issues']) +
                len(result['image_issues']) +
                len(result['table_issues'])
            )
            status = "✓" if issues_count == 0 else "✗"
            print(f"{status} {filepath.name}: {issues_count} issues")

    # Generate report
    report_path = Path('/sessions/sweet-great-darwin/mnt/survival-app/docs/GUIDE_A11Y_AUDIT.md')

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# Guide Accessibility Audit Report\n\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write(f"## Summary\n\n")

        valid_results = [r for r in results if r['valid']]
        total_issues = sum(
            len(r['heading_issues']) +
            len(r['svg_issues']) +
            len(r['image_issues']) +
            len(r['table_issues'])
            for r in valid_results
        )

        f.write(f"- **Total guides scanned:** {len(valid_results)}\n")
        f.write(f"- **Total accessibility issues:** {total_issues}\n")
        f.write(f"- **Guides with issues:** {sum(1 for r in valid_results if any([r['heading_issues'], r['svg_issues'], r['image_issues'], r['table_issues']]))}\n")
        f.write(f"- **Total inline scripts found:** {sum(len(r['inline_scripts']) for r in valid_results)}\n")
        f.write(f"- **Total external scripts:** {sum(len(r['external_scripts']) for r in valid_results)}\n")
        f.write("\n")

        # Content statistics
        f.write("## Content Statistics\n\n")
        f.write(f"- **Total headings:** {sum(r['total_headings'] for r in valid_results)}\n")
        f.write(f"- **Total SVG diagrams:** {sum(r['total_svgs'] for r in valid_results)}\n")
        f.write(f"- **Total images:** {sum(r['total_images'] for r in valid_results)}\n")
        f.write(f"- **Total tables:** {sum(r['total_tables'] for r in valid_results)}\n")
        f.write("\n")

        # Issues by category
        f.write("## Issues by Category\n\n")

        heading_issues_total = sum(len(r['heading_issues']) for r in valid_results)
        svg_issues_total = sum(len(r['svg_issues']) for r in valid_results)
        img_issues_total = sum(len(r['image_issues']) for r in valid_results)
        table_issues_total = sum(len(r['table_issues']) for r in valid_results)

        f.write(f"### Heading Hierarchy Issues: {heading_issues_total}\n")
        if heading_issues_total > 0:
            for r in valid_results:
                if r['heading_issues']:
                    f.write(f"\n**{Path(r['file']).name}**\n")
                    for issue in r['heading_issues']:
                        f.write(f"- {issue}\n")
        else:
            f.write("✓ No heading hierarchy issues found\n")
        f.write("\n")

        f.write(f"### SVG Accessibility Issues: {svg_issues_total}\n")
        if svg_issues_total > 0:
            for r in valid_results:
                if r['svg_issues']:
                    f.write(f"\n**{Path(r['file']).name}**\n")
                    for issue in r['svg_issues']:
                        f.write(f"- {issue}\n")
        else:
            f.write("✓ All SVG elements have proper labels\n")
        f.write("\n")

        f.write(f"### Image Alt Text Issues: {img_issues_total}\n")
        if img_issues_total > 0:
            for r in valid_results:
                if r['image_issues']:
                    f.write(f"\n**{Path(r['file']).name}**\n")
                    for issue in r['image_issues']:
                        f.write(f"- {issue}\n")
        else:
            f.write("✓ All images have alt text\n")
        f.write("\n")

        f.write(f"### Table Accessibility Issues: {table_issues_total}\n")
        if table_issues_total > 0:
            for r in valid_results:
                if r['table_issues']:
                    f.write(f"\n**{Path(r['file']).name}**\n")
                    for issue in r['table_issues']:
                        f.write(f"- {issue}\n")
        else:
            f.write("✓ All tables have proper headers and scope attributes\n")
        f.write("\n")

        # Script audit
        f.write("## Security Audit: Inline Scripts\n\n")
        f.write("Inline scripts can be a security concern. Below is a list of all inline scripts found:\n\n")

        inline_scripts_total = sum(len(r['inline_scripts']) for r in valid_results)
        f.write(f"**Total inline scripts found:** {inline_scripts_total}\n\n")

        if inline_scripts_total > 0:
            for r in valid_results:
                if r['inline_scripts']:
                    f.write(f"**{Path(r['file']).name}** - {len(r['inline_scripts'])} inline script(s)\n")
                    for script in r['inline_scripts']:
                        f.write(f"- Type: {script['script_type'] or 'text/javascript (default)'}\n")
                        f.write(f"  Location: {script['location']}\n")

        f.write("\n")

        # External scripts
        f.write("## External Scripts\n\n")
        external_scripts_total = sum(len(r['external_scripts']) for r in valid_results)
        f.write(f"**Total external scripts found:** {external_scripts_total}\n\n")

        if external_scripts_total > 0:
            for r in valid_results:
                if r['external_scripts']:
                    f.write(f"**{Path(r['file']).name}**\n")
                    for script in r['external_scripts']:
                        f.write(f"- `{script['src']}` (type: {script['script_type'] or 'text/javascript'})\n")

        f.write("\n")

        # Detailed findings
        f.write("## Detailed Findings by Guide\n\n")

        guides_with_issues = [r for r in valid_results if any([
            r['heading_issues'],
            r['svg_issues'],
            r['image_issues'],
            r['table_issues']
        ])]

        if guides_with_issues:
            for r in guides_with_issues:
                f.write(f"### {Path(r['file']).name}\n\n")

                if r['heading_issues']:
                    f.write("**Heading Issues:**\n")
                    for issue in r['heading_issues']:
                        f.write(f"- {issue}\n")
                    f.write("\n")

                if r['svg_issues']:
                    f.write("**SVG Issues:**\n")
                    for issue in r['svg_issues']:
                        f.write(f"- {issue}\n")
                    f.write("\n")

                if r['image_issues']:
                    f.write("**Image Issues:**\n")
                    for issue in r['image_issues']:
                        f.write(f"- {issue}\n")
                    f.write("\n")

                if r['table_issues']:
                    f.write("**Table Issues:**\n")
                    for issue in r['table_issues']:
                        f.write(f"- {issue}\n")
                    f.write("\n")
        else:
            f.write("✓ All guides are accessible!\n\n")

        f.write("## Recommendations\n\n")
        f.write("1. **Heading Hierarchy**: Ensure headings follow a logical hierarchy without skipping levels.\n")
        f.write("2. **SVG Alt Text**: Add `aria-label` attributes to SVG diagrams describing their content.\n")
        f.write("3. **Image Alt Text**: Ensure all images have meaningful alt text for screen readers.\n")
        f.write("4. **Table Headers**: Add `scope` attributes to `<th>` elements to identify header relationships.\n")
        f.write("5. **Scripts**: Review inline scripts for security implications. Consider moving to external files.\n")

    print()
    print(f"Report generated: {report_path}")
    print(f"Total guides scanned: {len(valid_results)}")
    print(f"Total accessibility issues: {total_issues}")


if __name__ == '__main__':
    main()
