// UI模块 - 处理用户界面相关功能

let allDependencies = [];
let selectedDependencies = new Set();
let modalEventsInitialized = false; // 标记模态框事件是否已初始化

/**
 * 渲染依赖列表
 * @param {Array} dependencies - 依赖数组
 */
export function renderDependencyList(dependencies) {
    allDependencies = dependencies;
    const listElement = document.getElementById('dependency-list');
    
    if (!listElement) {
        console.error('依赖列表元素不存在');
        return;
    }
    
    // 确保完全清空列表
    while (listElement.firstChild) {
        listElement.removeChild(listElement.firstChild);
    }
    
    if (dependencies.length === 0) {
        listElement.innerHTML = '<div class="no-dependencies">未找到任何依赖</div>';
        return;
    }
    
    dependencies.sort((a, b) => {

        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;

        if (a.isAppRequired && !b.isAppRequired) return -1;
        if (!a.isAppRequired && b.isAppRequired) return 1;
        
        if (a.isCore && !b.isCore) return -1;
        if (!a.isCore && b.isCore) return 1;
        
        if (a.isAIModel && !b.isAIModel) return -1;
        if (!a.isAIModel && b.isAIModel) return 1;
        
        return a.name.localeCompare(b.name);
    });
    
    // 创建文档片段，提高渲染性能
    const fragment = document.createDocumentFragment();
    
    // 创建每个依赖项
    dependencies.forEach(dep => {
        const depElement = document.createElement('div');
        depElement.className = 'dependency-item';
        depElement.dataset.name = dep.name;
        
        // 存储最新版本信息，用于更新确认对话框
        if (dep.latestVersion) {
            depElement.dataset.latestVersion = dep.latestVersion;
        }
        
        // 应用样式类
        if (dep.isSystem) {
            depElement.classList.add('system');
        }
        if (dep.isCore) {
            depElement.classList.add('core');
        }
        if (dep.isAIModel) {
            depElement.classList.add('ai-model');
        }
        if (dep.isAppRequired) {
            depElement.classList.add('app-required');
        }
        
        if (selectedDependencies.has(dep.name)) {
            depElement.classList.add('selected');
        }
        
        const isProtected = dep.isSystem || dep.isAppRequired;
        
        let actionButtons = '';
        
        if (!isProtected) {
            // 根据是否最新版本，显示不同的更新按钮
            const updateBtn = dep.isLatest 
                ? `<button class="action-btn update latest" title="当前版本 ${dep.version} 已是最新">最新</button>`
                : `<button class="action-btn update" title="有新版本可用: ${dep.latestVersion || '未知'}">更新</button>`;
                
            // 添加依赖关系图按钮，与其他按钮并排显示
            actionButtons = `
                <button class="action-btn uninstall">卸载</button>
                <button class="action-btn version">切换版本</button>
                ${updateBtn}
                <button class="action-btn dependency-graph" title="查看依赖关系图">依赖图</button>
            `;
        } else {
            // 对于受保护的依赖，也添加依赖图按钮（但不添加其他操作按钮）
            actionButtons = `
                <button class="action-btn dependency-graph" title="查看依赖关系图">依赖图</button>
            `;
        }
        
        depElement.innerHTML = `
            <div class="col-checkbox">
                ${!isProtected ? `<input type="checkbox" class="dep-checkbox" ${selectedDependencies.has(dep.name) ? 'checked' : ''}>` : ''}
            </div>
            <div class="col-name">
                ${dep.name}
                ${dep.isSystem ? '<span class="tag system">核心依赖</span>' : ''}
                ${!dep.isSystem && dep.isCore ? '<span class="tag core">数据科学</span>' : ''}
                ${dep.isAIModel ? '<span class="tag ai-model">人工智能</span>' : ''}
                ${dep.isAppRequired ? '<span class="tag app-required">软件依赖</span>' : ''}
            </div>
            <div class="col-version">${dep.version}</div>
            <div class="col-description">${dep.description || '无描述'}</div>
            <div class="col-actions">
                ${actionButtons}
            </div>
        `;
        
        // 只有非保护依赖才添加事件监听器
        if (!isProtected) {
            // 添加版本切换按钮事件
            const versionBtn = depElement.querySelector('.action-btn.version');
            if (versionBtn) {
                versionBtn.addEventListener('click', () => {
                    openVersionModal(dep.name, dep.version);
                });
            }
            
            // 添加复选框事件
            const checkbox = depElement.querySelector('.dep-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    updateDependencySelection(dep.name, e.target.checked, depElement);
                });
            }
        }
        
        // 为依赖图按钮添加事件监听器（所有依赖都有此按钮）
        const dependencyGraphBtn = depElement.querySelector('.action-btn.dependency-graph');
        if (dependencyGraphBtn) {
            dependencyGraphBtn.addEventListener('click', () => {
                // 这里只添加占位函数，稍后实现具体功能
                console.log(`查看依赖关系图: ${dep.name}`);
                // 在这里触发显示依赖关系图的事件或函数调用
            });
        }
        
        fragment.appendChild(depElement);
    });
    
    // 一次性添加所有元素，减少DOM重排
    listElement.appendChild(fragment);
    
    // 更新批量操作按钮状态
    updateBatchButtonState();
}

