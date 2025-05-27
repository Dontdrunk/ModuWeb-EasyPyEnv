// 核心API层 - 处理与后端的通信和核心业务逻辑

const API_BASE_URL = 'http://127.0.0.1:8282/api';

// ========== API通信相关函数 ==========

/**
 * 基础API请求函数，包含错误处理
 * @param {string} url - API URL
 * @param {Object} options - 请求选项
 * @returns {Promise<any>} - 响应数据
 */
async function apiRequest(url, options = {}) {
    try {
        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        // 添加Cache-Control头，确保每次请求都获取最新数据
        const headers = {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            ...(options.headers || {})
        };
        
        const response = await fetch(url, {
            ...options,
            headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId); // 清除超时
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`请求失败 (${response.status}): ${errorText}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('请求超时，请检查网络连接');
        }
        throw error;
    }
}

/**
 * 获取缓存信息
 * @returns {Promise<Object>} 缓存信息
 */
export async function getCacheInfo() {
    return await apiRequest(`${API_BASE_URL}/cache-info`);
}

/**
 * 加载所有依赖列表
 * @param {boolean} useCache - 是否使用缓存
 * @returns {Promise<Array>} 依赖数组
 */
export async function loadDependencies(useCache = false) {
    try {
        const response = await fetch(`/api/dependencies?useCache=${useCache}`);
        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('加载依赖失败:', error);
        throw error;
    }
}

/**
 * 卸载单个依赖
 * @param {string} dependency - 依赖名称
 * @returns {Promise<Object>} 响应对象
 */
export async function uninstallDependency(dependency) {
    try {
        const response = await fetch('/api/uninstall', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dependency })
        });
        
        if (!response.ok) {
            const data = await response.json();
            return { success: false, message: data.message || `卸载失败: ${response.status}` };
        }
        
        return await response.json();
    } catch (error) {
        console.error('卸载依赖失败:', error);
        return { success: false, message: `卸载失败: ${error.message}` };
    }
}

/**
 * 更新依赖到最新版本
 * @param {string} dependency - 依赖名称
 * @returns {Promise<Object>} 响应对象
 */
export async function updateDependency(dependency) {
    try {
        const response = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dependency })
        });
        
        return await response.json();
    } catch (error) {
        console.error('更新依赖失败:', error);
        return { success: false, message: `更新失败: ${error.message}` };
    }
}

/**
 * 获取依赖的当前版本
 * @param {string} dependency - 依赖名称
 * @returns {Promise<Object>} 响应对象，包含当前版本信息
 */
export async function getCurrentVersion(dependency) {
    try {
        const response = await fetch(`/api/dependency-current-version/${encodeURIComponent(dependency)}`);
        
        if (!response.ok) {
            const data = await response.json();
            return { 
                success: false, 
                message: data.message || `获取版本信息失败: ${response.status}` 
            };
        }
        
        return await response.json();
    } catch (error) {
        console.error('获取版本信息失败:', error);
        return { success: false, message: `获取版本信息失败: ${error.message}` };
    }
}

/**
 * 切换依赖版本
 * @param {string} dependency - 依赖名称
 * @param {string} version - 目标版本
 * @returns {Promise<Object>} 响应对象
 */
export async function switchVersion(dependency, version) {
    try {
        const response = await fetch('/api/switch-version', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dependency, version })
        });
        
        return await response.json();
    } catch (error) {
        console.error('版本切换失败:', error);
        return { success: false, message: `版本切换失败: ${error.message}` };
    }
}

/**
 * 批量卸载依赖
 * @param {Array} packages - 包名称数组
 * @returns {Promise<Object>} 响应对象
 */
export async function batchUninstall(packages) {
    try {
        // 确保输入是字符串数组
        const packageArray = Array.isArray(packages) ? packages : [packages];
        
        const response = await fetch('/api/batch-uninstall', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ packages: packageArray })
        });
        
        return await response.json();
    } catch (error) {
        console.error('批量卸载失败:', error);
        return { success: false, message: `批量卸载失败: ${error.message}` };
    }
}

/**
 * 获取任务进度
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 进度对象
 */
export async function getTaskProgress(taskId) {
    try {
        const response = await fetch(`/api/task-progress/${taskId}`);
        
        if (!response.ok) {
            throw new Error(`获取任务进度失败: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('获取任务进度失败:', error);
        return { error: error.message };
    }
}

/**
 * 检查描述更新
 * @param {number} lastUpdate - 上次更新时间戳 
 * @param {boolean} isFirstLoad - 是否为UI首次加载后的请求
 * @param {boolean} environmentChanged - 环境是否发生变更
 * @returns {Promise<Object>} 响应对象
 */
export async function checkDescriptionUpdates(lastUpdate, isFirstLoad = false, environmentChanged = false) {
    try {
        // 如果是UI首次加载后的请求，传递特殊的lastUpdate值
        const timestamp = isFirstLoad ? 0 : lastUpdate;
        
        const url = new URL('/api/check-description-updates', window.location.origin);
        url.searchParams.append('lastUpdate', timestamp);
        if (environmentChanged) {
            url.searchParams.append('environmentChanged', 'true');
        }
        
        const response = await fetch(url.toString());
        
        if (!response.ok) {
            return { hasUpdates: false };
        }
        
        const result = await response.json();
        
        // 添加日志
        if (isFirstLoad) {
            console.log('UI加载完成，已向服务器请求更新缺失的依赖描述');
        } else if (environmentChanged) {
            console.log('Python环境已切换，已向服务器请求更新依赖描述');
        }
        
        return result;
    } catch (error) {
        console.error('检查描述更新失败:', error);
        return { hasUpdates: false };
    }
}

/**
 * 获取依赖的可用版本历史
 * @param {string} dependency - 依赖名称
 */
export async function getPackageVersions(dependency) {
    try {
        const response = await fetch(`https://pypi.org/pypi/${dependency}/json`);
        
        if (!response.ok) {
            throw new Error(`获取版本历史失败: ${response.status}`);
        }
        
        const data = await response.json();
        const releases = data.releases || {};
        const versions = [];
        
        // 处理每个版本
        Object.keys(releases).forEach(version => {
            const releaseFiles = releases[version];
            if (releaseFiles && releaseFiles.length > 0) {
                // 获取上传日期
                const uploadTime = releaseFiles[0].upload_time;
                versions.push({
                    version: version,
                    normalizedVersion: normalizeVersion(version), // 添加标准化版本
                    uploadDate: uploadTime ? new Date(uploadTime) : null
                });
            }
        });
        
        // 按上传时间排序，最新的在前
        versions.sort((a, b) => {
            if (a.uploadDate && b.uploadDate) {
                return b.uploadDate - a.uploadDate;
            }
            return 0;
        });
        
        const latestVersion = data.info.version || null;
        
        return {
            success: true,
            versions: versions,
            latestVersion: latestVersion,
            normalizedLatestVersion: normalizeVersion(latestVersion)
        };
    } catch (error) {
        console.error('获取版本历史出错:', error);
        return { 
            success: false, 
            message: error.message,
            versions: []
        };
    }
}

/**
 * 标准化版本号用于比较
 * @param {string} version - 版本号
 * @returns {string} 标准化后的版本号
 */
function normalizeVersion(version) {
    if (!version) return '';
    
    let normalized = String(version);
    
    // 移除.postX后缀
    if (normalized.includes('.post')) {
        normalized = normalized.split('.post')[0];
    }
    
    // 移除预发布标识
    const prefixes = ['a', 'b', 'rc', 'dev', 'alpha', 'beta', 'pre'];
    for (const prefix of prefixes) {
        if (normalized.includes(`.${prefix}`)) {
            normalized = normalized.split(`.${prefix}`)[0];
        }
        if (normalized.includes(`-${prefix}`)) {
            normalized = normalized.split(`-${prefix}`)[0];
        }
    }
    
    return normalized;
}

/**
 * 更新所选依赖
 * @param {Array} packageNames - 包名称数组
 * @returns {Promise<Object>}
 */
export async function updateSelected(packageNames) {
    try {
        // 确保我们只发送包名数组，而不是包含其他信息的复杂对象
        const packagesToUpdate = Array.isArray(packageNames) ? 
            packageNames.map(pkg => typeof pkg === 'string' ? pkg : pkg.name) : 
            [];
            
        const response = await fetch('/api/update-selected', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ packages: packagesToUpdate })
        });
        
        return await response.json();
    } catch (error) {
        console.error('更新所选依赖失败:', error);
        return { success: false, message: `更新失败: ${error.message}` };
    }
}

