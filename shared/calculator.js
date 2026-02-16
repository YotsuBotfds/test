/**
 * Universal Calculator Component for Off-Grid Compendium
 * Usage: Include in any guide with <script src="../shared/calculator.js"></script>
 * Then create calculator instances as shown in examples
 */

class Calculator {
  // Static map to store all calculator instances
  static instances = new Map();

  constructor(containerId, config) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Calculator container "${containerId}" not found`);
      return;
    }
    this.config = config;
    this.render();

    // Register instance in static map
    Calculator.instances.set(this.config.id, this);

    // Backward compatibility: also register on window
    window[this.config.id] = this;
  }

  /**
   * Static method to retrieve calculator instances by ID
   * @param {string} id - The calculator ID
   * @returns {Calculator|undefined} The calculator instance or undefined if not found
   */
  static get(id) {
    return Calculator.instances.get(id);
  }

  /**
   * Simple XSS escape function for user input
   * @param {string} text - The text to escape
   * @returns {string} The escaped text
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  render() {
    const html = `
      <div class="calculator-widget" role="region" aria-label="${this.config.title} Calculator" style="
        background: var(--surface);
        border: 2px solid var(--accent2);
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      ">
        <h3 style="color: var(--accent2); margin-top: 0; display: flex; align-items: center; gap: 10px;">
          🧮 ${Calculator.escapeHtml(this.config.title)}
        </h3>
        <p style="color: var(--muted); font-size: 0.9em; margin-bottom: 15px;">
          ${Calculator.escapeHtml(this.config.description)}
        </p>
        <div class="calc-inputs">
          ${this.renderInputs()}
        </div>
        <button class="calculator-btn" data-calculator-id="${this.config.id}" style="
          background: var(--accent);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1em;
          margin-top: 15px;
          transition: all 0.2s;
          font-weight: 600;
        ">
          Calculate
        </button>
        <div id="${this.config.id}-result" class="calc-result" aria-live="polite" aria-atomic="true" style="
          margin-top: 15px;
          padding: 15px;
          background: var(--card);
          border-left: 4px solid var(--accent2);
          border-radius: 4px;
          display: none;
          animation: fadeIn 0.3s;
        "></div>
      </div>
    `;
    this.container.innerHTML = html;

    // Add event listener to the button instead of inline onclick
    const button = this.container.querySelector('.calculator-btn');
    if (button) {
      button.addEventListener('click', () => this.calculate());
    }
  }

  renderInputs() {
    return this.config.inputs.map(input => {
      if (input.type === 'select') {
        return `
          <div style="margin: 10px 0;">
            <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;" for="${this.config.id}-${input.id}">
              ${Calculator.escapeHtml(input.label)}:
            </label>
            <select
              id="${this.config.id}-${input.id}"
              aria-label="${Calculator.escapeHtml(input.label)}"
              style="
                width: 100%;
                padding: 10px;
                background: var(--bg);
                color: var(--text);
                border: 1px solid var(--border);
                border-radius: 4px;
                font-size: 1em;
                cursor: pointer;
              "
            >
              ${input.options.map(opt =>
                `<option value="${opt.value}">${Calculator.escapeHtml(opt.label)}</option>`
              ).join('')}
            </select>
          </div>
        `;
      } else {
        return `
          <div style="margin: 10px 0;">
            <label style="display: block; margin-bottom: 5px; color: var(--text); font-weight: 500;" for="${this.config.id}-${input.id}">
              ${Calculator.escapeHtml(input.label)}:
            </label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input
                type="${input.type || 'number'}"
                id="${this.config.id}-${input.id}"
                placeholder="${input.placeholder || ''}"
                aria-label="${Calculator.escapeHtml(input.label)}"
                ${input.min !== undefined ? `min="${input.min}"` : ''}
                ${input.max !== undefined ? `max="${input.max}"` : ''}
                ${input.step ? `step="${input.step}"` : ''}
                style="
                  flex: 1;
                  padding: 10px;
                  background: var(--bg);
                  color: var(--text);
                  border: 1px solid var(--border);
                  border-radius: 4px;
                  font-size: 1em;
                "
              >
              ${input.unit ? `<span style="color: var(--muted); min-width: 60px;">${Calculator.escapeHtml(input.unit)}</span>` : ''}
            </div>
          </div>
        `;
      }
    }).join('');
  }

  getInputValue(inputId) {
    const elem = document.getElementById(`${this.config.id}-${inputId}`);
    if (!elem) return NaN;
    const value = elem.type === 'select-one' ? elem.value : parseFloat(elem.value);
    return value;
  }

  getSelectValue(inputId) {
    const elem = document.getElementById(`${this.config.id}-${inputId}`);
    return elem ? elem.value : '';
  }

  /**
   * Validate input values before calculation
   * @param {string} inputId - The input ID
   * @returns {boolean} True if the value is valid (not NaN and not empty)
   */
  validateInput(inputId) {
    const value = this.getInputValue(inputId);
    return !isNaN(value) && value !== null && value !== undefined && value !== '';
  }

  /**
   * Show result with proper sanitization
   * Accepts either plain text (uses textContent) or HTML structure (uses innerHTML with sanitization)
   * @param {string} content - The content to display
   * @param {boolean} isHtml - Whether the content contains HTML (default: false)
   */
  showResult(content, isHtml = false) {
    const resultDiv = document.getElementById(`${this.config.id}-result`);
    if (resultDiv) {
      if (isHtml) {
        // Only use innerHTML if HTML structure is actually needed
        resultDiv.innerHTML = content;
      } else {
        // Use textContent for plain text to prevent XSS
        resultDiv.textContent = content;
      }
      resultDiv.style.display = 'block';
    }
  }

  calculate() {
    // Override in specific calculator instances
    console.error('calculate() must be implemented');
    this.showResult('⚠️ Calculator not properly configured', false);
  }
}

// Add CSS animations and hover effects
if (!document.getElementById('calculator-styles')) {
  const style = document.createElement('style');
  style.id = 'calculator-styles';
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .calc-inputs input:focus,
    .calc-inputs select:focus {
      outline: none;
      border-color: var(--accent) !important;
      box-shadow: 0 0 8px rgba(233, 69, 96, 0.3);
    }

    .calculator-btn {
      transition: all 0.2s ease !important;
    }

    .calculator-btn:hover {
      background: var(--accent2) !important;
    }

    .calculator-btn:active {
      transform: scale(0.98);
    }
  `;
  document.head.appendChild(style);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Calculator;
}
