/**
 * Share Functionality Module
 * Adds share buttons to guide cards with Web Share API fallback to clipboard
 */

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} True if successful
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const result = document.execCommand('copy');
      document.body.removeChild(textarea);
      return result;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Generate a shareable URL for a guide
 * @param {string} guideUrl - The guide URL (e.g., guides/fire-starting.html)
 * @returns {string} Shareable URL
 */
function generateShareUrl(guideUrl) {
  // If it's already a full URL, return it
  if (guideUrl.startsWith('http://') || guideUrl.startsWith('https://')) {
    return guideUrl;
  }

  // Generate a clean, relative path that works from any page
  return `${window.location.origin}${window.location.pathname}?guide=${encodeURIComponent(guideUrl)}`;
}

/**
 * Share a guide using Web Share API or clipboard
 * @param {string} url - The URL to share
 * @param {string} title - The title of the guide
 * @returns {Promise<boolean>} True if shared successfully
 */
export async function shareGuide(url, title) {
  try {
    // Check if Web Share API is available
    if (navigator.share) {
      await navigator.share({
        title: title,
        text: `Check out this guide: ${title}`,
        url: generateShareUrl(url),
      });
      return true;
    } else {
      // Fallback: copy to clipboard
      const shareUrl = generateShareUrl(url);
      const success = await copyToClipboard(shareUrl);
      if (success) {
        showToast('Link copied to clipboard!');
      } else {
        showToast('Failed to copy link');
      }
      return success;
    }
  } catch (error) {
    // Share was cancelled or failed
    if (error.name !== 'AbortError') {
      console.error('Share failed:', error);
      showToast('Failed to share guide');
    }
    return false;
  }
}

/**
 * Initialize share buttons on all guide cards
 * Adds click handlers to share buttons and prevents card navigation
 */
export function initShareButtons() {
  const shareButtons = document.querySelectorAll('.card .share-btn');

  shareButtons.forEach(button => {
    button.addEventListener('click', async (event) => {
      // Prevent navigation to guide
      event.preventDefault();
      event.stopPropagation();

      // Get the guide title and URL from the parent card
      const card = button.closest('.card');
      if (!card) return;

      const title = card.querySelector('h3')?.textContent || 'Guide';
      const url = card.getAttribute('href') || '';

      // Share the guide
      await shareGuide(url, title);
    });
  });
}

/**
 * Add share button to a card element
 * @param {HTMLElement} card - The card element
 */
export function addShareButtonToCard(card) {
  // Check if share button already exists
  if (card.querySelector('.share-btn')) {
    return;
  }

  // Create share button
  const button = document.createElement('button');
  button.className = 'share-btn';
  button.setAttribute('type', 'button');
  button.setAttribute('aria-label', 'Share this guide');
  button.setAttribute('title', 'Share this guide');
  button.innerHTML = '🔗';

  // Add to card
  card.appendChild(button);

  // Add event listener
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const title = card.querySelector('h3')?.textContent || 'Guide';
    const url = card.getAttribute('href') || '';

    await shareGuide(url, title);
  });
}
