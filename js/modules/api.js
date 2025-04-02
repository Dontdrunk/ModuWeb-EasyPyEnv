// API模块 - 处理与后端的通信

const API_BASE_URL = 'http://127.0.0.1:8282/api';

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
 * @returns {Promise<Object>} 响应对象
 */
export async function checkDescriptionUpdates(lastUpdate) {
    try {
        const response = await fetch(`/api/check-description-updates?lastUpdate=${lastUpdate}`);
        
        if (!response.ok) {
            return { hasUpdates: false };
        }
        
        return await response.json();
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
 * @returns {Promise<Object>} 响应对象
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
