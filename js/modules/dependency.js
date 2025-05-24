// 依赖处理模块 - 处理依赖相关操作

import { uninstallDependency, updateDependency, 
         switchVersion, batchUninstall, updateSelected, getTaskProgress,
         installDependency, installWhl, installRequirements, cleanPipCache } from './api.js';
import { showNotification, initVersionModal, getSelectedDependencies, 
         clearSelection, showProgressBar, hideProgressBar, 
         monitorTaskProgress, handleSelectAll, showLoadingMessage, showUpdateConfirmDialog } from './ui.js';
import { refreshDependencies } from './core.js'; // 从core.js导入，解决循环依赖
import { debounce } from './utils.js'; // 导入防抖函数优化搜索性能
import { showDependencyGraph } from './dependency-graph.js'; // 导入依赖关系图模块

/**
 * 依赖处理器对象
 */
export const dependencyHandler = {
    // 保存原始依赖项顺序的数组
    originalOrder: [],

    /**
     * 设置依赖相关的事件监听器
     */
    setupDependencyEvents() {
        // 移除安装相关事件设置调用
        this.setupVersionEvents();
        this.setupDependencyOperationEvents();
        this.setupBatchOperationEvents();
        this.setupInstallEvents(); // 添加安装相关事件设置
        this.setupSearchEvents(); // 添加搜索相关事件设置
    },
    
    /**
     * 设置版本切换相关事件
     */
    setupVersionEvents() {
        // 初始化版本切换模态框
        initVersionModal(async (packageName, version) => {
            showProgressBar(`正在将 ${packageName} 切换到版本 ${version}...`);
            const result = await switchVersion(packageName, version);
            
            if (result.success && result.taskId) {
                monitorTaskProgress(result.taskId, getTaskProgress, async (progress) => {
                    if (progress.status === 'completed') {
                        hideProgressBar();
                        // 任务完成后精确更新单个依赖，而非刷新整个列表
                        try {
                            // 导入从core.js而非ui.js，避免循环依赖问题
                            const { refreshSingleDependency } = await import('./core.js');
                            // 强制刷新以确保获取最新版本信息
                            const updatedDep = await refreshSingleDependency(packageName, true);
                            
                            if (updatedDep) {
                                showNotification(`已成功将 ${packageName} 切换到版本 ${version}`, 'success');
                                console.log(`依赖 ${packageName} 版本已更新为 ${updatedDep.version}`);
                            } else {
                                // 如果精确更新失败，则回退到完全刷新
                                console.warn(`无法精确更新依赖 ${packageName}，将刷新整个列表`);
                                await refreshDependencies(false);
                            }
                        } catch (error) {
                            console.error('更新依赖版本失败:', error);
                            showNotification(`版本切换成功，但界面更新失败：${error.message}`, 'warning');
                            // 尝试回退到完全刷新
                            await refreshDependencies(false);
                        }
                    } else if (progress.status === 'error') {
                        hideProgressBar();
                        showNotification(`切换版本失败: ${progress.message || '未知错误'}`, 'error');
                    }
                });
            } else {
                hideProgressBar();
                showNotification(result.message || '版本切换失败', 'error');
            }
        });
    },
    
    /**
     * 设置依赖操作事件
     */
    setupDependencyOperationEvents() {
        // 依赖操作委托事件（卸载、更新、切换版本、依赖图）
        const dependencyList = document.getElementById('dependency-list');
        if (dependencyList) {
            dependencyList.addEventListener('click', async (e) => {
                if (e.target.classList.contains('action-btn')) {
                    const dependencyItem = e.target.closest('.dependency-item');
                    if (!dependencyItem) return;
                    
                    const packageName = dependencyItem.dataset.name;
                    
                    if (e.target.classList.contains('uninstall')) {
                        if (confirm(`确定要卸载 ${packageName} 吗？`)) {
                            // 显示进度条
                            showProgressBar(`正在卸载 ${packageName}...`);
                              // 使用淡出效果表示正在卸载
                            dependencyItem.classList.add('fading-out');
                            
                            const result = await uninstallDependency(packageName);
                            
                            if (result.success) {
                                showNotification(result.message, 'success');
                                
                                // 使用增量刷新，直接从UI中删除该依赖项
                                try {
                                    // 导入refreshSingleDependency会导致循环依赖，直接使用UI模块的函数
                                    const { removeDependencyItem } = await import('./ui.js');
                                    
                                    // 直接从列表中移除该依赖项
                                    removeDependencyItem(packageName);
                                    
                                    // 保存当前搜索状态和筛选器状态
                                    const searchInput = document.getElementById('dependency-search');
                                    const searchValue = searchInput ? searchInput.value : '';
                                    const filterSelect = document.getElementById('dependency-filter');
                                    const filterValue = filterSelect ? filterSelect.value : 'all';
                                    
                                    // 重新应用搜索过滤
                                    if (searchValue) {
                                        if (searchInput) searchInput.value = searchValue;
                                        this.searchDependencies(searchValue.toLowerCase());
                                    }
                                    
                                    // 重新应用类型过滤
                                    if (filterValue !== 'all') {
                                        if (filterSelect) filterSelect.value = filterValue;
                                        this.filterDependencies(filterValue);
                                    }
                                } catch (refreshError) {
                                    console.error('刷新依赖列表失败:', refreshError);
                                }
                                
                                hideProgressBar();
                            } else {
                                // 如果卸载失败，恢复显示该依赖项
                                dependencyItem.style.display = '';
                                hideProgressBar();
                                showNotification(result.message, 'error');
                            }
                        }                    } else if (e.target.classList.contains('update') && !e.target.classList.contains('latest')) {
                        // 如果不是最新版本（没有latest类），才执行更新操作
                        showProgressBar(`正在更新 ${packageName}...`);
                        const result = await updateDependency(packageName);
                        
                        if (result.success && result.taskId) {
                            monitorTaskProgress(result.taskId, getTaskProgress, async () => {
                                // 使用增量刷新，仅更新该包的信息
                                const { refreshSingleDependency } = await import('./core.js');
                                await refreshSingleDependency(packageName, true);
                                
                                // 提示更新成功
                                showNotification(`${packageName} 已更新成功`, 'success');
                            });
                        } else {
                            hideProgressBar();
                            showNotification(result.message || '更新失败', 'error');
                        }
                    } else if (e.target.classList.contains('dependency-graph')) {
                        // 处理依赖图按钮点击
                        showDependencyGraph(packageName);
                    }
                }
            });
        }
    },
    
    /**
     * 设置批量操作事件
     */
    setupBatchOperationEvents() {
        // 全选复选框
        const selectAllCheckbox = document.getElementById('select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                handleSelectAll(e.target.checked);
            });
        }
        
        // 批量卸载按钮 - 修复重复确认问题
        const batchUninstallBtn = document.getElementById('batch-uninstall-btn');
        if (batchUninstallBtn) {
            // 移除旧事件(如果有)，克隆并替换元素
            const newBtn = batchUninstallBtn.cloneNode(true);
            batchUninstallBtn.parentNode.replaceChild(newBtn, batchUninstallBtn);
            
            newBtn.addEventListener('click', async () => {
                const selectedPackages = getSelectedDependencies();
                if (selectedPackages.length === 0) {
                    showNotification('请选择要卸载的依赖', 'error');
                    return;
                }
                
                // 只弹一次确认对话框
                if (!confirm(`确定要卸载以下 ${selectedPackages.length} 个依赖吗？\n${selectedPackages.join(', ')}`)) {
                    return;
                }
                
                showProgressBar('准备卸载依赖...');
                const result = await batchUninstall(selectedPackages);
                
                if (result.success) {
                    monitorTaskProgress(result.taskId, getTaskProgress, async () => {
                        clearSelection();
                        await refreshDependencies();
                    });
                } else {
                    hideProgressBar();
                    showNotification(result.message, 'error');
                }
            });
        }
        
        // 一键更新所选依赖按钮
        const updateSelectedBtn = document.getElementById('update-selected-btn');
        if (updateSelectedBtn) {
            // 移除旧事件(如果有)，克隆并替换元素
            const newUpdateBtn = updateSelectedBtn.cloneNode(true);
            updateSelectedBtn.parentNode.replaceChild(newUpdateBtn, updateSelectedBtn);
            
            newUpdateBtn.addEventListener('click', async () => {
                const selectedPackages = getSelectedDependencies();
                if (selectedPackages.length === 0) {
                    showNotification('请选择要更新的依赖', 'error');
                    return;
                }
                
                // 获取所有依赖的详细信息，包括是否最新版本
                const needsUpdatePackages = [];
                const latestPackages = [];
                
                // 查找所有选中的依赖项元素
                document.querySelectorAll('.dependency-item.selected').forEach(depItem => {
                    const packageName = depItem.dataset.name;
                    if (!packageName) return;
                    
                    // 获取版本信息
                    const versionElement = depItem.querySelector('.col-version');
                    const version = versionElement ? versionElement.textContent : '';
                    
                    // 检查是否是最新版本
                    const updateBtn = depItem.querySelector('.action-btn.update');
                    const isLatest = updateBtn ? updateBtn.classList.contains('latest') : false;
                    
                    // 获取最新版本号（如果可用）
                    const latestVersion = depItem.dataset.latestVersion || '';
                    
                    // 将依赖添加到相应的列表
                    if (isLatest) {
                        latestPackages.push({ name: packageName, version });
                    } else {
                        needsUpdatePackages.push({ name: packageName, version, latestVersion });
                    }
                });
                
                // 使用自定义确认对话框
                showUpdateConfirmDialog(
                    selectedPackages,
                    needsUpdatePackages,
                    latestPackages,
                    async (packagesToUpdate) => {
                        // 如果没有需要更新的依赖，显示提示并返回
                        if (packagesToUpdate.length === 0) {
                            showNotification('没有需要更新的依赖', 'warning');
                            return;
                        }
                        
                        // 仅传递包名称数组，而不是完整对象数组
                        const packageNames = packagesToUpdate.map(pkg => pkg.name);
                        
                        showProgressBar('准备更新所选依赖...');
                        const result = await updateSelected(packageNames);
                        
                        if (result.success) {
                            monitorTaskProgress(result.taskId, getTaskProgress, async () => {
                                await refreshDependencies();
                            });
                        } else {
                            hideProgressBar();
                            showNotification(result.message, 'error');
                        }
                    }
                );
            });
        }

        // 添加依赖筛选下拉框事件
        const dependencyFilter = document.getElementById('dependency-filter');
        if (dependencyFilter) {
            dependencyFilter.addEventListener('change', () => {
                this.filterDependencies(dependencyFilter.value);
            });
        }
        
        // 添加清理PIP缓存按钮事件
        const cleanCacheBtn = document.getElementById('clean-cache-btn');
        if (cleanCacheBtn) {
            cleanCacheBtn.addEventListener('click', async () => {
                showProgressBar('准备清理PIP缓存...');
                const result = await cleanPipCache();
                
                if (result.success && result.taskId) {
                    monitorTaskProgress(result.taskId, getTaskProgress, () => {
                        showNotification('PIP缓存清理完成', 'success');
                    });
                } else {
                    hideProgressBar();
                    showNotification(result.message || '清理PIP缓存失败', 'error');
                }
            });
        }
    },
    
    /**
     * 根据类型筛选依赖列表
     * @param {string} filterType - 筛选类型 (all, system, app, ai, core, other)
     */
    filterDependencies(filterType) {
        const dependencyItems = document.querySelectorAll('.dependency-item');
        const selectedBeforeFilter = new Set(getSelectedDependencies());
        const selectAllCheckbox = document.getElementById('select-all');
        
        // 设置所有项目显示状态
        dependencyItems.forEach(item => {
            // 先获取当前是否选中
            const wasSelected = item.classList.contains('selected');
            const packageName = item.dataset.name;
            
            // 先隐藏所有项目
            item.style.display = 'none';
            let shouldShow = false;
            
            // 根据筛选条件决定显示
            switch (filterType) {
                case 'system':
                    if (item.classList.contains('system')) {
                        shouldShow = true;
                    }
                    break;
                case 'app':
                    if (item.classList.contains('app-required')) {
                        shouldShow = true;
                    }
                    break;
                case 'ai':
                    if (item.classList.contains('ai-model')) {
                        shouldShow = true;
                    }
                    break;
                case 'core': // 添加对数据科学类别的支持
                    if (item.classList.contains('core')) {
                        shouldShow = true;
                    }
                    break;
                case 'other': // 添加对其他依赖类别的支持
                    if (!item.classList.contains('system') && 
                        !item.classList.contains('app-required') && 
                        !item.classList.contains('core') && 
                        !item.classList.contains('ai-model')) {
                        shouldShow = true;
                    }
                    break;
                case 'all':
                default:
                    shouldShow = true;
                    break;
            }
            
            // 设置显示状态
            if (shouldShow) {
                item.style.display = 'flex';
            } else if (wasSelected && packageName) {
                // 如果项目被隐藏但原本是选中的，则取消选中
                item.classList.remove('selected');
                const checkbox = item.querySelector('.dep-checkbox');
                if (checkbox) checkbox.checked = false;
                
                // 从选择集合中移除
                document.dispatchEvent(new CustomEvent('dependency-selection-changed', {
                    detail: { packageName, selected: false }
                })); 
            }
        });
        
        // 更新全选框状态
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        
        // 更新批量操作按钮状态
        document.dispatchEvent(new CustomEvent('update-batch-buttons'));
    },
    
    /**
     * 设置安装相关事件
     */
    setupInstallEvents() {
        // 文件选择按钮点击事件
        const selectFileBtn = document.getElementById('select-file-btn');
        const packageFileInput = document.getElementById('package-file');
        const packageInput = document.getElementById('package-input');
        const fileInfo = document.getElementById('file-info');
        
        if (selectFileBtn && packageFileInput) {
            selectFileBtn.addEventListener('click', () => {
                packageFileInput.click();
            });
        }
        
        // 文件选择变更事件
        if (packageFileInput && packageInput && fileInfo) {
            packageFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    packageInput.value = file.name;
                    fileInfo.textContent = `已选择文件: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
                } else {
                    packageInput.value = '';
                    fileInfo.textContent = '';
                }
            });
        }
        
        // 安装按钮点击事件
        const installBtn = document.getElementById('install-btn');
        if (installBtn && packageInput && packageFileInput) {
            installBtn.addEventListener('click', async () => {
                const inputValue = packageInput.value.trim();
                
                if (!inputValue) {
                    showNotification('请输入包名称或选择文件', 'error');
                    return;
                }
                
                showProgressBar('正在安装...');
                
                // 判断是文件安装还是包名安装
                if (packageFileInput.files.length > 0) {
                    const file = packageFileInput.files[0];
                    if (file.name.endsWith('.whl')) {
                        // 安装wheel文件
                        await this.handleWheelInstall(file);
                    } else if (file.name.endsWith('.txt')) {
                        // 安装requirements文件
                        await this.handleRequirementsInstall(file);
                    } else {
                        hideProgressBar();
                        showNotification('不支持的文件类型，请选择.whl或.txt文件', 'error');
                    }
                } else {
                    // 安装单个包
                    await this.handlePackageInstall(inputValue);
                }
                
                // 清空输入和文件选择
                packageInput.value = '';
                packageFileInput.value = '';
                fileInfo.textContent = '';
            });
        }
    },
    
    /**
     * 通用的任务处理函数，处理需要进度监控的任务
     * @param {string} title - 进度条标题
     * @param {Promise} apiCall - API调用
     * @param {boolean} refreshList - 是否刷新依赖列表
     */
    async handleTaskWithProgress(title, apiCall, refreshList = true) {
        showProgressBar(title);
        
        try {
            const result = await apiCall;
            
            if (result.success) {
                // 处理带进度监控的任务
                if (result.taskId) {
                    monitorTaskProgress(result.taskId, getTaskProgress, async () => {
                        if (refreshList) {
                            await refreshDependencies();
                        }
                    });
                    return true;
                } 
                // 处理直接响应的API调用（没有任务ID）
                else {
                    hideProgressBar();
                    showNotification(result.message || '操作成功', 'success');
                    
                    // 如果需要刷新列表，则刷新
                    if (refreshList) {
                        await refreshDependencies();
                    }
                    return true;
                }
            } else {
                hideProgressBar();
                // 显示完整的错误消息，包括pip返回的具体错误
                showNotification(result.message || '操作失败', 'error');
                return false;
            }
        } catch (error) {
            hideProgressBar();
            // 同时考虑HTTP错误和网络错误的情况
            let errorMessage = error.message;
            
            // 尝试解析错误响应中的错误信息
            if (error.response && typeof error.response.json === 'function') {
                try {
                    const errorData = await error.response.json();
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    }
                } catch (e) {
                    // 解析错误数据失败，使用默认消息
                    console.error('解析错误响应失败:', e);
                }
            }
            
            showNotification(`操作失败: ${errorMessage}`, 'error');
            return false;
        }
    },
    
    // 使用通用任务处理函数简化各个处理函数
    async handleRequirementsInstall(file) {
        return this.handleTaskWithProgress(
            '安装依赖中...',
            installRequirements(file)
        );
    },
    
    /**
     * 处理wheel文件安装
     * @param {File} file - wheel文件
     */
    async handleWheelInstall(file) {
        return this.handleTaskWithProgress(
            '安装依赖中...',
            installWhl(file)
        );
    },
      /**
     * 处理单个包安装
     * @param {string} packageName - 包名称
     */
    async handlePackageInstall(packageName) {
        const result = await this.handleTaskWithProgress(
            `正在安装: ${packageName}`,
            installDependency(packageName)
        );
        
        if (result) {
            // 安装成功后，使用增量刷新只更新这个包的信息
            try {
                const { refreshSingleDependency } = await import('./core.js');
                await refreshSingleDependency(packageName, true);
                return true;
            } catch (error) {
                console.error(`刷新依赖 ${packageName} 失败:`, error);
                // 如果增量刷新失败，回退到完整刷新
                const { refreshDependencies } = await import('./core.js');
                await refreshDependencies(false);
            }
        }
        
        return result;
    },

    /**
     * 设置搜索相关事件
     */
    setupSearchEvents() {
        const searchInput = document.getElementById('dependency-search');
        const clearSearchBtn = document.getElementById('clear-search');
        
        if (searchInput) {
            // 使用防抖函数优化搜索性能，减少频繁渲染
            const debouncedSearch = debounce((value) => {
                this.searchDependencies(value.trim().toLowerCase());
            }, 300);
            
            // 输入事件 - 实时搜索
            searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
            });
            
            // 回车键事件 - 防止表单提交
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                }
            });
        }
        
        // 清空搜索按钮事件
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.searchDependencies('');
                    searchInput.focus();
                }
            });
        }
    },
    
    /**
     * 搜索并排序依赖项
     * @param {string} query - 搜索关键词
     */
    searchDependencies(query) {
        const dependencyList = document.getElementById('dependency-list');
        if (!dependencyList) return;

        // 添加自动滚动功能 - 当用户搜索时将依赖列表滚动到可视区域顶部
        if (dependencyList.scrollTop > 0 || window.scrollY > 0) {
            // 获取依赖列表容器在页面中的位置
            const dependencyContainer = document.querySelector('.dependency-container');
            if (dependencyContainer) {
                // 计算滚动位置（稍微减去一点偏移以获得更好的视觉效果）
                const scrollPosition = dependencyContainer.getBoundingClientRect().top + window.scrollY - 20;
                
                // 平滑滚动到依赖列表顶部
                window.scrollTo({
                    top: scrollPosition,
                    behavior: 'smooth'
                });
                
                // 同时将列表内部也滚动到顶部
                dependencyList.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
        
        // 第一次搜索时保存原始顺序
        if (this.originalOrder.length === 0) {
            this.originalOrder = Array.from(dependencyList.children).filter(
                item => item.classList.contains('dependency-item')
            );
        }
        
        // 如果搜索为空，恢复原始顺序
        if (!query) {
            this.resetDependencyOrder();
            return;
        }
        
        // 获取所有依赖项
        const items = Array.from(dependencyList.children).filter(
            item => item.classList.contains('dependency-item')
        );
        
        // 按匹配程度给项目评分并排序
        const scoredItems = items.map(item => {
            const nameElement = item.querySelector('.col-name');
            if (!nameElement) return { item, score: 0, packageName: '' };
            
            // 更精确地提取包名（直接使用dataset中的name属性）
            const packageName = item.dataset.name ? item.dataset.name.toLowerCase() : '';
            
            if (!packageName) {
                return { item, score: 0, packageName: '' };
            }
            
            // 改进的评分机制
            let score = 0;
            const lowerQuery = query.toLowerCase();
            
            // 精确的开头匹配判断
            if (packageName.startsWith(lowerQuery)) {
                // 开头匹配得高分，且越短的包名排越前面
                score = 2000 - packageName.length;
                // 越接近完整匹配，分数越高
                if (packageName.length - lowerQuery.length < 3) {
                    score += 500;
                }
            } 
            // 包含但不是开头的匹配
            else if (packageName.includes(lowerQuery)) {
                // 包含匹配的基础分较低
                score = 1000 - packageName.indexOf(lowerQuery) - packageName.length;
            }
            // 检查分段匹配（如缩写匹配）
            else {
                // 这里可以添加更复杂的模糊匹配逻辑
                score = 0;
            }
            
            // 调试输出
            if (score > 0) {
                console.log(`包名: ${packageName}, 查询: ${lowerQuery}, 分数: ${score}`);
            }
            
            return { item, score, packageName };
        });
        
        // 按分数排序（高分在前）
        scoredItems.sort((a, b) => b.score - a.score);
        
        // 应用新的顺序并标记匹配文本
        const fragment = document.createDocumentFragment();
        
        scoredItems.forEach(({ item, score, packageName }) => {
            // 克隆项目以保留原始状态
            const clonedItem = item.cloneNode(true);
            
            // 根据当前筛选状态设置显示
            if (item.style.display === 'none') {
                clonedItem.style.display = 'none';
            }
            
            // 只高亮匹配项
            if (score > 0) {
                // 将匹配文本高亮显示
                const nameElement = clonedItem.querySelector('.col-name');
                if (nameElement) {
                    // 提取所有标签
                    const originalHTML = nameElement.innerHTML;
                    const tagsElements = Array.from(nameElement.querySelectorAll('span.tag'));
                    
                    // 保存标签的所有HTML
                    const tagsHTML = tagsElements.map(tag => tag.outerHTML).join('');
                    
                    // 临时移除标签以获取纯文本
                    tagsElements.forEach(tag => tag.remove());
                    
                    // 获取纯文本内容
                    const textContent = nameElement.textContent.trim();
                    
                    // 查找查询词在包名中的位置（不区分大小写）
                    const queryIndexLower = textContent.toLowerCase().indexOf(query.toLowerCase());
                    
                    if (queryIndexLower >= 0) {
                        // 保持原始大小写
                        const before = textContent.substring(0, queryIndexLower);
                        const match = textContent.substring(queryIndexLower, queryIndexLower + query.length);
                        const after = textContent.substring(queryIndexLower + query.length);
                        
                        // 重新构建HTML，确保原始文本和标签都不会丢失
                        nameElement.innerHTML = 
                            before + 
                            `<span class="highlight-match">${match}</span>` + 
                            after + 
                            (tagsHTML ? ' ' + tagsHTML : '' );
                    } else {
                        // 恢复原始HTML
                        nameElement.innerHTML = originalHTML;
                    }
                }
            }
            
            // 添加到文档片段
            fragment.appendChild(clonedItem);
            
            // 从原列表中移除
            if (item.parentNode) {
                item.parentNode.removeChild(item);
            }
        });
        
        // 一次性添加所有排序后的项目
        dependencyList.appendChild(fragment);
        
        // 重新绑定事件（因为我们创建了新的克隆元素）
        this.rebindDependencyEvents();
    },
    
    /**
     * 重置依赖项顺序为原始顺序
     */
    resetDependencyOrder() {
        if (this.originalOrder.length === 0) return;
        
        const dependencyList = document.getElementById('dependency-list');
        if (!dependencyList) return;
        
        // 清空当前列表
        while (dependencyList.firstChild) {
            dependencyList.removeChild(dependencyList.firstChild);
        }
        
        // 重新应用原始顺序
        const fragment = document.createDocumentFragment();
        this.originalOrder.forEach(item => {
            const clonedItem = item.cloneNode(true);
            fragment.appendChild(clonedItem);
        });
        
        dependencyList.appendChild(fragment);
        
        // 重新绑定事件
        this.rebindDependencyEvents();
    },
    
    /**
     * 为重新排序的依赖项重新绑定事件
     */
    rebindDependencyEvents() {
        // 为所有复选框重新绑定事件
        document.querySelectorAll('.dependency-item .dep-checkbox').forEach(checkbox => {
            // 移除旧事件（通过克隆并替换元素）
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            
            // 获取依赖项和包名
            const dependencyItem = newCheckbox.closest('.dependency-item');
            if (!dependencyItem) return;
            
            const packageName = dependencyItem.dataset.name;
            if (!packageName) return;
            
            // 重新绑定复选框事件
            newCheckbox.checked = dependencyItem.classList.contains('selected');
            newCheckbox.addEventListener('change', (e) => {
                if (dependencyItem.classList.contains('selected') !== e.target.checked) {
                    // 调用UI模块中的选择更新函数
                    if (e.target.checked) {
                        dependencyItem.classList.add('selected');
                        if (!getSelectedDependencies().includes(packageName)) {
                            // 这里我们需要更新选择集合，但不能直接调用
                            // 所以我们触发一个自定义事件
                            document.dispatchEvent(new CustomEvent('dependency-selection-changed', {
                                detail: { packageName, selected: true }
                            }));
                        }
                    } else {
                        dependencyItem.classList.remove('selected');
                        document.dispatchEvent(new CustomEvent('dependency-selection-changed', {
                            detail: { packageName, selected: false }
                        }));
                    }
                    
                    // 更新批量操作按钮状态
                    document.dispatchEvent(new CustomEvent('update-batch-buttons'));
                }
            });
        });
        
        // 为版本切换按钮重新绑定事件
        document.querySelectorAll('.dependency-item .action-btn.version').forEach(btn => {
            // 移除旧事件
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // 获取依赖项和包名
            const dependencyItem = newBtn.closest('.dependency-item');
            if (!dependencyItem) return;
            
            const packageName = dependencyItem.dataset.name;
            const versionElement = dependencyItem.querySelector('.col-version');
            const version = versionElement ? versionElement.textContent : '';
            
            // 重新绑定版本切换事件
            newBtn.addEventListener('click', () => {
                // 调用版本模态框打开函数
                document.dispatchEvent(new CustomEvent('open-version-modal', {
                    detail: { packageName, version }
                }));
            });
        });
    }
};
