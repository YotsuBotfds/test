#!/usr/bin/env python3
"""
Compress guide HTML files by:
- Removing redundant whitespace (multiple spaces, excessive blank lines)
- Removing HTML comments (except conditional and metadata comments)
- Measuring before/after sizes
- Reporting compression statistics
"""

import os
import re
from pathlib import Path
from typing import Tuple, Dict


def remove_html_comments(content: str) -> str:
    """
    Remove HTML comments, but preserve:
    - Conditional comments (<!--[if IE]>...<![endif]-->)
    - Comments that appear to be metadata/markers (<!-- METADATA, <!-- Added, etc.)
    """
    # Pattern to match comments
    # Negative lookahead to avoid conditional comments and metadata comments
    pattern = r'<!--\s*(?!\[if|endif)[^-]*?-->'

    def should_keep_comment(match):
        comment = match.group(0)
        # Keep conditional comments
        if '[if ' in comment or 'endif' in comment:
            return True
        # Keep metadata-like comments (common prefixes)
        metadata_keywords = ['METADATA', 'Added', 'Created', 'Modified', 'TODO', 'NOTE', 'FIXME', 'WARNING']
        for keyword in metadata_keywords:
            if keyword in comment:
                return True
        return False

    # Find all comments
    comments = re.finditer(r'<!--.*?-->', content, re.DOTALL)
    comments_to_remove = []

    for match in comments:
        if not should_keep_comment(match):
            comments_to_remove.append(match)

    # Remove comments (from end to start to preserve indices)
    for match in reversed(comments_to_remove):
        content = content[:match.start()] + content[match.end():]

    return content


def compress_html(content: str) -> str:
    """
    Compress HTML by removing redundant whitespace while preserving content integrity.
    """
    # First remove comments
    content = remove_html_comments(content)

    # Remove excessive whitespace between tags
    # Replace multiple spaces with single space (outside of <pre> and <code> blocks)
    content = re.sub(r'> +<', '><', content)

    # Replace multiple consecutive spaces with single space
    content = re.sub(r'  +', ' ', content)

    # Remove blank lines (multiple newlines become single newline)
    content = re.sub(r'\n\s*\n+', '\n', content)

    # Remove leading/trailing whitespace in lines (but preserve newlines)
    lines = content.split('\n')
    lines = [line.rstrip() for line in lines]
    content = '\n'.join(lines)

    # Remove blank lines at the end
    while content.endswith('\n\n'):
        content = content.rstrip('\n') + '\n'

    return content


def process_guides(guides_dir: str) -> Dict[str, Tuple[int, int, float]]:
    """
    Process all HTML guide files and return compression statistics.
    Returns: dict of {filename: (before_size, after_size, percent_saved)}
    """
    guides_path = Path(guides_dir)
    results = {}
    total_before = 0
    total_after = 0

    # Find all HTML files
    html_files = sorted(guides_path.glob('*.html'))

    if not html_files:
        print(f"No HTML files found in {guides_dir}")
        return results

    print(f"Processing {len(html_files)} guide files...\n")

    for html_file in html_files:
        try:
            # Read original content
            with open(html_file, 'r', encoding='utf-8') as f:
                original_content = f.read()

            before_size = len(original_content.encode('utf-8'))

            # Compress
            compressed_content = compress_html(original_content)

            after_size = len(compressed_content.encode('utf-8'))

            # Calculate savings
            bytes_saved = before_size - after_size
            percent_saved = (bytes_saved / before_size * 100) if before_size > 0 else 0

            results[html_file.name] = (before_size, after_size, percent_saved)
            total_before += before_size
            total_after += after_size

            # Write compressed version back
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(compressed_content)

            # Print individual file stats
            status = "✓" if bytes_saved > 0 else "="
            print(f"{status} {html_file.name:50} {before_size:8} → {after_size:8} bytes "
                  f"({percent_saved:5.1f}% saved)")

        except Exception as e:
            print(f"✗ Error processing {html_file.name}: {e}")

    # Print summary
    total_saved = total_before - total_after
    total_percent = (total_saved / total_before * 100) if total_before > 0 else 0

    print("\n" + "=" * 100)
    print(f"COMPRESSION SUMMARY")
    print("=" * 100)
    print(f"Total files processed: {len(results)}")
    print(f"Total bytes before:    {total_before:,}")
    print(f"Total bytes after:     {total_after:,}")
    print(f"Total bytes saved:     {total_saved:,}")
    print(f"Overall compression:   {total_percent:.1f}%")
    print("=" * 100)

    return results


if __name__ == '__main__':
    guides_directory = '/sessions/sweet-great-darwin/mnt/survival-app/guides'
    process_guides(guides_directory)
