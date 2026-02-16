/**
 * Table of Contents Module - Category Bar with Dropdowns
 * Renders a horizontal bar of category buttons, each with a dropdown
 * listing guides in that category. Card sections are collapsed by default
 * and expand on click.
 */

import { forceRenderSection, getGuidesData } from './cards.js';

let _categoryBar = null;

/**
 * Initialize TOC - converts static grid to dynamic dropdown bar
 * Must be called after cards.initializeCards()
 */
export function initializeTOC() {
  const tocNav = document.getElementById('toc');
  if (!tocNav) return;

  // Build dropdown bar from TOC items
  const tocItems = tocNav.querySelectorAll('.toc-item[href^="#sec-"]');
  if (!tocItems.length) return;

  // Replace the static grid with a dynamic category bar
  const titleEl = tocNav.querySelector('.toc-title');
  const gridEl = tocNav.querySelector('.toc-grid');
  if (gridEl) gridEl.remove();
  if (titleEl) titleEl.remove();

  const bar = document.createElement('div');
  bar.className = 'category-bar';
  bar.setAttribute('role', 'menubar');
  bar.setAttribute('aria-label', 'Category navigation');

  tocItems.forEach(link => {
    const href = link.getAttribute('href');
    const category = href.substring(5); // "#sec-foo" → "foo"
    const icon = link.querySelector('.toc-icon')?.textContent || '';
    const name = link.querySelector('span:last-child')?.textContent || category;

    const wrapper = document.createElement('div');
    wrapper.className = 'category-bar-item';

    const btn = document.createElement('button');
    btn.className = 'category-bar-btn';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('data-category', category);
    btn.innerHTML = `<span class="cat-icon">${icon}</span><span class="cat-name">${name}</span><span class="cat-chevron">▾</span>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'category-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', `${name} guides`);

    // "View all" link at top
    const viewAll = document.createElement('a');
    viewAll.className = 'category-dropdown-viewall';
    viewAll.href = href;
    viewAll.textContent = `View all ${name}`;
    viewAll.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllDropdowns();
      expandSection(category);
      scrollToSection(category);
    });
    dropdown.appendChild(viewAll);

    // Guide list will be populated on first open (lazy)
    dropdown.dataset.populated = 'false';
    dropdown.dataset.category = category;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(wrapper, dropdown);
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);
    bar.appendChild(wrapper);
  });

  tocNav.appendChild(bar);
  _categoryBar = bar;

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target)) {
      closeAllDropdowns();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDropdowns();
  });

  // Make card sections collapsed by default
  collapseSections();

  // Add click-to-expand on section headings
  setupSectionToggles();
}

/**
 * Populate a dropdown with guide links (lazy, on first open)
 */
function populateDropdown(dropdown) {
  if (dropdown.dataset.populated === 'true') return;

  const category = dropdown.dataset.category;
  const guides = getGuidesData();
  if (!guides) return;

  const categoryGuides = guides.filter(g => g.category === category);

  if (categoryGuides.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'category-dropdown-empty';
    empty.textContent = 'No guides in this category';
    dropdown.appendChild(empty);
  } else {
    categoryGuides.forEach(guide => {
      const item = document.createElement('a');
      item.className = 'category-dropdown-item';
      item.href = guide.url || `guides/${guide.id}.html`;
      item.innerHTML = `<span class="dd-icon">${guide.icon || '📖'}</span><span class="dd-title">${guide.title}</span>`;
      dropdown.appendChild(item);
    });
  }

  dropdown.dataset.populated = 'true';
}

/**
 * Toggle a specific dropdown
 */
function toggleDropdown(wrapper, dropdown) {
  const isOpen = wrapper.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    populateDropdown(dropdown);
    wrapper.classList.add('open');
    wrapper.querySelector('.category-bar-btn').setAttribute('aria-expanded', 'true');
  }
}

/**
 * Close all dropdowns
 */
function closeAllDropdowns() {
  if (!_categoryBar) return;
  _categoryBar.querySelectorAll('.category-bar-item.open').forEach(item => {
    item.classList.remove('open');
    item.querySelector('.category-bar-btn').setAttribute('aria-expanded', 'false');
  });
}

/**
 * Collapse all card sections by default
 */
function collapseSections() {
  const sections = document.querySelectorAll('.card-section');
  sections.forEach(section => {
    section.classList.add('section-collapsed');
  });
}

/**
 * Expand a specific section
 */
function expandSection(category) {
  forceRenderSection(category);
  const section = document.querySelector(`[data-section="${category}"]`);
  if (section) {
    section.classList.remove('section-collapsed');
    section.classList.add('section-expanded');
  }
}

/**
 * Scroll to a section heading
 */
async function scrollToSection(category) {
  await new Promise(r => requestAnimationFrame(r));
  const target = document.getElementById(`sec-${category}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#sec-${category}`);
  }
}

/**
 * Add click-to-toggle on section headings
 */
function setupSectionToggles() {
  const headings = document.querySelectorAll('.section-heading');
  headings.forEach(heading => {
    heading.style.cursor = 'pointer';
    heading.setAttribute('role', 'button');
    heading.setAttribute('aria-expanded', 'false');

    // Add toggle chevron
    const chevron = document.createElement('span');
    chevron.className = 'section-chevron';
    chevron.textContent = ' ▸';
    heading.appendChild(chevron);

    heading.addEventListener('click', () => {
      const id = heading.id; // e.g. "sec-survival"
      const category = id.substring(4);
      const section = document.querySelector(`[data-section="${category}"]`);
      if (!section) return;

      const isCollapsed = section.classList.contains('section-collapsed');
      if (isCollapsed) {
        forceRenderSection(category);
        section.classList.remove('section-collapsed');
        section.classList.add('section-expanded');
        heading.setAttribute('aria-expanded', 'true');
        chevron.textContent = ' ▾';
      } else {
        section.classList.add('section-collapsed');
        section.classList.remove('section-expanded');
        heading.setAttribute('aria-expanded', 'false');
        chevron.textContent = ' ▸';
      }
    });
  });
}
