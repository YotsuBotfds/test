#!/usr/bin/env python3
"""
Refactor index.html to remove hardcoded guide cards and add guides-container placeholder.
Replace all hardcoded <a class=card> elements with a <div id="guides-container"></div>.
"""

import re
from pathlib import Path

def refactor_html(html_path, output_path=None):
    """
    Remove hardcoded guide cards from HTML and add container for dynamic rendering.

    Args:
        html_path: Path to index.html
        output_path: Path to save refactored HTML (defaults to input path)
    """
    if output_path is None:
        output_path = html_path

    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    original_html = html

    # Pattern to match all guide cards: <a class=card ...> ... </a>
    card_pattern = r'<a class=card[^>]*>.*?</a>'

    # Find all cards and their outer container
    all_cards = re.findall(card_pattern, html, re.DOTALL)
    print(f"Found {len(all_cards)} hardcoded guide cards")

    # We need to find the container that has the section headings and cards
    # The structure is likely: <div><h2 id="sec-xxx">...</h2> <a class=card>...</a> ... </div>

    # Strategy: Find the first section heading and the last card
    # Then replace everything between them (including the headings) with guides-container

    # Find first h2 that starts a section (has id="sec-xxx")
    section_start_match = re.search(r'<h2[^>]*id="sec-', html)
    if not section_start_match:
        print("ERROR: Could not find section start")
        return False

    section_start_pos = section_start_match.start()

    # Find the last card
    last_card_match = None
    for match in re.finditer(card_pattern, html, re.DOTALL):
        last_card_match = match

    if not last_card_match:
        print("ERROR: Could not find any cards")
        return False

    last_card_end = last_card_match.end()

    print(f"Removing content from position {section_start_pos} to {last_card_end}")

    # Check what comes after the last card
    after_card = html[last_card_end:last_card_end+100]
    print(f"After last card: {after_card[:80]}")

    # The structure likely has closing divs after the last card
    # We need to figure out which closing tags to keep
    # Let's look back from the last card to find the opening section container

    # Extract text before first section to find the opening tag
    before_section = html[max(0, section_start_pos-1000):section_start_pos]
    print(f"\nBefore first section: {before_section[-200:]}")

    # Look for opening <div> that might contain sections
    # The structure appears to be: <div class="..."><h2>section 1</h2><a>card</a>...<h2>section 2</h2>...<a>card</a></div>

    # Find the opening <div> closest to the first section
    div_start = before_section.rfind('<div')
    if div_start == -1:
        print("Could not find opening <div>, looking for other containers")
        # Maybe it's opened earlier, let's just replace the content
        container_start = section_start_pos
    else:
        container_start = len(html[:section_start_pos]) - len(before_section) + div_start

    # Find closing </div> after last card - but we need the right one
    # Let's count divs to match them properly

    after_cards = html[last_card_end:last_card_end+500]

    # Look for closing div tags and find which one closes the section container
    closing_divs = re.findall(r'</div>', after_cards)
    print(f"\nClosing divs after cards: {len(closing_divs)} found")
    print(f"After cards content: {after_cards[:300]}")

    # The structure seems to be: </a></div></div></main>
    # So we need to find the end of the last </div> that closes the content sections
    # We can use the pattern: </a></div></div> (card end, section end, container end)

    # Let's use a simpler approach: replace from first section h2 to last </a></div></div>
    pattern_to_replace = r'<h2[^>]*id="sec-.*?(?=</main>)'

    # Try a more precise approach
    # Find from first h2 with id="sec-" to the last </a> followed by closing divs
    precise_pattern = r'(<h2[^>]*id="sec-)(.*?)(?=</main>)'

    match = re.search(precise_pattern, html, re.DOTALL)
    if match:
        replacement_start = match.start()
        replacement_end = match.end()

        # Adjust to include the <h2 opening
        replacement_start = match.start()
        replacement_end = html.find('</main>', match.start())

        print(f"\nReplacing from {replacement_start} to {replacement_end}")

        before_replacement = html[:replacement_start]
        after_replacement = html[replacement_end:]

        # Create the new content
        new_content = '<div id="guides-container" class="guides-grid"></div>'

        # Reconstruct HTML
        new_html = before_replacement + new_content + after_replacement

        # Verify we have the main tag closure
        if '</main>' not in new_html:
            print("ERROR: Lost </main> tag")
            return False

        print(f"\nHTML reduction: {len(original_html)} -> {len(new_html)} chars")
        print(f"Removed {len(original_html) - len(new_html)} characters")

        # Write the new HTML
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_html)

        print(f"\nSuccessfully wrote refactored HTML to {output_path}")
        return True
    else:
        print("ERROR: Could not match pattern for replacement")
        return False

if __name__ == '__main__':
    html_file = Path('/sessions/sweet-great-darwin/mnt/survival-app/index.html')
    success = refactor_html(html_file)
    exit(0 if success else 1)
