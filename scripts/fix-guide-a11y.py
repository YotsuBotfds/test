#!/usr/bin/env python3
"""
Accessibility fix script for survival guide HTML files.
Automatically fixes:
- Adds aria-label to SVG elements that lack it (using guide title + "diagram")
- Adds scope="col" to table headers that lack it
"""

import os
import re
from pathlib import Path
from html.parser import HTMLParser
import shutil
from datetime import datetime

class AccessibilityFixParser(HTMLParser):
    """Custom HTML parser for accessibility fixes"""

    def __init__(self):
        super().__init__()
        self.output = []
        self.guide_title = ''
        self.svg_counter = 0
        self.in_svg = False
        self.svg_start_pos = 0
        self.current_tag = None
        self.in_table = False
        self.in_thead = False
        self.fixes_made = {
            'svgs_fixed': 0,
            'table_headers_fixed': 0
        }

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == 'h1' and not self.guide_title:
            self.current_tag = 'h1'

        elif tag == 'svg':
            self.in_svg = True
            self.svg_counter += 1
            aria_label = attrs_dict.get('aria-label', '')

            # If SVG doesn't have aria-label, add one
            if not aria_label and self.guide_title:
                aria_label = f"{self.guide_title} diagram {self.svg_counter}"
                # Reconstruct the tag with aria-label
                new_attrs = list(attrs) + [('aria-label', aria_label)]
                attrs = new_attrs
                self.fixes_made['svgs_fixed'] += 1

            self.output_tag(tag, attrs)
            return

        elif tag == 'table':
            self.in_table = True
            self.output_tag(tag, attrs)
            return

        elif tag == 'thead':
            self.in_thead = True
            self.output_tag(tag, attrs)
            return

        elif tag == 'th' and self.in_table:
            # Check if th has scope attribute
            scope = attrs_dict.get('scope', '')
            if not scope:
                # Determine if it's in thead (col header) or tbody (row header)
                if self.in_thead:
                    scope = 'col'
                else:
                    scope = 'row'

                # Add scope attribute
                new_attrs = list(attrs) + [('scope', scope)]
                attrs = new_attrs
                self.fixes_made['table_headers_fixed'] += 1

            self.output_tag(tag, attrs)
            return

        self.output_tag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == 'h1':
            self.current_tag = None
        elif tag == 'svg':
            self.in_svg = False
        elif tag == 'table':
            self.in_table = False
        elif tag == 'thead':
            self.in_thead = False

        self.output.append(f'</{tag}>')

    def handle_data(self, data):
        if self.current_tag == 'h1':
            self.guide_title = data.strip()

        self.output.append(data)

    def handle_comment(self, data):
        self.output.append(f'<!--{data}-->')

    def handle_decl(self, decl):
        self.output.append(f'<!{decl}>')

    def output_tag(self, tag, attrs):
        """Output an HTML tag with attributes"""
        if not attrs:
            self.output.append(f'<{tag}>')
        else:
            attr_str = ' '.join(
                f'{k}="{v}"' if ' ' not in str(v) else f'{k}=\'{v}\''
                for k, v in attrs
            )
            self.output.append(f'<{tag} {attr_str}>')

    def get_output(self):
        """Get the fixed HTML"""
        return ''.join(self.output)


def fix_guide(filepath):
    """Fix accessibility issues in a single guide HTML file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return {
            'file': filepath,
            'success': False,
            'error': f"Failed to read file: {e}",
            'fixes': {}
        }

    parser = AccessibilityFixParser()
    try:
        parser.feed(content)
    except Exception as e:
        return {
            'file': filepath,
            'success': False,
            'error': f"Failed to parse HTML: {e}",
            'fixes': {}
        }

    fixed_content = parser.get_output()

    # Only write if changes were made
    if parser.fixes_made['svgs_fixed'] > 0 or parser.fixes_made['table_headers_fixed'] > 0:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(fixed_content)

            return {
                'file': filepath,
                'success': True,
                'fixes': parser.fixes_made
            }
        except Exception as e:
            return {
                'file': filepath,
                'success': False,
                'error': f"Failed to write file: {e}",
                'fixes': {}
            }
    else:
        return {
            'file': filepath,
            'success': True,
            'fixes': parser.fixes_made
        }


def main():
    """Main fix function"""
    guides_dir = Path('/sessions/sweet-great-darwin/mnt/survival-app/guides')

    if not guides_dir.exists():
        print(f"Error: Guides directory not found: {guides_dir}")
        return

    # Find all HTML files
    html_files = sorted(guides_dir.glob('*.html'))

    if not html_files:
        print(f"No HTML files found in {guides_dir}")
        return

    print(f"Fixing accessibility issues in {len(html_files)} guide files...")
    print()

    results = []
    total_svgs_fixed = 0
    total_headers_fixed = 0
    fixed_count = 0

    for filepath in html_files:
        result = fix_guide(str(filepath))
        results.append(result)

        if result['success']:
            fixes = result['fixes']
            total_svgs_fixed += fixes.get('svgs_fixed', 0)
            total_headers_fixed += fixes.get('table_headers_fixed', 0)

            if fixes.get('svgs_fixed', 0) > 0 or fixes.get('table_headers_fixed', 0) > 0:
                fixed_count += 1
                print(f"✓ {filepath.name}")
                if fixes.get('svgs_fixed', 0) > 0:
                    print(f"  - Added aria-label to {fixes['svgs_fixed']} SVG(s)")
                if fixes.get('table_headers_fixed', 0) > 0:
                    print(f"  - Added scope to {fixes['table_headers_fixed']} table header(s)")
        else:
            print(f"✗ {filepath.name}: {result.get('error', 'Unknown error')}")

    print()
    print("=" * 60)
    print("ACCESSIBILITY FIX SUMMARY")
    print("=" * 60)
    print(f"Total guides processed: {len(results)}")
    print(f"Guides with fixes: {fixed_count}")
    print(f"SVG elements fixed: {total_svgs_fixed}")
    print(f"Table headers fixed: {total_headers_fixed}")
    print()


if __name__ == '__main__':
    main()