/**
 * 安装依赖
 * @param {string} packageName - 包名称
 * @returns {Promise<Object>} 响应对象
 */
export async function installDependency(packageName) {
    try {
        // 添加正确的Content-Type头
        const response = await fetch('/api/install', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ packageName })
        });
        
        return await response.json();
    } catch (error) {
        console.error('安装依赖失败:', error);
        return { success: false, message: `安装失败: ${error.message}` };
    }
}

/**
 * 安装wheel文件
 * @param {File} wheelFile - wheel文件
 */
export async function installWhl(wheelFile) {
    const formData = new FormData();
    formData.append('file', wheelFile);
    
    // 直接使用fetch处理文件上传，而不是通过apiRequest
    const url = `${API_BASE_URL}/install-whl`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData  // 不设置headers，让浏览器自动处理multipart/form-data
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error(`安装whl文件失败:`, data.message || response.statusText);
            return { 
                success: false, 
                message: data.message || `请求失败: ${response.status}` 
            };
        }
        
        return data;
    } catch (error) {
        console.error(`API错误 [install-whl]:`, error);
        return { 
            success: false, 
            message: `操作失败: ${error.message}` 
        };
    }
}

/**
 * 安装requirements.txt文件
 * @param {File} requirementsFile - requirements.txt文件
 */