/**
 * 更新依赖选择状态
 * @param {string} packageName - 包名称
 * @param {boolean} isSelected - 是否选中
 * @param {HTMLElement} element - 依赖元素
 */
function updateDependencySelection(packageName, isSelected, element) {
    if (isSelected) {
        selectedDependencies.add(packageName);
        element.classList.add('selected');
    } else {
        selectedDependencies.delete(packageName);
        element.classList.remove('selected');
    }
    updateBatchButtonState();
}

/**
 * 更新批量操作按钮状态
 */
export function updateBatchButtonState() {
    const batchUninstallBtn = document.getElementById('batch-uninstall-btn');
    const updateSelectedBtn = document.getElementById('update-selected-btn'); 
    
    if (!batchUninstallBtn || !updateSelectedBtn) return;
    
    // 根据是否有选择依赖来设置按钮状态
    const hasSelection = selectedDependencies.size > 0;
    batchUninstallBtn.disabled = !hasSelection;
    updateSelectedBtn.disabled = !hasSelection;
}

/**
 * 处理全选和取消全选
 * @param {boolean} isChecked - 是否全选
 */
export function handleSelectAll(isChecked) {
    // 修改为：只选择当前可见的非系统非软件依赖
    const dependencyItems = document.querySelectorAll('.dependency-item:not(.system):not(.app-required)');
    
    dependencyItems.forEach(item => {
        // 只处理当前可见的依赖项
        if (item.style.display !== 'none') {
            const checkbox = item.querySelector('.dep-checkbox');
            if (checkbox) {
                checkbox.checked = isChecked;
                
                // 更新选择状态
                if (isChecked) {
                    item.classList.add('selected');
                    const packageName = item.dataset.name;
                    if (packageName && !selectedDependencies.has(packageName)) {
                        selectedDependencies.add(packageName);
                    }
                } else {
                    item.classList.remove('selected');
                    const packageName = item.dataset.name;
                    if (packageName) {
                        selectedDependencies.delete(packageName);
                    }
                }
            }
        }
    });
    
    // 更新批量操作按钮状态
    updateBatchButtonState();
}

/**
 * 获取已选择的依赖列表
 * @returns {Array} 已选择的依赖名称数组
 */
export function getSelectedDependencies() {
    return Array.from(selectedDependencies);
}

/**
 * 清除所有选择
 */
