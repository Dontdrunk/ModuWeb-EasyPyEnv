// 环境管理模块 - 处理Python环境切换和管理

import { getPythonEnvironments, saveEnvironment, deleteEnvironment, switchEnvironment } from './api.js';
import { showNotification, showLoadingMessage } from './ui.js';
import { refreshDependencies } from './core.js';

// 当前加载的环境信息
let currentEnvironments = {
    environments: [],
    current: null
};

/**
 * 环境管理器对象
 */
export const environmentManager = {
    /**
     * 初始化环境管理器
     * @returns {Promise<boolean>} 是否成功初始化
     */
    async initialize() {
        try {
            const result = await getPythonEnvironments();
            currentEnvironments = result;
            this.updateEnvironmentButton();
            return true;
        } catch (error) {
            console.error('初始化环境管理器失败:', error);
            return false;
        }
    },
    
    /**
     * 设置环境管理相关的事件监听器
     */
    setupEnvironmentEvents() {
        // 环境选择按钮点击事件
        const envButton = document.getElementById('env-selector');
        if (envButton) {
            envButton.addEventListener('click', () => {
                this.showEnvironmentModal();
            });
        }
        
        // 添加环境模态框事件
        document.addEventListener('DOMContentLoaded', () => {
            // 确认此时DOM已完全加载
            this.setupModalEvents();
        });
    },
    
    /**
     * 设置模态框内部的事件
     */
    setupModalEvents() {
        const modal = document.getElementById('environments-modal');
        if (!modal) return;
        
        // 关闭按钮
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }
        
        // 点击模态框外部关闭
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // 添加环境表单提交
        const addForm = document.getElementById('add-environment-form');
        if (addForm) {
            addForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddEnvironment();
            });
        }
          // 不再需要浏览按钮的处理
    },
    
    /**
     * 显示环境管理模态框
     */
    async showEnvironmentModal() {
        // 先创建或更新模态框
        await this.createOrUpdateModal();
        
        const modal = document.getElementById('environments-modal');
        if (modal) {
            // 重新加载环境列表
            await this.loadEnvironments();
            
            // 显示模态框
            modal.style.display = 'flex';
        }
    },
    
    /**
     * 创建或更新环境模态框
     */
    async createOrUpdateModal() {
        let modal = document.getElementById('environments-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'environments-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-content environments-modal-content">
                <span class="close-btn">&times;</span>
                <h2>Python环境管理</h2>
                
                <div class="environment-section">
                    <div class="section-header">
                        <h3>已配置的环境</h3>
                    </div>
                    <div id="environment-list" class="environment-list">
                        <div class="loading">加载环境列表中...</div>
                    </div>
                </div>
                
                <div class="add-environment-section">
                    <h3>添加新环境</h3>
                    <form id="add-environment-form" class="add-environment-form">
                        <div class="form-field">
                            <label for="env-name">环境名称</label>
                            <input type="text" id="env-name" placeholder="例如: Python 3.10 虚拟环境" required>
                        </div>
                          <div class="form-field">
                            <label for="env-path">Python可执行文件路径</label>
                            <div class="path-input-group">
                                <input type="text" id="env-path" placeholder="例如: C:\\Python310\\python.exe" required>
                            </div>
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="primary-btn">添加环境</button>
                        </div>
                    </form>
                </div>
                
                <div id="search-results-container" style="display:none;">
                    <div class="search-results-header">
                        找到的Python环境
                        <span id="refresh-search" class="refresh-icon" title="刷新">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                        </span>
                    </div>
                    <div class="search-results" id="found-environments">
                    </div>
                </div>
            </div>
        `;
        
        // 设置新增的事件监听器
        this.setupModalEvents();
    },
    
    /**
     * 加载环境列表
     */
    async loadEnvironments() {
        try {
            const result = await getPythonEnvironments();
            currentEnvironments = result;
            
            const listElement = document.getElementById('environment-list');
            if (!listElement) return;
            
            if (currentEnvironments.environments.length === 0) {
                listElement.innerHTML = '<div class="no-environments">未找到已配置的Python环境</div>';
                return;
            }
            
            let html = '';
            for (const env of currentEnvironments.environments) {
                const isActive = env.id === currentEnvironments.current;
                
                html += `
                    <div class="environment-item ${isActive ? 'active' : ''}">                        <div class="environment-info">
                            <div class="environment-name">
                                ${env.name}
                            </div>
                            <div class="environment-details">
                                <span class="environment-detail">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                    </svg>
                                    版本: ${env.version}
                                </span>
                                <span class="environment-detail">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                                    </svg>
                                    路径: ${env.path}
                                </span>
                            </div>
                        </div>
                        <div class="environment-actions">
                            ${isActive ? 
                                `<button class="switch-btn" disabled>当前环境</button>` :
                                `<button class="switch-btn" data-env-id="${env.id}">切换到此环境</button>`
                            }
                            ${env.type === 'system' ? '' : `<button class="delete-btn" data-env-id="${env.id}">删除</button>`}
                        </div>
                    </div>
                `;
            }
            
            listElement.innerHTML = html;
            
            // 添加切换和删除按钮的事件处理
            listElement.querySelectorAll('.switch-btn').forEach(btn => {
                if (!btn.disabled) {
                    btn.addEventListener('click', async () => {
                        const envId = btn.dataset.envId;
                        await this.handleSwitchEnvironment(envId);
                    });
                }
            });
            
            listElement.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const envId = btn.dataset.envId;
                    if (confirm('确定要删除此环境配置吗？这不会删除环境本身，只会从列表中移除。')) {
                        await this.handleDeleteEnvironment(envId);
                    }
                });
            });
            
        } catch (error) {
            console.error('加载环境列表失败:', error);
            const listElement = document.getElementById('environment-list');
            if (listElement) {
                listElement.innerHTML = '<div class="error">加载环境列表失败</div>';
            }
        }
    },
    
    /**
     * 处理添加环境
     */
    async handleAddEnvironment() {
        const nameInput = document.getElementById('env-name');
        const pathInput = document.getElementById('env-path');
        
        if (!nameInput || !pathInput) return;
        
        const name = nameInput.value.trim();
        const path = pathInput.value.trim();
        
        if (!name || !path) {
            showNotification('请输入环境名称和路径', 'error');
            return;
        }
        
        try {
            const environment = {
                name,
                path,
                type: 'custom'  // 默认类型
            };
            
            showLoadingMessage('正在添加环境...');
            
            const result = await saveEnvironment(environment);
            
            if (result.success) {
                showNotification('环境添加成功', 'success');
                nameInput.value = '';
                pathInput.value = '';
                
                // 重新加载环境列表
                await this.loadEnvironments();
            } else {
                showNotification(result.message || '添加环境失败', 'error');
            }
        } catch (error) {
            console.error('添加环境失败:', error);
            showNotification('添加环境失败: ' + (error.message || '未知错误'), 'error');
        }
    },
    
    /**
     * 处理删除环境
     * @param {string} environmentId - 环境ID
     */
    async handleDeleteEnvironment(environmentId) {
        try {
            const result = await deleteEnvironment(environmentId);
            
            if (result.success) {
                showNotification('环境删除成功', 'success');
                
                // 重新加载环境列表
                await this.loadEnvironments();
                
                // 更新环境选择按钮
                this.updateEnvironmentButton();
            } else {
                showNotification(result.message || '删除环境失败', 'error');
            }
        } catch (error) {
            console.error('删除环境失败:', error);
            showNotification('删除环境失败: ' + (error.message || '未知错误'), 'error');
        }
    },
      /**
     * 处理切换环境
     * @param {string} environmentId - 环境ID
     */
    async handleSwitchEnvironment(environmentId) {
        try {
            showLoadingMessage('正在切换Python环境...');
            
            const result = await switchEnvironment(environmentId);
            
            if (result.success) {
                if (result.needsRefresh) {
                    showNotification('环境切换成功，正在刷新依赖列表...', 'success');
                    
                    // 重新加载环境列表
                    await this.loadEnvironments();
                    
                    // 更新环境选择按钮
                    this.updateEnvironmentButton();
                    
                    // 先触发依赖描述更新 - 告知服务器环境已经变更
                    // 导入 checkDescriptionUpdates，如果还没有导入
                    const { checkDescriptionUpdates } = await import('./api.js');
                    const timestamp = Date.now() / 1000;
                    await checkDescriptionUpdates(timestamp, false, true);  // environmentChanged=true
                    
                    // 刷新依赖列表 - 强制从后端获取数据而不使用缓存
                    await refreshDependencies(false);
                } else {
                    showNotification(result.message || '环境未更改', 'info');
                    // 无需刷新
                }
            } else {
                showNotification(result.message || '切换环境失败', 'error');
            }
        } catch (error) {
            console.error('切换环境失败:', error);
            showNotification('切换环境失败: ' + (error.message || '未知错误'), 'error');
        }
    },/**
     * 此函数已不再使用，保留为兼容接口
     * @param {string} type - 环境类型
     * @returns {string} 空字符串
     */
    getEnvironmentTypeLabel(type) {
        return '';
    },
    
    /**
     * 更新环境选择按钮的显示
     */
    updateEnvironmentButton() {
        const button = document.getElementById('env-selector');
        if (!button) return;
        
        // 查找当前环境
        const currentEnvId = currentEnvironments.current;
        let currentEnv = currentEnvironments.environments.find(env => env.id === currentEnvId);
        
        if (!currentEnv && currentEnvironments.environments.length > 0) {
            currentEnv = currentEnvironments.environments[0];
        }
        
        if (currentEnv) {            // 获取环境类型标签文本
            const typeLabel = this.getEnvironmentTypeLabel(currentEnv.type);
            
            button.innerHTML = `<svg class="env-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                <circle cx="12" cy="12" r="5"/>
            </svg>
            ${currentEnv.name}`;
            
            // 添加工具提示，显示完整路径
            button.title = `当前环境: ${currentEnv.name} (${currentEnv.path})`;
        } else {
            button.innerHTML = `<svg class="env-icon" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                </svg>
                未选择环境`;
            button.title = '未选择Python环境';
        }
            }
        };
           