export async function installRequirements(requirementsFile) {
    const formData = new FormData();
    formData.append('file', requirementsFile);
    
    // 直接使用fetch处理文件上传，而不是通过apiRequest
    const url = `${API_BASE_URL}/install-requirements`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData  // 不设置headers，让浏览器自动处理multipart/form-data
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error(`安装requirements失败:`, data.message || response.statusText);
            return { 
                success: false, 
                message: data.message || `请求失败: ${response.status}` 
            };
        }
        
        return data;
    } catch (error) {
        console.error(`API错误 [install-requirements]:`, error);
        return { 
            success: false, 
            message: `操作失败: ${error.message}` 
        };
    }
}

/**
 * 清理PIP缓存
 * @returns {Promise<Object>} 响应对象
 */
export async function cleanPipCache() {
    try {
        const response = await fetch('/api/clean-pip-cache', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})  // 发送空对象确保格式正确
        });
        
        return await response.json();
    } catch (error) {
        console.error('清理PIP缓存失败:', error);
        return { success: false, message: `清理失败: ${error.message}` };
    }
}

/**
 * 检查所有依赖的最新版本
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<boolean>} 是否完成
 */
export async function checkLatestVersions(progressCallback) {
    try {
        const response = await fetch('/api/check-versions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`检查版本失败: ${response.status}`);
        }
        
        // 处理SSE流
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value);
            const lines = text.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.progress !== undefined && progressCallback) {
                        progressCallback(data.progress);
                    }
                    if (data.error) {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    // 忽略无法解析的行
                }
            }
        }
        
        return true;
    } catch (error) {
        console.error('检查最新版本失败:', error);
        return false;
    }
}

/**
 * 获取包版本历史
 * @param {string} packageName - 包名称
 * @returns {Promise<Object>} 版本历史数据
 */