export function clearSelection() {
    selectedDependencies.clear();
    document.querySelectorAll('.dep-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.querySelectorAll('.dependency-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    updateBatchButtonState();
}

/**
 * 显示进度条
 * @param {string} title - 进度条标题
 */
export function showProgressBar(title = '正在处理...') {
    const container = document.getElementById('progress-container');
    container.querySelector('.progress-title').textContent = title;
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-text').textContent = '0%';
    container.classList.remove('hidden');
}

/**
 * 更新进度条
 * @param {number} percent - 进度百分比
 * @param {string} message - 进度消息
 */
export function updateProgressBar(percent, message = null) {
    // 确保进度百分比不超过100%且不小于0%
    const safePercent = Math.min(Math.max(0, percent), 100);
    
    document.getElementById('progress-bar').style.width = `${safePercent}%`;
    document.getElementById('progress-text').textContent = `${safePercent}%`;
    
    if (message) {
        document.getElementById('progress-container').querySelector('.progress-title').textContent = message;
    }
}

/**
 * 隐藏进度条
 */
export function hideProgressBar() {
    document.getElementById('progress-container').classList.add('hidden');
}

/**
 * 监控任务进度
 * @param {string} taskId - 任务ID
 * @param {Function} getProgressFunc - 获取进度的函数
 * @param {Function} onComplete - 完成时的回调函数
 */
export function monitorTaskProgress(taskId, getProgressFunc, onComplete) {
    // 跟踪上次报告的进度百分比，避免进度条回退
    let lastProgressPercent = 0;
    let stagnantCount = 0; // 跟踪进度停滞次数
    let consecutiveErrorCount = 0; // 连续错误计数
    let taskCompleted = false; // 任务完成标志
    
    // 添加额外的安全超时，确保任务最终会结束
    const safetyTimeout = setTimeout(() => {
        if (!taskCompleted) {
            console.warn('任务监控安全超时触发 - 强制完成任务');
            cleanupAndComplete();
        }
    }, 60000); // 60秒安全超时
    
    // 任务监控计时器
    const intervalId = setInterval(async () => {
        try {
            // 如果任务已完成，不再继续检查
            if (taskCompleted) {
                clearInterval(intervalId);
                return;
            }
            
            let progress;
            try {
                progress = await getProgressFunc(taskId);
                // 重置连续错误计数
                consecutiveErrorCount = 0;
            } catch (error) {
                // 增加连续错误计数
                consecutiveErrorCount++;
                console.error(`获取进度失败 (${consecutiveErrorCount}/3): ${error.message}`);
                
                // 连续三次错误则中止
                if (consecutiveErrorCount >= 3) {
                    console.error('连续多次获取进度失败，中止任务监控');
                    cleanupAndComplete('获取进度失败，任务可能已完成', true);
                }
                return;
            }
            
            // 检查常见错误情况
            if (!progress) {
                consecutiveErrorCount++;
                console.warn(`收到空进度响应 (${consecutiveErrorCount}/3)`);
                if (consecutiveErrorCount >= 3) {
                    cleanupAndComplete('无法获取进度信息，任务可能已完成', true);
                }
                return;
            }
            
            if (progress.error) {
                cleanupAndComplete(`获取进度失败: ${progress.error}`, true);
                return;
            }
            
            // 确保进度不会后退，但允许前进
            let displayPercent = progress.progress || 0;
            if (displayPercent < lastProgressPercent) {
                displayPercent = lastProgressPercent;
            } else {
                lastProgressPercent = displayPercent;
            }
            
            // 更新UI进度条
            updateProgressBar(displayPercent, progress.message);
            
            // 检测任务是否已完成的多种条件
            const isCompleted = progress.status === 'completed' || displayPercent >= 100;
            
            // 检测进度停滞
            if (displayPercent === lastProgressPercent) {
                stagnantCount++;
                
                // 进度100%且停滞，视为已完成
                if (displayPercent === 100 && stagnantCount > 2) {
                    console.log('进度100%且停滞，视为任务已完成');
                    cleanupAndComplete();
                    return;
                }
                
                // 如果进度长时间停滞但未完成，显示提示消息
                if (stagnantCount > 10 && displayPercent < 100) {
                    const statusMessage = progress.message || '正在处理...';
                    updateProgressBar(displayPercent, `${statusMessage} (处理中，请耐心等待)`);
                }
            } else {
                stagnantCount = 0; // 进度有变化，重置停滞计数
            }
            
            // 检查任务状态，处理完成情况
            if (isCompleted) {
                cleanupAndComplete(progress.message || '处理完成', false, progress);
            }
            
        } catch (error) {
            console.error('监控任务进度时出错:', error);
            // 发生意外错误时，尝试清理并结束任务
            cleanupAndComplete(`监控出错: ${error.message}`, true);
        }
    }, 500);
    
    // 统一的清理和完成处理函数，避免代码重复
    function cleanupAndComplete(message = '处理完成', isError = false, progressData = null) {
        if (taskCompleted) return; // 防止重复执行
        
        // 标记任务已完成
        taskCompleted = true;
        
        // 清除所有计时器
        clearInterval(intervalId);
        clearTimeout(safetyTimeout);
        
        // 确保显示100%完成的进度条
        updateProgressBar(100, message || '处理完成');
        
        // 使用定时器确保进度条显示后再隐藏
        setTimeout(() => {
            // 隐藏进度条
            hideProgressBar();
            
            // 显示适当的通知
            if (isError) {
                showNotification(message || '任务出错', 'error');
            } else if (progressData && progressData.errors && progressData.errors.length > 0) {
                // 处理成功但有错误情况
                const structuredErrors = progressData.errors.filter(err => typeof err === 'object');
                
                if (structuredErrors.length > 0) {
                    // 显示结构化错误信息
                    showErrorDetailsModal(structuredErrors);
                    showNotification(`任务完成，但有 ${structuredErrors.length} 个错误`, 'warning');
                } else {
                    // 处理旧格式的错误（字符串数组）
                    showNotification(`任务完成，但有 ${progressData.errors.length} 个错误`, 'warning');
                    console.error('任务错误:', progressData.errors);
                }
            } else {
                // 完全成功的情况
                showNotification('任务成功完成', 'success');
            }
            
            // 调用完成回调
            try {
                if (typeof onComplete === 'function') {
                    onComplete(progressData || {});
                }
            } catch (callbackError) {
                console.error('执行完成回调时出错:', callbackError);
                showNotification('完成后处理出错', 'error');
            }
        }, 1000); // 延迟1秒，确保用户能看到100%进度
    }
}

/**
 * 显示详细错误信息模态框
 * @param {Array} errors - 错误信息数组
 */
function showErrorDetailsModal(errors) {
    // 检查是否已经有错误模态框
    let modal = document.getElementById('error-details-modal');
    
    // 如果没有，创建一个新的
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'error-details-modal';
        modal.className = 'modal';
        
        document.body.appendChild(modal);
    }
    
    // 生成错误详情HTML
    let errorListHtml = '';
    errors.forEach(err => {
        errorListHtml += `
            <div class="error-item">
                <div class="error-package">${err.package || '未知包'}</div>
                <div class="error-message">${err.error || '未知错误'}</div>
                ${err.details ? `<div class="error-details">${err.details}</div>` : ''}
            </div>
        `;
    });
    
    // 设置模态框内容
    modal.innerHTML = `
        <div class="modal-content error-modal-content">
            <span class="close-btn" onclick="document.getElementById('error-details-modal').style.display='none'">&times;</span>
            <h2>安装错误详情</h2>
            <p>以下依赖安装失败:</p>
            <div class="error-list">
                ${errorListHtml}
            </div>
            <div class="modal-footer">
                <button onclick="document.getElementById('error-details-modal').style.display='none'">关闭</button>
            </div>
        </div>
    `;
    
    // 显示模态框
    modal.style.display = 'flex';
    
    // 添加点击外部关闭事件
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/**
 * 显示通知
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型（success 或 error）
 */
export function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    // 3秒后自动隐藏
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 300);
    }, 3000);
}

