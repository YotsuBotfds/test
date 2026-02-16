/**
 * Common utilities for survival app tools
 * Shared functionality across tool pages
 */

// Theme management
const ThemeManager = {
    init() {
        this.applyTheme(this.getSavedTheme());
        this.setupToggle();
    },

    getSavedTheme() {
        return localStorage.getItem('survivalAppTheme') || 'dark';
    },

    saveTheme(theme) {
        localStorage.setItem('survivalAppTheme', theme);
    },

    applyTheme(theme) {
        const root = document.documentElement;
        if (theme === 'light') {
            root.style.setProperty('--color-dark', '#f5f0e8');
            root.style.setProperty('--color-medium', '#e8dcc8');
            root.style.setProperty('--color-light', '#1a2e1a');
        } else {
            root.style.setProperty('--color-dark', '#1a2e1a');
            root.style.setProperty('--color-medium', '#2d2416');
            root.style.setProperty('--color-light', '#f5f0e8');
        }
        document.documentElement.setAttribute('data-theme', theme);
    },

    setupToggle() {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const current = this.getSavedTheme();
                const next = current === 'dark' ? 'light' : 'dark';
                this.applyTheme(next);
                this.saveTheme(next);
            });
        }
    },

    toggle() {
        const current = this.getSavedTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        this.saveTheme(next);
    }
};

// Data loading utility
const DataLoader = {
    cache: {},

    async load(url) {
        // Return cached data if available
        if (this.cache[url]) {
            return Promise.resolve(this.cache[url]);
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.cache[url] = data;
            return data;
        } catch (error) {
            console.error(`Error loading data from ${url}:`, error);
            throw error;
        }
    },

    async loadMultiple(urls) {
        return Promise.all(urls.map(url => this.load(url)));
    },

    clearCache() {
        this.cache = {};
    }
};

// Search and filter utilities
const SearchFilter = {
    search(items, searchTerm, fields = ['name', 'title']) {
        if (!searchTerm) return items;

        const term = searchTerm.toLowerCase();
        return items.filter(item =>
            fields.some(field => {
                const value = item[field];
                return value && value.toLowerCase().includes(term);
            })
        );
    },

    filter(items, filterFn) {
        return items.filter(filterFn);
    },

    filterByField(items, field, value) {
        if (value === 'all' || !value) return items;
        return items.filter(item => item[field] === value);
    }
};

// Scroll and navigation utilities
const Navigation = {
    smoothScroll(target) {
        if (typeof target === 'string') {
            target = document.querySelector(target);
        }
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    setActiveNavLink(selector) {
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('click', (e) => {
                const href = e.target.getAttribute('href');
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    document.querySelectorAll(selector).forEach(l => l.classList.remove('active'));
                    e.target.classList.add('active');
                    this.smoothScroll(href);
                }
            });
        });
    }
};

// DOM utilities
const DOM = {
    show(element) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) element.style.display = '';
    },

    hide(element) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) element.style.display = 'none';
    },

    toggle(element) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) {
            element.classList.toggle('visible');
        }
    },

    addClass(element, className) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) element.classList.add(className);
    },

    removeClass(element, className) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) element.classList.remove(className);
    },

    toggleClass(element, className) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) element.classList.toggle(className);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThemeManager, DataLoader, SearchFilter, Navigation, DOM };
}
