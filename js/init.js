/**
 * Immediate UI Initialization
 * Handles DOM interactions that need to work before module scripts load.
 * Loaded as a regular (non-module) script to run immediately.
 */

// Utils dropdown toggle
document.getElementById('utils-toggle-btn').addEventListener('click', function(e) {
  e.stopPropagation();
  var d = document.getElementById('utils-dropdown');
  var open = d.classList.toggle('open');
  this.setAttribute('aria-expanded', open);
});

document.addEventListener('click', function() {
  var d = document.getElementById('utils-dropdown');
  if (d) d.classList.remove('open');
  var b = document.getElementById('utils-toggle-btn');
  if (b) b.setAttribute('aria-expanded', 'false');
});

// More filters toggle
document.getElementById('more-filters-btn').addEventListener('click', function() {
  var o = document.getElementById('filter-overflow');
  var open = o.classList.toggle('open');
  this.setAttribute('aria-expanded', open);
  this.textContent = open ? 'Less \u25B4' : 'More \u25BE';
});

// Random guide keyboard shortcut (r key)
document.addEventListener('keydown', function(e) {
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
    var btn = document.getElementById('random-guide-btn');
    if (btn) btn.click();
  }
});

// Utility button handlers (wired up here; window functions are set by app.js modules)
document.getElementById('btn-export').addEventListener('click', function() {
  if (window.showExportModal) window.showExportModal();
});
document.getElementById('btn-import').addEventListener('click', function() {
  if (window.importProgress) window.importProgress();
});
document.getElementById('offline-manager-btn').addEventListener('click', function() {
  if (window.offlineManagerUI) window.offlineManagerUI.openModal();
});
document.getElementById('btn-reset').addEventListener('click', function() {
  if (window.resetProgress) window.resetProgress();
});
document.getElementById('keyboard-help-close-btn').addEventListener('click', function() {
  if (window.closeKeyboardHelpModal) window.closeKeyboardHelpModal();
});
