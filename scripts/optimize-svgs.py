#!/usr/bin/env python3
"""
Optimize SVG elements within HTML guide files by:
- Removing unnecessary SVG attributes (xml:space, etc.)
- Stripping SVG comments
- Removing redundant whitespace within SVG tags
- Preserving all SVG functionality and content
"""

import os
import re
from pathlib import Path
from typing import Tuple, Dict


def optimize_svg_in_html(content: str) -> str:
    """
    Optimize SVG elements within HTML content.
    Removes unnecessary attributes and comments from SVG tags.
    """
    # Pattern to match SVG elements (including full content)
    # This matches <svg...>...</svg> blocks
    svg_pattern = r'<svg[^>]*>.*?</svg>'

    def optimize_svg_block(match):
        svg_block = match.group(0)

        # Remove SVG comments
        svg_block = re.sub(r'<!--.*?-->', '', svg_block, flags=re.DOTALL)

        # Remove unnecessary attributes from SVG opening tag
        # Remove: xml:space, unnecessary whitespace in attributes
        svg_block = re.sub(r'\s+xml:space="[^"]*"', '', svg_block)
        svg_block = re.sub(r'\s+xmlns:xlink="[^"]*"', '', svg_block)
        svg_block = re.sub(r'\s+xmlns:svg="[^"]*"', '', svg_block)

        # Remove excessive whitespace within tags but preserve content
        # Replace multiple spaces between attributes with single space
        svg_block = re.sub(r'\s{2,}', ' ', svg_block)

        # Remove spaces before closing angle brackets
        svg_block = re.sub(r'\s+>', '>', svg_block)

        # Remove newlines within opening tags (between < and >)
        # while preserving the overall SVG structure
        svg_block = re.sub(r'<([^>]+)\n([^>])', r'<\1 \2', svg_block)

        return svg_block

    # Find and optimize all SVG blocks
    optimized_content = re.sub(svg_pattern, optimize_svg_block, content, flags=re.DOTALL)

    return optimized_content


def remove_svg_namespace_declarations(content: str) -> str:
    """
    Remove redundant xmlns and xmlns:xlink declarations from SVG tags
    while keeping the main xmlns attribute.
    """
    # Keep only the main xmlns="http://www.w3.org/2000/svg" and remove others
    content = re.sub(
        r'xmlns="http://www\.w3\.org/2000/svg"\s+xmlns[^=]*="[^"]*"',
        'xmlns="http://www.w3.org/2000/svg"',
        content
    )
    return content


def process_svg_in_guides(guides_dir: str) -> Dict[str, Tuple[int, int, float]]:
    """
    Process all HTML guide files and optimize SVG elements.
    Returns: dict of {filename: (before_size, after_size, percent_saved)}
    """
    guides_path = Path(guides_dir)
    results = {}
    total_before = 0
    total_after = 0
    files_with_svg = 0

    # Find all HTML files
    html_files = sorted(guides_path.glob('*.html'))

    if not html_files:
        print(f"No HTML files found in {guides_dir}")
        return results

    print(f"Processing {len(html_files)} guide files for SVG optimization...\n")

    for html_file in html_files:
        try:
            # Read original content
            with open(html_file, 'r', encoding='utf-8') as f:
                original_content = f.read()

            # Check if file contains SVG
            if '<svg' not in original_content:
                print(f"  {html_file.name:50} (no SVG elements)")
                continue

            before_size = len(original_content.encode('utf-8'))

            # Optimize SVG
            optimized_content = optimize_svg_in_html(original_content)
            optimized_content = remove_svg_namespace_declarations(optimized_content)

            after_size = len(optimized_content.encode('utf-8'))

            # Calculate savings
            bytes_saved = before_size - after_size
            percent_saved = (bytes_saved / before_size * 100) if before_size > 0 else 0

            # Only update file if there were actual optimizations
            if bytes_saved > 0:
                results[html_file.name] = (before_size, after_size, percent_saved)
                total_before += before_size
                total_after += after_size
                files_with_svg += 1

                # Write optimized version back
                with open(html_file, 'w', encoding='utf-8') as f:
                    f.write(optimized_content)

                # Print individual file stats
                print(f"✓ {html_file.name:50} {before_size:8} → {after_size:8} bytes "
                      f"({percent_saved:5.1f}% saved)")
            else:
                print(f"  {html_file.name:50} (no SVG optimization needed)")
                files_with_svg += 1

        except Exception as e:
            print(f"✗ Error processing {html_file.name}: {e}")

    # Print summary
    if files_with_svg > 0:
        total_saved = total_before - total_after
        total_percent = (total_saved / total_before * 100) if total_before > 0 else 0

        print("\n" + "=" * 100)
        print(f"SVG OPTIMIZATION SUMMARY")
        print("=" * 100)
        print(f"Files with SVG elements: {files_with_svg}")
        print(f"Files optimized:         {len(results)}")
        if total_before > 0:
            print(f"Total bytes before:      {total_before:,}")
            print(f"Total bytes after:       {total_after:,}")
            print(f"Total bytes saved:       {total_saved:,}")
            print(f"Overall compression:     {total_percent:.1f}%")
        else:
            print("No optimizations found in SVG elements")
        print("=" * 100)
    else:
        print("\n" + "=" * 100)
        print("No SVG elements found in any guide files")
        print("=" * 100)

    return results


if __name__ == '__main__':
    guides_directory = '/sessions/sweet-great-darwin/mnt/survival-app/guides'
    process_svg_in_guides(guides_directory)