export async function getVersionHistory(packageName) {
    try {
        // 使用PyPI API获取版本历史，也可以替换为自定义API
        const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);
        
        if (!response.ok) {
            throw new Error(`获取版本历史失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 转换数据格式
        const versions = Object.keys(data.releases).map(version => {
            const release = data.releases[version][0] || {};
            return {
                version,
                date: release.upload_time ? new Date(release.upload_time).toLocaleDateString() : '未知',
                url: release.url || '#'
            };
        });
        
        // 按版本号排序，最新的在前
        versions.sort((a, b) => {
            try {
                return -compareVersions(a.version, b.version);
            } catch (e) {
                return 0;
            }
        });
        
        return {
            name: packageName,
            versions: versions,
            latestVersion: data.info.version
        };
    } catch (error) {
        console.error('获取版本历史失败:', error);
        throw error;
    }
}

/**
 * 比较两个版本号大小
 * @param {string} v1 - 第一个版本号
 * @param {string} v2 - 第二个版本号
 * @returns {number} 比较结果，1: v1>v2, -1: v1<v2, 0: v1=v2
 */
function compareVersions(v1, v2) {
    const normalize = v => v.split(/[.-]/).map(p => isNaN(p) ? p : Number(p));
    const parts1 = normalize(v1);
    const parts2 = normalize(v2);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] === undefined ? 0 : parts1[i];
        const part2 = parts2[i] === undefined ? 0 : parts2[i];
        
        if (typeof part1 !== typeof part2) {
            return typeof part1 === 'number' ? -1 : 1;
        }
        
        if (part1 !== part2) {
            return part1 > part2 ? 1 : -1;
        }
    }
    
    return 0;
}

/**
 * 获取可用的Python环境
 * @returns {Promise<Object>} 环境信息
 */
export async function getPythonEnvironments() {
    try {
        return await apiRequest(`${API_BASE_URL}/python-environments`);
    } catch (error) {
        console.error('获取Python环境失败:', error);
        throw error;
    }
}

/**
 * 保存Python环境配置
 * @param {Object} environment - 环境配置对象
 * @returns {Promise<Object>} 响应结果
 */
export async function saveEnvironment(environment) {
    try {
        return await apiRequest(`${API_BASE_URL}/python-environments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(environment)
        });
    } catch (error) {
        console.error('保存环境配置失败:', error);
        throw error;
    }
}

/**
 * 删除Python环境
 * @param {string} environmentId - 环境ID
 * @returns {Promise<Object>} 响应结果
 */
