// ==UserScript==
// @name         Enso Web Inspector
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  选中页面元素并发送到 Enso，具备现代化的 UI 界面
// @author       Enso
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(() => {
  const CONFIG = {
    PORT: 18765,
    THEME: {
      PRIMARY: '#4F46E5', // Enso Indigo
      DANGER: '#EF4444',
      SUCCESS: '#10B981',
      BG: 'rgba(255, 255, 255, 0.8)',
      TEXT: '#1F2937',
      OVERLAY: 'rgba(79, 70, 229, 0.15)',
      BORDER: 'rgba(79, 70, 229, 0.5)',
    },
    ICONS: {
      TARGET: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`,
      CLOSE: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    },
  };

  class EnsoInspector {
    constructor() {
      this.isActive = false;
      this.isDragging = false;
      this.hoveredElement = null;
      this.elements = {
        btn: null,
        overlay: null,
        label: null,
        style: null,
      };
      this.menuCommandId = null;
      this.dragOffset = { x: 0, y: 0 };

      this.init();
    }

    init() {
      this.injectStyles();
      this.updateMenuCommand();
      if (this.isEnabledForSite()) {
        this.createUI();
      }
    }

    // --- Persistence ---
    isEnabledForSite() {
      const enabledSites = GM_getValue('enabledSites', {});
      return enabledSites[window.location.host] === true;
    }

    setEnabledForSite(enabled) {
      const enabledSites = GM_getValue('enabledSites', {});
      if (enabled) {
        enabledSites[window.location.host] = true;
      } else {
        delete enabledSites[window.location.host];
      }
      GM_setValue('enabledSites', enabledSites);
    }

    // --- UI Creation ---
    injectStyles() {
      if (this.elements.style) return;
      const style = document.createElement('style');
      style.textContent = `
        .enso-fab {
          position: fixed; bottom: 24px; right: 24px;
          width: 56px; height: 56px;
          background: ${CONFIG.THEME.BG};
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          color: ${CONFIG.THEME.PRIMARY};
          cursor: grab; z-index: 2147483647;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none; touch-action: none;
        }
        .enso-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.2); }
        .enso-fab:active { cursor: grabbing; transform: scale(0.95); }
        .enso-fab.active { background: ${CONFIG.THEME.PRIMARY}; color: white; transform: rotate(90deg); }
        
        .enso-overlay {
          position: fixed; pointer-events: none;
          border: 1.5px solid ${CONFIG.THEME.PRIMARY};
          background: ${CONFIG.THEME.OVERLAY};
          z-index: 2147483646; display: none;
          box-sizing: border-box; transition: all 0.1s ease-out;
          border-radius: 2px;
        }
        
        .enso-label {
          position: fixed; background: ${CONFIG.THEME.PRIMARY};
          color: white; padding: 4px 10px; font-size: 11px;
          font-family: 'SF Mono', SFMono-Regular, ui-monospace, 'DejaVu Sans Mono', monospace;
          border-radius: 6px; z-index: 2147483647; display: none;
          pointer-events: none; white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .enso-toast {
          position: fixed; top: 24px; left: 50%;
          transform: translateX(-50%) translateY(-20px);
          background: rgba(31, 41, 55, 0.95);
          backdrop-filter: blur(8px);
          color: white; padding: 12px 20px; border-radius: 12px;
          font-size: 14px; font-weight: 500;
          z-index: 2147483647; opacity: 0;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex; align-items: center; gap: 8px;
        }
        .enso-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      `;
      document.head.appendChild(style);
      this.elements.style = style;
    }

    createUI() {
      if (this.elements.btn) return;

      const btn = document.createElement('div');
      btn.className = 'enso-fab';
      btn.innerHTML = CONFIG.ICONS.TARGET;
      btn.title = '开启元素选择 (可拖动)';
      document.body.appendChild(btn);
      this.elements.btn = btn;

      const overlay = document.createElement('div');
      overlay.className = 'enso-overlay';
      document.body.appendChild(overlay);
      this.elements.overlay = overlay;

      const label = document.createElement('div');
      label.className = 'enso-label';
      document.body.appendChild(label);
      this.elements.label = label;

      this.bindEvents();
    }

    destroyUI() {
      if (this.isActive) this.toggleMode();
      Object.values(this.elements).forEach((el) => {
        el?.remove();
      });
      this.elements = { btn: null, overlay: null, label: null, style: null };
    }

    // --- Events ---
    bindEvents() {
      const { btn } = this.elements;

      let startPos = { x: 0, y: 0 };
      let btnPos = { x: 0, y: 0 };

      const onMouseDown = (e) => {
        if (e.button !== 0) return;
        this.isDragging = false;
        startPos = { x: e.clientX, y: e.clientY };
        const rect = btn.getBoundingClientRect();
        btnPos = { x: rect.left, y: rect.top };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onMouseMove = (e) => {
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          this.isDragging = true;
        }
        if (this.isDragging) {
          btn.style.left = `${btnPos.x + dx}px`;
          btn.style.top = `${btnPos.y + dy}px`;
          btn.style.right = 'auto';
          btn.style.bottom = 'auto';
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      btn.addEventListener('mousedown', onMouseDown);
      btn.addEventListener('click', (_e) => {
        if (!this.isDragging) this.toggleMode();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isActive) this.toggleMode();
      });
    }

    // --- Core Logic ---
    toggleMode() {
      this.isActive = !this.isActive;
      const { btn, overlay, label } = this.elements;

      if (this.isActive) {
        btn.classList.add('active');
        btn.innerHTML = CONFIG.ICONS.CLOSE;
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mousemove', this.handleInspectorMove.bind(this), true);
        document.addEventListener('click', this.handleInspectorClick.bind(this), true);
      } else {
        btn.classList.remove('active');
        btn.innerHTML = CONFIG.ICONS.TARGET;
        document.body.style.cursor = '';
        overlay.style.display = 'none';
        label.style.display = 'none';
        document.removeEventListener('mousemove', this.handleInspectorMove.bind(this), true);
        document.removeEventListener('click', this.handleInspectorClick.bind(this), true);
      }
    }

    handleInspectorMove(e) {
      if (!this.isActive) return;
      const target = e.target;
      if (
        target === this.elements.btn ||
        target === this.elements.overlay ||
        target === this.elements.label
      )
        return;

      this.hoveredElement = target;
      const rect = target.getBoundingClientRect();
      const { overlay, label } = this.elements;

      overlay.style.display = 'block';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;

      label.textContent = this.getSelector(target);
      label.style.display = 'block';

      let labelTop = rect.top - 28;
      if (labelTop < 5) labelTop = rect.bottom + 8;
      label.style.top = `${labelTop}px`;
      label.style.left = `${Math.max(8, rect.left)}px`;
    }

    handleInspectorClick(e) {
      if (!this.isActive) return;
      if (e.target.closest('.enso-fab')) return;

      e.preventDefault();
      e.stopPropagation();

      const el = this.hoveredElement;
      if (!el) return;

      const info = {
        element: `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${el.className ? ` class="${el.className}"` : ''}>`,
        path: this.getFullPath(el),
        attributes: this.getAttributes(el),
        styles: this.getComputedStyles(el),
        position: this.getPositionAndSize(el),
        innerText: el.innerText?.substring(0, 1000) || '',
        url: window.location.href,
        timestamp: Date.now(),
      };

      this.sendToEnso(info);
      this.toggleMode();
    }

    // --- Helpers ---
    getSelector(el) {
      const tag = el.tagName.toLowerCase();
      if (el.id) return `${tag}#${el.id}`;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.includes(':'))
          .slice(0, 2);
        if (classes.length) return `${tag}.${classes.join('.')}`;
      }
      return tag;
    }

    getFullPath(el) {
      const path = [];
      let curr = el;
      while (curr && curr !== document.body) {
        let selector = curr.tagName.toLowerCase();
        if (curr.id) {
          selector += `#${curr.id}`;
        } else if (curr.className && typeof curr.className === 'string') {
          const classes = curr.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && !c.includes(':'));
          if (classes.length) selector += `.${classes[0]}`;
        }

        const parent = curr.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === curr.tagName);
          if (siblings.length > 1) {
            selector += `:nth-of-type(${siblings.indexOf(curr) + 1})`;
          }
        }
        path.unshift(selector);
        curr = parent;
      }
      return path.join(' > ');
    }

    getAttributes(el) {
      return Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));
    }

    getComputedStyles(el) {
      const s = window.getComputedStyle(el);
      const props = [
        'color',
        'backgroundColor',
        'fontSize',
        'fontFamily',
        'fontWeight',
        'display',
        'position',
        'zIndex',
        'margin',
        'padding',
      ];
      return Object.fromEntries(props.map((p) => [p, s[p]]));
    }

    getPositionAndSize(el) {
      const r = el.getBoundingClientRect();
      return {
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      };
    }

    sendToEnso(payload) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `http://127.0.0.1:${CONFIG.PORT}/inspect`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            this.showToast('✨ 已发送至 Enso', 'success');
          } else {
            this.showToast('连接失败，请检查 Enso 是否运行', 'error');
            console.warn('Enso Inspector Error:', payload);
          }
        },
        onerror: () => {
          this.showToast('无法连接到 Enso 服务', 'error');
          console.warn('Enso Inspector Error:', payload);
        },
      });
    }

    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = 'enso-toast';
      const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
      toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 10);

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
      }, 3000);
    }

    updateMenuCommand() {
      if (this.menuCommandId !== null) GM_unregisterMenuCommand(this.menuCommandId);
      const isEnabled = this.isEnabledForSite();
      const label = isEnabled ? `关闭 Enso Web Inspector` : `开启 Enso Web Inspector`;
      this.menuCommandId = GM_registerMenuCommand(label, () => {
        if (isEnabled) {
          this.setEnabledForSite(false);
          this.destroyUI();
          this.showToast('Web Inspector 已禁用');
        } else {
          this.setEnabledForSite(true);
          this.createUI();
          this.showToast('Web Inspector 已启用', 'success');
        }
        this.updateMenuCommand();
      });
    }
  }

  // 启动
  new EnsoInspector();
})();