/**
 * 初始化版本切换模态框
 * @param {Function} onSwitch - 版本切换回调函数
 */
export function initVersionModal(onSwitch) {
    // 避免重复初始化
    if (modalEventsInitialized) return;
    
    const modal = document.getElementById('version-modal');
    if (!modal) {
        console.error('找不到版本模态框元素');
        return;
    }
    
    // 关闭按钮逻辑
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
    
    // 切换标签页
    const tabBtns = modal.querySelectorAll('.version-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 激活按钮
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 显示对应内容
            const tabName = btn.dataset.tab;
            document.querySelectorAll('.version-tab-content').forEach(content => {
                content.style.display = 'none';
            });
            document.getElementById(`${tabName}-tab`).style.display = 'block';
        });
    });
    
    // 手动切换版本按钮
    const switchBtn = document.getElementById('switch-version-btn');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            handleVersionSwitch(onSwitch);
        });
    }
    
    // 版本列表中的"使用该版本"按钮代理事件
    const versionList = document.getElementById('version-list');
    if (versionList) {
        versionList.addEventListener('click', (e) => {
            if (e.target.classList.contains('version-use-btn')) {
                const packageName = document.getElementById('package-name').textContent;
                const version = e.target.dataset.version;
                
                // 关闭模态框
                modal.style.display = 'none';
                
                // 调用切换回调
                onSwitch(packageName, version);
            }
        });
    }
    
    // 标记模态框事件已初始化
    modalEventsInitialized = true;
}

/**
 * 处理版本切换
 * @param {Function} onSwitch - 切换回调函数
 */
