// ==UserScript==
// @name         Enso Web Inspector
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  选中页面元素并发送到 Enso
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
  const ENSO_PORT = 18765;
  const currentHost = window.location.host;

  let isActive = false;
  let hoveredElement = null;
  let overlay = null;
  let label = null;
  let btn = null;
  let menuCommandId = null;

  // 拖动状态
  let isDragging = false;
  let dragStartX, dragStartY, btnStartX, btnStartY;

  // 检查当前站点是否已启用
  function isEnabledForSite() {
    const enabledSites = GM_getValue('enabledSites', {});
    return enabledSites[currentHost] === true;
  }

  // 设置当前站点启用状态
  function setEnabledForSite(enabled) {
    const enabledSites = GM_getValue('enabledSites', {});
    if (enabled) {
      enabledSites[currentHost] = true;
    } else {
      delete enabledSites[currentHost];
    }
    GM_setValue('enabledSites', enabledSites);
  }

  // 更新菜单命令
  function updateMenuCommand() {
    if (menuCommandId !== null) {
      GM_unregisterMenuCommand(menuCommandId);
    }

    const isEnabled = isEnabledForSite();
    const menuLabel = isEnabled
      ? `❌ 在 ${currentHost} 禁用 Web Inspector`
      : `✅ 在 ${currentHost} 启用 Web Inspector`;

    menuCommandId = GM_registerMenuCommand(menuLabel, () => {
      if (isEnabled) {
        disableInspector();
      } else {
        enableInspector();
      }
    });
  }

  // 启用 Inspector
  function enableInspector() {
    setEnabledForSite(true);
    createUI();
    updateMenuCommand();
    showToast('✅ Web Inspector 已在此网站启用');
  }

  // 禁用 Inspector
  function disableInspector() {
    setEnabledForSite(false);
    destroyUI();
    updateMenuCommand();
    showToast('❌ Web Inspector 已在此网站禁用');
  }

  // 创建 UI 元素
  function createUI() {
    if (btn) return; // 已创建

    // 创建浮动按钮
    btn = document.createElement('div');
    btn.innerHTML = '🎯';
    btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: #4CAF50;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: grab;
            z-index: 999999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: background 0.3s, transform 0.1s;
            user-select: none;
        `;
    btn.title = '开启元素选择模式（可拖动）';
    document.body.appendChild(btn);

    // 拖动功能
    btn.addEventListener('mousedown', handleBtnMouseDown);
    btn.addEventListener('click', handleBtnClick);

    // 创建高亮覆盖层
    overlay = document.createElement('div');
    overlay.style.cssText = `
            position: fixed;
            pointer-events: none;
            border: 2px solid #2196F3;
            background: rgba(33, 150, 243, 0.1);
            z-index: 999998;
            display: none;
            box-sizing: border-box;
        `;
    document.body.appendChild(overlay);

    // 创建选择器标签
    label = document.createElement('div');
    label.style.cssText = `
            position: fixed;
            background: #2196F3;
            color: white;
            padding: 4px 8px;
            font-size: 12px;
            font-family: monospace;
            border-radius: 4px;
            z-index: 999999;
            display: none;
            pointer-events: none;
            white-space: nowrap;
        `;
    document.body.appendChild(label);
  }

  // 销毁 UI 元素
  function destroyUI() {
    // 先退出选择模式
    if (isActive) {
      toggleMode();
    }

    if (btn) {
      btn.remove();
      btn = null;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (label) {
      label.remove();
      label = null;
    }
  }

  // 按钮鼠标按下处理
  function handleBtnMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = btn.getBoundingClientRect();
    btnStartX = rect.left;
    btnStartY = rect.top;
    btn.style.cursor = 'grabbing';
    btn.style.transition = 'background 0.3s';

    const onMouseMove = (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;
      }
      if (isDragging) {
        btn.style.left = `${btnStartX + dx}px`;
        btn.style.top = `${btnStartY + dy}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
    };

    const onMouseUp = () => {
      btn.style.cursor = 'grab';
      btn.style.transition = 'background 0.3s, transform 0.1s';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // 按钮点击处理
  function handleBtnClick() {
    if (!isDragging) {
      toggleMode();
    }
  }

  // Toast 样式（只创建一次）
  let toastStyle = null;
  function ensureToastStyle() {
    if (toastStyle) return;
    toastStyle = document.createElement('style');
    toastStyle.textContent = `
            @keyframes ensoToastIn { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
            @keyframes ensoToastOut { from { opacity: 1; } to { opacity: 0; } }
        `;
    document.head.appendChild(toastStyle);
  }

  // Toast 提示
  function showToast(message) {
    ensureToastStyle();
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #323232;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 9999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: ensoToastIn 0.3s ease;
        `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'ensoToastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // 生成元素选择器
  function getSelector(el) {
    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
    let selector = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const classes = el.className
        .trim()
        .split(/\s+/)
        .filter((c) => c)
        .slice(0, 3);
      if (classes.length) selector += `.${classes.join('.')}`;
    }
    return selector;
  }

  // 生成完整路径
  function getFullPath(el) {
    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className && typeof current.className === 'string') {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c);
        if (classes.length) selector += `.${classes.join('.')}`;
      }
      // 添加索引
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `[${index}]`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  // 获取元素属性
  function getAttributes(el) {
    const attrs = {};
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  // 获取计算样式
  function getComputedStyles(el) {
    const computed = window.getComputedStyle(el);
    return {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      display: computed.display,
      position: computed.position,
      padding: computed.padding,
      margin: computed.margin,
      border: computed.border,
    };
  }

  // 获取位置和尺寸
  function getPositionAndSize(el) {
    const rect = el.getBoundingClientRect();
    return {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }

  // 发送数据到 Enso
  function sendToEnso(info) {
    const payload = {
      element: info.element,
      path: info.path,
      attributes: info.attributes,
      styles: info.styles,
      position: info.position,
      innerText: info.innerText,
      url: window.location.href,
      timestamp: Date.now(),
    };

    GM_xmlhttpRequest({
      method: 'POST',
      url: `http://127.0.0.1:${ENSO_PORT}/inspect`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) {
          showToast('✅ 已发送到 Enso');
        } else {
          showToast('❌ 发送失败，请确认 Enso 已开启 Web Inspector');
          logToConsole(info);
        }
      },
      onerror: () => {
        showToast('❌ 发送失败，请确认 Enso 已开启 Web Inspector');
        logToConsole(info);
      },
    });
  }

  // 降级：打印到控制台
  function logToConsole(info) {
    console.log('%c📦 Element Inspector', 'font-size: 16px; font-weight: bold; color: #2196F3;');
    console.log('%cELEMENT', 'font-weight: bold; color: #1976D2;', info.element);
    console.log('%cPATH', 'font-weight: bold; color: #1976D2;', info.path);
    console.log('%cATTRIBUTES', 'font-weight: bold; color: #1976D2;', info.attributes);
    console.log('%cCOMPUTED STYLES', 'font-weight: bold; color: #1976D2;', info.styles);
    console.log('%cPOSITION & SIZE', 'font-weight: bold; color: #1976D2;', info.position);
    console.log('%cINNER TEXT', 'font-weight: bold; color: #1976D2;', info.innerText);
    console.log('---');
  }

  // 鼠标移动处理
  function handleMouseMove(e) {
    if (!isActive) return;

    const target = e.target;
    if (target === btn || target === overlay || target === label) return;

    hoveredElement = target;
    const rect = target.getBoundingClientRect();

    // 更新覆盖层
    overlay.style.display = 'block';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // 更新标签
    label.textContent = getSelector(target);
    label.style.display = 'block';

    // 标签位置：优先显示在元素上方
    let labelTop = rect.top - 28;
    if (labelTop < 5) labelTop = rect.bottom + 5;
    label.style.top = `${labelTop}px`;
    label.style.left = `${Math.max(5, rect.left)}px`;
  }

  // 点击处理
  function handleClick(e) {
    if (!isActive) return;
    if (e.target === btn) return;

    e.preventDefault();
    e.stopPropagation();

    const el = hoveredElement;
    if (!el) return;

    const info = {
      element: `<${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ''}${el.id ? ` id="${el.id}"` : ''}>`,
      path: getFullPath(el),
      attributes: getAttributes(el),
      styles: getComputedStyles(el),
      position: getPositionAndSize(el),
      innerText: el.innerText?.substring(0, 500) || '',
    };

    // 发送到 Enso
    sendToEnso(info);

    // 也输出原始元素引用，方便在控制台进一步操作
    console.log('%c🔗 Element Reference:', 'font-weight: bold; color: #4CAF50;', el);

    // 退出选择模式
    toggleMode();
  }

  // 切换选择模式
  function toggleMode() {
    isActive = !isActive;

    if (isActive) {
      btn.style.background = '#F44336';
      btn.innerHTML = '✖';
      btn.title = '关闭元素选择模式';
      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);
      console.log('%c🎯 Element Inspector 已开启', 'font-size: 14px; color: #4CAF50;');
    } else {
      btn.style.background = '#4CAF50';
      btn.innerHTML = '🎯';
      btn.title = '开启元素选择模式';
      document.body.style.cursor = '';
      overlay.style.display = 'none';
      label.style.display = 'none';
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      console.log('%c🎯 Element Inspector 已关闭', 'font-size: 14px; color: #F44336;');
    }
  }

  // ESC 键退出
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isActive) {
      toggleMode();
    }
  });

  // 初始化
  updateMenuCommand();

  // 如果当前站点已启用，自动创建 UI
  if (isEnabledForSite()) {
    createUI();
  }
})();
