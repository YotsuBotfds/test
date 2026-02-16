/**
 * Shared JavaScript for all guide pages
 * Handles: collapsible TOC on mobile, floating element fixes
 */
(function() {
  'use strict';

  // --- Collapsible TOC on mobile ---
  function initCollapsibleTOC() {
    const tocs = document.querySelectorAll('.toc, nav.toc');
    tocs.forEach(function(toc) {
      // Skip if already initialized
      if (toc.classList.contains('collapsible')) return;

      const heading = toc.querySelector('h2');
      if (!heading) return;

      // Wrap existing content (everything after h2) in a container
      const content = document.createElement('div');
      content.className = 'toc-content';
      const children = Array.from(toc.children);
      let afterHeading = false;
      children.forEach(function(child) {
        if (child === heading) {
          afterHeading = true;
          return;
        }
        if (afterHeading) {
          content.appendChild(child);
        }
      });
      toc.appendChild(content);

      // Create toggle button
      const toggle = document.createElement('button');
      toggle.className = 'toc-toggle';
      toggle.textContent = 'Table of Contents';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', 'toc-content');
      toc.insertBefore(toggle, heading);

      toc.classList.add('collapsible');

      // Start collapsed on mobile
      if (window.innerWidth <= 768) {
        content.classList.add('collapsed');
        content.style.maxHeight = '0';
        toggle.classList.add('collapsed');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
      }

      toggle.addEventListener('click', function() {
        const isCollapsed = content.classList.contains('collapsed');
        if (isCollapsed) {
          content.classList.remove('collapsed');
          content.style.maxHeight = content.scrollHeight + 'px';
          toggle.classList.remove('collapsed');
          toggle.setAttribute('aria-expanded', 'true');
        } else {
          content.style.maxHeight = '0';
          content.classList.add('collapsed');
          toggle.classList.add('collapsed');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  // --- Fix bookmark panel positioning on mobile ---
  function fixBookmarkPanels() {
    if (window.innerWidth > 768) return;

    // Look for dynamically created bookmark panels and adjust
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          var style = node.style;
          if (style && style.position === 'fixed' && style.bottom) {
            // Bookmark panel button - make it smaller on mobile
            if (style.width === '50px' && style.height === '50px') {
              style.width = '40px';
              style.height = '40px';
              style.bottom = '60px';
              style.right = '10px';
              style.fontSize = '1.2em';
            }
            // Bookmark panel itself - make it fit mobile
            if (style.width === '300px') {
              style.width = '260px';
              style.right = '10px';
              style.bottom = '110px';
              style.maxHeight = '300px';
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initCollapsibleTOC();
      fixBookmarkPanels();
    });
  } else {
    initCollapsibleTOC();
    fixBookmarkPanels();
  }
})();