function handleVersionSwitch(onSwitch) {
    const packageNameElement = document.getElementById('package-name');
    const versionInput = document.getElementById('version-input');
    
    if (!packageNameElement || !versionInput) {
        showNotification('界面元素缺失，无法切换版本', 'error');
        return;
    }
    
    const packageName = packageNameElement.textContent;
    const version = versionInput.value.trim();
    
    if (!version) {
        showNotification('请输入版本号', 'error');
        return;
    }
    
    onSwitch(packageName, version);
    document.getElementById('version-modal').style.display = 'none';
}

/**
 * 打开版本切换模态框
 * @param {string} packageName - 包名称
 * @param {string} currentVersion - 当前版本
 */
export async function openVersionModal(packageName, currentVersion) {
    // 检查模态框和必要元素
    const checkResult = checkVersionModalElements();
    if (!checkResult.success) {
        showNotification(checkResult.message, 'error');
        return;
    }
    
    const { modal, packageNameElement, currentVersionElement, versionInput } = checkResult;
    
    // 设置模态框内容
    packageNameElement.textContent = packageName;
    currentVersionElement.textContent = currentVersion;
    versionInput.value = '';
    
    // 重置和显示模态框
    resetAndShowVersionModal(modal);
    
    // 加载版本列表
    await loadVersionHistory(packageName, currentVersion);
}

/**
 * 检查版本模态框的必要元素
 * @returns {Object} 检查结果
 */
function checkVersionModalElements() {
    const modal = document.getElementById('version-modal');
    if (!modal) {
        return { success: false, message: '找不到版本模态框元素' };
    }
    
    const packageNameElement = document.getElementById('package-name');
    const currentVersionElement = document.getElementById('current-version');
    const versionInput = document.getElementById('version-input');
    
    if (!packageNameElement || !currentVersionElement || !versionInput) {
        return { success: false, message: '找不到版本对话框中的必要元素' };
    }
    
    return { 
        success: true, 
        modal, 
        packageNameElement, 
        currentVersionElement, 
        versionInput 
    };
}

/**
 * 重置并显示版本模态框
 * @param {HTMLElement} modal - 模态框元素
 */
