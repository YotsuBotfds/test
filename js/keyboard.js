/**
 * Keyboard Module - Keyboard shortcuts and card navigation
 */

/**
 * Initialize keyboard shortcuts
 * @param {Function} searchFocusCallback - Callback to focus search when '/' is pressed
 */
export function initializeKeyboardShortcuts(searchFocusCallback) {
  document.addEventListener('keydown', (e) => {
    // '/' key focuses search input
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchFocusCallback();
    }

    // '?' key shows keyboard help
    if (e.key === '?' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      showKeyboardHelp();
    }

    // 'Escape' key closes search results and modals
    if (e.key === 'Escape') {
      closeSearchResults();
    }
  });
}

/**
 * Show keyboard shortcuts help modal
 */
function showKeyboardHelp() {
  const modal = document.getElementById('keyboard-help-modal');
  if (!modal) return;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  // Focus first focusable element in modal
  const firstButton = modal.querySelector('button');
  if (firstButton) {
    firstButton.focus();
  }

  // Set up focus trap and close handler
  trapFocusInModal(modal, closeKeyboardHelpModal);
}

/**
 * Close search results
 */
function closeSearchResults() {
  const resultsContainer = document.getElementById('search-results');
  const searchInput = document.getElementById('search');
  if (resultsContainer && resultsContainer.classList.contains('active')) {
    resultsContainer.classList.remove('active');
    if (searchInput) {
      searchInput.setAttribute('aria-expanded', 'false');
    }
  }
}

/**
 * Close keyboard help modal
 */
function closeKeyboardHelpModal() {
  const modal = document.getElementById('keyboard-help-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Initialize keyboard navigation for cards
 * Allows arrow keys and Enter/Space to navigate and activate cards
 */
export function initializeCardKeyboardNav() {
  const cards = document.querySelectorAll('.card[data-guide]');
  cards.forEach((card) => {
    card.addEventListener('keydown', (e) => {
      let nextCard = null;
      // Re-query visible cards for correct navigation when filtered
      const visibleCards = Array.from(
        document.querySelectorAll('.card[data-guide]')
      ).filter(c => c.style.display !== 'none');
      const currentIndex = visibleCards.indexOf(card);

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextCard = visibleCards[currentIndex + 1];
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextCard = visibleCards[currentIndex - 1];
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Cards are <a> elements themselves, so click directly
        card.click();
      }

      if (nextCard) {
        nextCard.focus();
      }
    });
  });
}

/**
 * Get focusable elements in a container
 * @param {Element} container - The container element
 * @returns {Array<Element>} Array of focusable elements
 */
function getFocusableElements(container) {
  const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(focusableSelectors)).filter(el => {
    return !el.hasAttribute('disabled') && el.offsetParent !== null;
  });
}

/**
 * Trap focus within a modal
 * @param {Element} modal - The modal element
 * @param {Function} closeCallback - Callback to close the modal
 */
export function trapFocusInModal(modal, closeCallback) {
  const focusableElements = getFocusableElements(modal);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCallback();
      modal.setAttribute('aria-hidden', 'true');
      return;
    }

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  });
}

/**
 * Ensure visible focus indicators
 * Called to improve focus visibility across all interactive elements
 */
export function ensureFocusVisibility() {
  const style = document.createElement('style');
  style.textContent = `
    *:focus-visible {
      outline: 2px solid var(--accent, #d4a574) !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);
}

// Make closeKeyboardHelpModal available globally for init.js
if (typeof window !== 'undefined') {
  window.closeKeyboardHelpModal = closeKeyboardHelpModal;
}