export async function deleteEnvironment(environmentId) {
    try {
        return await apiRequest(`${API_BASE_URL}/python-environments/${environmentId}`, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error('删除环境失败:', error);
        throw error;
    }
}

/**
 * 切换到指定Python环境
 * @param {string} environmentId - 环境ID
 * @returns {Promise<Object>} 响应结果
 */
export async function switchEnvironment(environmentId) {
    try {
        return await apiRequest(`${API_BASE_URL}/switch-environment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ environmentId })
        });
    } catch (error) {
        console.error('切换环境失败:', error);
        throw error;
    }
}

/**
 * 浏览并查找可用的Python环境
 * @returns {Promise<Object>} 找到的环境列表
 */
export async function browsePythonEnvironments() {
    try {
        return await apiRequest(`${API_BASE_URL}/browse-python-env`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('浏览Python环境失败:', error);
        throw error;
    }
}

/**
 * 获取单个依赖的详细信息
 * @param {string} packageName - 包名
 * @param {boolean} forceRefresh - 是否强制刷新PyPI版本信息
 * @returns {Promise<Object>} 单个依赖的详细信息
 */
export async function getSingleDependency(packageName, forceRefresh = false) {
    try {
        const url = `${API_BASE_URL}/dependency/${encodeURIComponent(packageName)}?force_refresh=${forceRefresh}`;
        return await apiRequest(url);
    } catch (error) {
        console.error(`获取依赖 ${packageName} 信息失败:`, error);
        throw error;
    }
}

// ========== 核心业务逻辑相关函数 ==========

/**
 * 刷新依赖列表 - 核心功能
 * @param {boolean} useCache - 是否使用缓存而不检查更新
 * @param {Function} progressCallback - 进度回调函数
 * @returns {Promise<Array>} 依赖列表
 */
export async function refreshDependencies(useCache = false, progressCallback = null) {
    try {
        console.log('刷新依赖列表...');
        
        // 调用进度回调
        if (progressCallback) {
            progressCallback('start');
        }
        
        // 尝试更新加载进度（如果在初始加载过程中）
        try {
            const { updateInitialLoadingProgress } = await import('./ui-components.js');
            updateInitialLoadingProgress(40, '正在获取依赖列表...');
        } catch (e) {
            // 忽略错误，可能不是在初始加载阶段
        }
        
        // 在加载新数据前先显示加载状态
        const { showLoadingMessage } = await import('./ui-components.js');
        showLoadingMessage('刷新依赖列表...');
        
        // 调用进度回调 - 加载阶段
        if (progressCallback) {
            progressCallback('loading');
        }
        
        // 确保使用最新数据获取依赖
        const dependencies = await loadDependencies(useCache);
        
        // 更新进度
        try {
            const { updateInitialLoadingProgress } = await import('./ui-components.js');
            updateInitialLoadingProgress(60, '依赖列表加载完成');
        } catch (e) {
            // 忽略错误
        }
        
        // 调用进度回调 - 处理阶段
        if (progressCallback) {
            progressCallback('processing');
        }
        
        // 强制清空UI并完全重新渲染
        const { renderDependencyList } = await import('./ui-components.js');
        renderDependencyList(dependencies);
        
        console.log(`依赖列表已刷新，共 ${dependencies.length} 个依赖`);
        
        // 最终进度更新
        try {
            const { updateInitialLoadingProgress } = await import('./ui-components.js');
            updateInitialLoadingProgress(75, '依赖列表渲染完成');
        } catch (e) {
            // 忽略错误
        }
        
        // 调用进度回调 - 完成阶段
        if (progressCallback) {
            progressCallback('complete', dependencies.length);
        }
        
        return dependencies;
    } catch (error) {
        console.error('刷新依赖列表失败:', error);
        const { showNotification } = await import('./ui-components.js');
        showNotification('刷新依赖列表失败，请检查网络连接', 'error');
        
        // 调用进度回调 - 错误
        if (progressCallback) {
            progressCallback('error', error);
        }
        
        return [];
    }
}

/**
 * 刷新单个依赖信息 - 增量刷新功能
 * @param {string} packageName - 包名
 * @param {boolean} forceRefresh - 是否强制刷新PyPI版本信息
 * @returns {Promise<Object>} 依赖信息
 */
export async function refreshSingleDependency(packageName, forceRefresh = false) {
    try {
        console.log(`刷新单个依赖: ${packageName} (强制刷新: ${forceRefresh})`);
        
        // 添加加载状态表示
        const dependencyItem = document.querySelector(`.dependency-item[data-name="${packageName}"]`);
        if (dependencyItem) {
            dependencyItem.classList.add('refreshing');
        }
        
        // 从API获取单个依赖信息
        const dependencyInfo = await getSingleDependency(packageName, forceRefresh);
        
        if (!dependencyInfo) {
            console.log(`依赖 ${packageName} 不存在或未安装`);
            
            // 移除加载状态
            if (dependencyItem) {
                dependencyItem.classList.remove('refreshing');
            }
            
            return null;
        }
        
        // 更新DOM中的对应项
        const { updateDependencyItem } = await import('./ui-components.js');
        updateDependencyItem(dependencyInfo);
        
        // 移除加载状态
        if (dependencyItem) {
            dependencyItem.classList.remove('refreshing');
        }
        
        console.log(`依赖 ${packageName} 已刷新，版本: ${dependencyInfo.version}`);
        return dependencyInfo;
    } catch (error) {
        console.error(`刷新依赖 ${packageName} 失败:`, error);
        
        // 清理可能的加载状态
        const dependencyItem = document.querySelector(`.dependency-item[data-name="${packageName}"]`);
        if (dependencyItem) {
            dependencyItem.classList.remove('refreshing');
        }
        
        return null;
    }
}