function resetAndShowVersionModal(modal) {
    // 重置标签页到历史版本
    document.querySelectorAll('.version-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === 'history') {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.version-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById('history-tab').style.display = 'block';
    
    // 显示模态框 - 使用flex布局居中显示
    modal.style.display = 'flex';
}

/**
 * 加载版本历史
 * @param {string} packageName - 包名称
 * @param {string} currentVersion - 当前版本
 */
async function loadVersionHistory(packageName, currentVersion) {
    const versionList = document.getElementById('version-list');
    versionList.innerHTML = '<div class="version-loading">加载版本历史中...</div>';
    
    try {
        // 从api.js导入getPackageVersions方法
        const { getPackageVersions } = await import('./api.js');
        const versionData = await getPackageVersions(packageName);
        
        if (!versionData.success) {
            versionList.innerHTML = `<div class="version-error">加载失败: ${versionData.message}</div>`;
            return;
        }
        
        if (versionData.versions.length === 0) {
            versionList.innerHTML = '<div class="version-error">未找到版本历史</div>';
            return;
        }
        
        // 渲染版本列表
        renderVersionList(versionList, versionData, currentVersion);
    } catch (error) {
        console.error('加载版本历史出错:', error);
        versionList.innerHTML = `<div class="version-error">加载失败: ${error.message}</div>`;
    }
}

/**
 * 渲染版本列表
 * @param {HTMLElement} versionList - 版本列表容器
 * @param {Object} versionData - 版本数据
 * @param {string} currentVersion - 当前版本
 */
function renderVersionList(versionList, versionData, currentVersion) {
    let html = '';
    
    // 标准化当前版本，以便更准确地比较
    const normalizeVersion = (ver) => {
        if (!ver) return "";
        let result = ver;
        
        // 移除.postX后缀
        if (result.includes('.post')) {
            result = result.split('.post')[0];
        }
        
        // 移除预发布标识
        ['a', 'b', 'rc', 'dev', 'alpha', 'beta', 'pre'].forEach(prefix => {
            if (result.includes(`.${prefix}`)) {
                result = result.split(`.${prefix}`)[0];
            }
            if (result.includes(`-${prefix}`)) {
                result = result.split(`-${prefix}`)[0];
            }
        });
        
        return result;
    };
    
    const normCurrentVersion = normalizeVersion(currentVersion);
    
    versionData.versions.forEach(version => {
        // 检查是否为最新版本
        const isLatest = version.version === versionData.latestVersion;
        
        // 检查是否为当前版本 - 通过标准化比较
        let isCurrent = version.version === currentVersion;
        
        // 如果精确匹配未成功，尝试标准化后比较
        if (!isCurrent && normalizeVersion(version.version) === normCurrentVersion) {
            isCurrent = true;
        }
        
        let dateText = '未知日期';
        if (version.uploadDate) {
            dateText = new Intl.DateTimeFormat('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(version.uploadDate);
        }
        
        html += `
            <div class="version-item ${isCurrent ? 'current' : ''} ${isLatest ? 'latest' : ''}">
                <span class="version-name">
                    ${version.version}
                    ${isCurrent ? '<span class="version-badge current">当前</span>' : ''}
                    ${isLatest ? '<span class="version-badge latest">最新</span>' : ''}
                </span>
                <span class="version-date">${dateText}</span>
                <span class="version-action">
                    ${isCurrent ? 
                        '<button disabled class="version-use-btn">当前使用</button>' : 
                        `<button class="version-use-btn" data-version="${version.version}">使用该版本</button>`
                    }
                </span>
            </div>
        `;
    });
    
    versionList.innerHTML = html;
}

/**
 * 显示加载消息
 * @param {string} message - 加载消息
 */
export function showLoadingMessage(message) {
    const listElement = document.getElementById('dependency-list');
    if (listElement) {
        listElement.innerHTML = `<div class="loading">${message}</div>`;
    }
}

/**
 * 显示更新确认对话框 - 优化事件绑定
 */
export function showUpdateConfirmDialog(selectedPackages, needsUpdatePackages, latestPackages, onConfirm) {
    const modal = document.getElementById('update-confirm-modal');
    const totalCountElement = document.getElementById('total-packages-count');
    const updateCountElement = document.getElementById('update-packages-count');
    const latestCountElement = document.getElementById('latest-packages-count');
    const updatePackagesList = document.getElementById('update-packages-list');
    const latestPackagesList = document.getElementById('latest-packages-list');
    
    if (!modal) {
        console.error('找不到更新确认对话框');
        return;
    }
    
    // 更新计数
    totalCountElement.textContent = selectedPackages.length;
    updateCountElement.textContent = needsUpdatePackages.length;
    latestCountElement.textContent = latestPackages.length;
    
    // 渲染需要更新的依赖列表
    if (needsUpdatePackages.length > 0) {
        updatePackagesList.innerHTML = needsUpdatePackages.map(pkg => 
            `<div class="package-item">
                <span class="package-name">${pkg.name}</span>
                <span class="package-version">${pkg.version}</span>
                <span class="package-latest-version">${pkg.latestVersion || '未知'}</span>
            </div>`
        ).join('');
    } else {
        updatePackagesList.innerHTML = '<div class="no-packages">没有需要更新的依赖</div>';
    }
    
    // 渲染已是最新版本的依赖列表
    if (latestPackages.length > 0) {
        latestPackagesList.innerHTML = latestPackages.map(pkg => 
            `<div class="package-item">
                <span class="package-name">${pkg.name}</span>
                <span class="package-version">${pkg.version}</span>
                <span class="package-latest-version">最新</span>
            </div>`
        ).join('');
    } else {
        latestPackagesList.innerHTML = '<div class="no-packages">没有最新版本的依赖</div>';
    }
    
    // 使用事件委托代替多次克隆元素并重新绑定
    const oldModalClone = modal.cloneNode(true);
    modal.parentNode.replaceChild(oldModalClone, modal);
    
    // 获取新的引用
    const newModal = document.getElementById('update-confirm-modal');
    
    // 单一事件监听器处理所有按钮点击
    newModal.addEventListener('click', (e) => {
        // 处理确认按钮
        if (e.target.id === 'update-confirm-proceed') {
            newModal.style.display = 'none';
            onConfirm(needsUpdatePackages);
        } 
        // 处理取消按钮
        else if (e.target.id === 'update-confirm-cancel' || e.target.classList.contains('close-btn')) {
            newModal.style.display = 'none';
        }
    });
    
    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === newModal) {
            newModal.style.display = 'none';
        }
    });
    
    // 显示模态框 - 使用flex布局居中显示
    newModal.style.display = 'flex';
    
    // 确保模态框在视窗内可见
    // 滚动到对话框顶部
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    
    // 检查模态框高度，并在必要时调整最大高度
    const modalHeight = newModal.querySelector('.modal-content').offsetHeight;
    const windowHeight = window.innerHeight;
    if (modalHeight > windowHeight * 0.9) {
        newModal.querySelector('.modal-content').style.height = `${windowHeight * 0.9}px`;
    }
}

