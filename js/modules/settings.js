// 设置模块 - 处理用户设置

import { showNotification } from './ui.js';

// 默认设置
const defaultSettings = {
    theme: 'light'
};

// 当前设置
let currentSettings = { ...defaultSettings };

/**
 * 加载用户设置
 * @returns {Promise<Object>} 用户设置
 */
export async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        
        if (!response.ok) {
            throw new Error(`获取设置失败: ${response.status}`);
        }
        
        const settings = await response.json();
        currentSettings = { ...defaultSettings, ...settings };
        applySettings(currentSettings);
        return currentSettings;
    } catch (error) {
        console.error('加载设置出错:', error);
        // 使用默认设置并应用
        applySettings(defaultSettings);
        return defaultSettings;
    }
}

/**
 * 保存用户设置
 * @param {Object} settings - 要保存的设置
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveSettings(settings) {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            throw new Error(`保存设置失败: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            currentSettings = { ...settings };
            applySettings(currentSettings);
            showNotification('设置已保存', 'success');
            return true;
        } else {
            throw new Error(result.message || '保存设置失败');
        }
    } catch (error) {
        console.error('保存设置出错:', error);
        showNotification(`保存设置失败: ${error.message}`, 'error');
        return false;
    }
}

/**
 * 获取当前设置
 * @returns {Object} 当前设置
 */
export function getCurrentSettings() {
    return { ...currentSettings };
}

/**
 * 应用设置到UI
 * @param {Object} settings - 要应用的设置
 */
function applySettings(settings) {
    // 应用主题
    document.body.setAttribute('data-theme', settings.theme || 'light');
    
    // 更新设置表单值
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = settings.theme;
    }
}

/**
 * 设置处理器对象
 */
export const settingsHandler = {
    /**
     * 设置设置相关的事件监听器
     */
    setupSettingsEvents() {
        // 打开设置按钮点击事件
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                showSettingsModal();
            });
        }
        
        // 保存设置按钮点击事件
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                const settings = {
                    theme: document.getElementById('theme-select').value
                };
                
                saveSettings(settings).then(success => {
                    if (success) {
                        document.getElementById('settings-modal').style.display = 'none';
                    }
                });
            });
        }
        
        // 重置设置按钮点击事件
        const resetSettingsBtn = document.getElementById('reset-settings-btn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                if (confirm('确定要恢复默认设置吗？')) {
                    applySettings(defaultSettings);
                    saveSettings(defaultSettings).then(success => {
                        if (success) {
                            document.getElementById('settings-modal').style.display = 'none';
                        }
                    });
                }
            });
        }
        
        // 设置模态框关闭按钮
        const settingsCloseBtn = document.querySelector('#settings-modal .close-btn');
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', () => {
                document.getElementById('settings-modal').style.display = 'none';
            });
        }
        
        // 点击模态框外部关闭
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('settings-modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // 加载并应用设置
        loadSettings();
    }
};

/**
 * 显示设置模态框
 */
function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) {
        console.error('找不到设置模态框元素');
        return;
    }
    
    // 确保表单元素显示当前设置
    applySettings(currentSettings);
    
    // 显示模态框 - 使用flex而不是block，以启用居中布局
    modal.style.display = 'flex';
}
