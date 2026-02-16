#!/usr/bin/env python3
"""
Consolidate inline CSS from guide HTML files into shared.css
Scans all guides/*.html, extracts common inline styles, and consolidates them.
"""

import re
import os
import subprocess
from collections import defaultdict
from pathlib import Path

class StyleConsolidator:
    def __init__(self, guides_dir, shared_css_path, min_occurrences=10):
        self.guides_dir = guides_dir
        self.shared_css_path = shared_css_path
        self.min_occurrences = min_occurrences
        self.style_rules = defaultdict(list)
        self.style_declarations = {}
        self.modified_guides = []
        self.total_bytes_saved = 0
        self.rules_consolidated = 0

    def normalize_css_rule(self, declarations):
        """Normalize CSS declarations for comparison."""
        # Remove extra whitespace
        normalized = re.sub(r'\s+', ' ', declarations.strip())
        return normalized

    def extract_styles(self):
        """Extract all inline styles from guide HTML files."""
        guides = sorted([f for f in os.listdir(self.guides_dir)
                        if f.endswith('.html')])

        print(f"Scanning {len(guides)} guide files for inline styles...")

        for guide_file in guides:
            path = os.path.join(self.guides_dir, guide_file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    # Find style block
                    match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
                    if match:
                        style_content = match.group(1)
                        # Parse CSS rules properly
                        # Split by } to find rule boundaries
                        rules_raw = re.findall(r'([^}]+){([^}]+)}', style_content)
                        for selector, declarations in rules_raw:
                            selector = selector.strip()
                            declarations = declarations.strip()
                            if selector and declarations:
                                # Normalize for comparison
                                norm_decl = self.normalize_css_rule(declarations)
                                self.style_rules[selector].append({
                                    'file': guide_file,
                                    'declarations': declarations,
                                    'normalized': norm_decl
                                })
            except Exception as e:
                print(f"  Warning: Error reading {guide_file}: {e}")

        # Find common rules and store their canonical declarations
        common_count = 0
        for selector, occurrences in self.style_rules.items():
            if len(occurrences) >= self.min_occurrences:
                # Find most common declaration variant (by normalized form)
                norm_counts = defaultdict(list)
                for occ in occurrences:
                    norm_counts[occ['normalized']].append(occ['declarations'])

                # Use the most common variant
                most_common_norm = max(norm_counts.keys(), key=lambda x: len(norm_counts[x]))
                most_common_decl = norm_counts[most_common_norm][0]
                self.style_declarations[selector] = {
                    'declarations': most_common_decl,
                    'count': len(occurrences)
                }
                common_count += 1

        print(f"Found {len([r for r in self.style_rules.values() if len(r) >= self.min_occurrences])} "
              f"CSS rules appearing in {self.min_occurrences}+ guides\n")

    def read_shared_css(self):
        """Read existing shared.css content."""
        with open(self.shared_css_path, 'r', encoding='utf-8') as f:
            return f.read()

    def write_shared_css(self, content):
        """Write updated shared.css."""
        with open(self.shared_css_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def add_rules_to_shared_css(self):
        """Add consolidated rules to shared.css."""
        shared_css = self.read_shared_css()

        # Find insertion point (right before @media rules)
        media_match = re.search(r'\n/\* Responsive Design \*/', shared_css)

        if not media_match:
            # Fallback: add before print styles
            media_match = re.search(r'\n/\* Print Styles \*/', shared_css)

        insertion_point = media_match.start() if media_match else len(shared_css)

        # Build new rules section
        new_rules = "\n/* Consolidated Guide Styles (appearing in 10+ guides) */\n\n"

        for selector in sorted(self.style_declarations.keys()):
            data = self.style_declarations[selector]
            declarations = data['declarations']
            count = data['count']

            # Format nicely
            new_rules += f"{selector} {{\n"

            # Parse and format declarations
            decls = [d.strip() for d in declarations.split(';') if d.strip()]
            for decl in decls:
                new_rules += f"  {decl};\n"

            new_rules += f"}}\n\n"

        # Insert new rules
        updated_css = shared_css[:insertion_point] + new_rules + shared_css[insertion_point:]

        self.write_shared_css(updated_css)
        self.rules_consolidated = len(self.style_declarations)
        print(f"Added {self.rules_consolidated} rules to shared.css")

    def remove_consolidated_styles(self):
        """Remove now-redundant inline styles from guide files."""
        guides = sorted([f for f in os.listdir(self.guides_dir)
                        if f.endswith('.html')])

        print(f"Removing consolidated styles from guide files...")

        for guide_file in guides:
            path = os.path.join(self.guides_dir, guide_file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()

                # Find and process style block
                style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
                if not style_match:
                    continue

                original_style_content = style_match.group(1)
                style_content = original_style_content

                # Remove consolidated rules one by one
                for selector, data in self.style_declarations.items():
                    # Find rules matching this selector in the style block
                    pattern = re.escape(selector) + r'\s*\{[^}]+\}'
                    matches = list(re.finditer(pattern, style_content))

                    for match in matches:
                        rule_text = match.group(0)
                        # Extract declarations from the matched rule
                        decls_match = re.search(r'\{([^}]+)\}', rule_text)
                        if decls_match:
                            rule_decls = decls_match.group(1).strip()
                            shared_decls = data['declarations'].strip()

                            # Normalize both for comparison
                            rule_norm = self.normalize_css_rule(rule_decls)
                            shared_norm = self.normalize_css_rule(shared_decls)

                            # Remove if they match
                            if rule_norm == shared_norm:
                                style_content = style_content.replace(rule_text, '', 1)

                # Update file if style content changed
                if style_content != original_style_content:
                    bytes_removed = len(original_style_content) - len(style_content)

                    # Handle empty style blocks
                    if not style_content.strip():
                        # Remove entire style block if empty
                        new_content = content.replace(
                            f"<style>{original_style_content}</style>",
                            ""
                        )
                    else:
                        new_content = content.replace(
                            f"<style>{original_style_content}</style>",
                            f"<style>{style_content}</style>"
                        )

                    # Write back
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)

                    self.modified_guides.append(guide_file)
                    self.total_bytes_saved += bytes_removed

            except Exception as e:
                print(f"  Warning: Error processing {guide_file}: {e}")

        print(f"Modified {len(self.modified_guides)} guide files")
        print(f"Total bytes removed from guides: {self.total_bytes_saved:,}\n")

    def report(self):
        """Print consolidation report."""
        print("="*70)
        print("STYLE CONSOLIDATION REPORT")
        print("="*70)
        print(f"Total guides scanned: 262")
        print(f"Guides with inline styles: {len([r for r in self.style_rules.values() if len(r) > 0])}")
        print(f"CSS rules found: {len(self.style_rules)}")
        print(f"Common rules (10+ guides): {self.rules_consolidated}")
        print(f"\nGuides modified: {len(self.modified_guides)}")
        print(f"Total bytes removed from guides: {self.total_bytes_saved:,}")

        # Calculate bytes added to shared.css (rough estimate)
        bytes_added_estimate = sum(
            len(selector) + len(data['declarations']) + 10
            for selector, data in self.style_declarations.items()
        )

        net_savings = self.total_bytes_saved - bytes_added_estimate
        print(f"Bytes added to shared.css (estimate): {bytes_added_estimate:,}")
        print(f"Net bytes saved: {net_savings:,}")
        print("="*70)

        if self.modified_guides:
            print("\nFirst 10 modified guides:")
            for guide in self.modified_guides[:10]:
                print(f"  - {guide}")
            if len(self.modified_guides) > 10:
                print(f"  ... and {len(self.modified_guides) - 10} more")

    def run(self):
        """Execute the consolidation process."""
        print("Starting style consolidation...\n")
        self.extract_styles()
        self.add_rules_to_shared_css()
        self.remove_consolidated_styles()
        self.report()

def main():
    guides_dir = "/sessions/sweet-great-darwin/mnt/survival-app/guides"
    shared_css_path = "/sessions/sweet-great-darwin/mnt/survival-app/guides/css/shared.css"

    consolidator = StyleConsolidator(guides_dir, shared_css_path, min_occurrences=10)
    consolidator.run()

if __name__ == "__main__":
    main()