// 添加安全的元素获取辅助函数，减少重复的null检查
/**
 * 安全地获取DOM元素，自动处理不存在的情况
 * @param {string} selector - CSS选择器
 * @param {string} [errorMessage] - 错误信息
 * @returns {HTMLElement|null} 返回元素或null
 */
function getElement(selector, errorMessage) {
    const element = document.getElementById(selector) || document.querySelector(selector);
    if (!element && errorMessage) {
        console.error(errorMessage);
    }
    return element;
}

// 监听依赖选择变更事件
document.addEventListener('dependency-selection-changed', (e) => {
    const { packageName, selected } = e.detail;
    if (selected) {
        selectedDependencies.add(packageName);
    } else {
        selectedDependencies.delete(packageName);
    }
});

// 监听批量按钮更新事件
document.addEventListener('update-batch-buttons', () => {
    updateBatchButtonState();
});

// 监听版本模态框打开事件
document.addEventListener('open-version-modal', (e) => {
    const { packageName, version } = e.detail;
    openVersionModal(packageName, version);
});

/**
 * 显示初始加载界面
 * @param {Function} onReady - 准备就绪回调
 */
export async function showInitialLoadingScreen(onReady) {
    try {
        // 检查是否已有加载界面
        let loadingScreen = document.getElementById('initial-loading-screen');
        
        // 如果没有，则创建加载界面
        if (!loadingScreen) {
            loadingScreen = document.createElement('div');
            loadingScreen.id = 'initial-loading-screen';
            
            // 创建加载内容 - 已移除缓存按钮和相关文字
            loadingScreen.innerHTML = `
                <div class="initial-loading-content">
                    <h2>AI环境管理工具</h2>
                    <p class="initial-loading-info">正在检查依赖版本信息，这可能需要一些时间...</p>
                    
                    <div class="initial-progress-container">
                        <div id="initial-progress-bar" class="initial-progress-bar"></div>
                    </div>
                    <div id="initial-progress-text" class="initial-progress-text">0%</div>
                </div>
            `;
            
            document.body.appendChild(loadingScreen);
        } else {
            // 如果已存在，则确保显示
            loadingScreen.style.display = 'flex';
        }
        
        // 重置进度条
        updateInitialLoadingProgress(0, '准备加载依赖信息...');
        
        // 直接调用回调，开始执行初始化
        if (onReady && typeof onReady === 'function') {
            onReady();
        }
        
    } catch (error) {
        console.error('显示初始加载界面失败:', error);
        // 出错时仍然尝试调用回调函数，确保应用能继续初始化
        if (onReady && typeof onReady === 'function') {
            onReady();
        }
    }
}

/**
 * 更新初始加载进度
 * @param {number} percent - 进度百分比 (0-100)
 * @param {string} message - 进度消息
 */
export function updateInitialLoadingProgress(percent, message = null) {
    const progressBar = document.getElementById('initial-progress-bar');
    const progressText = document.getElementById('initial-progress-text');
    const progressInfo = document.querySelector('.initial-loading-info');
    
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    
    if (progressText) {
        progressText.textContent = `${percent}%`;
    }
    
    if (message && progressInfo) {
        progressInfo.textContent = message;
    }
}

/**
 * 隐藏初始加载界面
 */
export function hideInitialLoadingScreen() {
    const initialLoadingScreen = document.getElementById('initial-loading-screen');
    if (initialLoadingScreen) {
        // 添加淡出动画
        initialLoadingScreen.classList.add('fade-out');
        
        // 动画完成后移除元素
        setTimeout(() => {
            if (initialLoadingScreen.parentNode) {
                initialLoadingScreen.parentNode.removeChild(initialLoadingScreen);
            }
        }, 500);
    }
}